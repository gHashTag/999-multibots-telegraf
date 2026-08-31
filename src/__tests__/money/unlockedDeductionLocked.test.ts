import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Double-spend mitigation integrity (#999 CRITICAL class).
//
// Balance is a ledger SUM, not a lockable column, and no atomic deduct RPC
// exists yet (#999). The interim mitigation is `withUserBalanceLock(id, fn)`,
// which serializes balance writes per user in-process so a double-tap / callback
// redelivery / retry cannot both read the same balance and both insert a
// MONEY_OUTCOME. `updateUserBalance` applies that lock CENTRALLY (it wraps
// `updateUserBalanceUnlocked` inside the lock), so its ~53 call-sites are safe
// automatically.
//
// `updateUserBalanceUnlocked` is the escape hatch, exported ONLY for callers
// that ALREADY hold the lock for the same user (calling the locked variant from
// inside the lock would re-enter and deadlock). A caller that uses the unlocked
// variant WITHOUT holding the lock silently bypasses the mitigation for that
// path -- a direct #999 double-spend regression. This ratchet pins the
// invariant: every call to `updateUserBalanceUnlocked` is lexically inside a
// `withUserBalanceLock(...)` call.
//
// The check walks the TypeScript AST (ancestors), not a text window -- the same
// robustness lesson as #1431/#1428. A built-in self-check proves the detector
// can report "not locked" (a control that can fail).

const DEF_FILE = 'core/supabase/updateUserBalance.ts'
const TARGET = 'updateUserBalanceUnlocked'
const LOCK = 'withUserBalanceLock'

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

const calleeName = (n: ts.CallExpression): string => {
  const e = n.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return ''
}

interface Site {
  line: number
  locked: boolean
}

// Exported so the self-check can exercise it on a synthetic snippet.
export function unlockedCallSites(fileName: string, text: string): Site[] {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const sites: Site[] = []
  const hasLockAncestor = (n: ts.Node): boolean => {
    let cur: ts.Node | undefined = n.parent
    while (cur) {
      if (ts.isCallExpression(cur) && calleeName(cur) === LOCK) return true
      cur = cur.parent
    }
    return false
  }
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && calleeName(node) === TARGET) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      sites.push({ line: line + 1, locked: hasLockAncestor(node) })
    }
    node.forEachChild(visit)
  }
  visit(sf)
  return sites
}

describe('every updateUserBalanceUnlocked call is inside withUserBalanceLock (#999 double-spend)', () => {
  it('detector distinguishes locked from unlocked (control can fail)', () => {
    const snippet = [
      'declare function withUserBalanceLock(id: string, fn: () => any): any',
      'declare function updateUserBalanceUnlocked(...a: any[]): any',
      'function ok(id: string) {',
      '  return withUserBalanceLock(id, () => updateUserBalanceUnlocked(id, 1))', // locked
      '}',
      'function bad(id: string) {',
      '  return updateUserBalanceUnlocked(id, 1)', // NOT locked
      '}',
    ].join('\n')
    const sites = unlockedCallSites('synthetic.ts', snippet)
    expect(sites.map(s => s.locked)).toEqual([true, false])
  })

  const srcRoot = path.join(__dirname, '..', '..')

  // Collect all call-sites across src (the definition file is included: its
  // exported wrapper `updateUserBalance` is a legitimate locked caller).
  const allSites = walk(srcRoot).flatMap(f => {
    const text = fs.readFileSync(f, 'utf8')
    if (!text.includes(TARGET)) return []
    const rel = f
      .slice(srcRoot.length + 1)
      .split(path.sep)
      .join('/')
    return unlockedCallSites(f, text).map(s => ({ file: rel, ...s }))
  })

  it('the escape hatch still exists (matcher is not stale)', () => {
    const defText = fs.readFileSync(path.join(srcRoot, DEF_FILE), 'utf8')
    expect(defText).toContain(`export const ${TARGET}`)
    // At least the wrapper + refundUser call it; if this floor breaks the symbol
    // was renamed/removed and the invariant below would pass vacuously.
    expect(allSites.length).toBeGreaterThanOrEqual(2)
  })

  it('has no unlocked deduction (every call holds withUserBalanceLock)', () => {
    const unlocked = allSites.filter(s => !s.locked)
    expect(
      unlocked,
      `updateUserBalanceUnlocked called WITHOUT withUserBalanceLock (bypasses the ` +
        `#999 per-user double-spend serialization -- wrap it in withUserBalanceLock ` +
        `for the same user, or use the locked updateUserBalance):\n` +
        unlocked.map(s => `  ${s.file}:${s.line}`).join('\n')
    ).toEqual([])
  })
})
