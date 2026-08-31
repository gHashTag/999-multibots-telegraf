import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Refund-in-loop mint class (#1468). refundUser(ctx, ctx.session.paymentAmount)
// was called INSIDE a cancel loop, so a single scalar session payment paid out
// once per matching iteration -- a refund-mint (the loop multiplies a scalar
// credit). A refund/credit must fire ONCE per user operation, not per loop item
// (unless the amount is genuinely per-item, which none are today). This ratchet
// pins the class: refundUser / refundAndTell must not be called inside a
// for/while/forEach/map. A NEW one fails until reviewed (move it out of the loop,
// or register it with why the per-item amount is correct).
//
// AST ancestor check (not a text window) -- the robustness lesson of #1431/#1432.

const REFUND_FNS = new Set(['refundUser', 'refundAndTell'])

// Loop calls (.forEach/.map/.filter with a callback) and for/while statements.
const LOOP_METHODS = new Set(['forEach', 'map', 'filter'])

// { file:line -> ok } allowlist for a genuinely per-item refund (none today).
const ALLOWLIST: Record<string, string> = {}

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
  inLoop: boolean
}

// Exported so the self-check can exercise it on a synthetic snippet.
export function refundSites(fileName: string, text: string): Site[] {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const sites: Site[] = []
  const insideLoop = (n: ts.Node): boolean => {
    let cur: ts.Node | undefined = n.parent
    while (cur) {
      if (
        ts.isForStatement(cur) ||
        ts.isForOfStatement(cur) ||
        ts.isForInStatement(cur) ||
        ts.isWhileStatement(cur) ||
        ts.isDoStatement(cur)
      ) {
        return true
      }
      if (
        ts.isCallExpression(cur) &&
        ts.isPropertyAccessExpression(cur.expression) &&
        LOOP_METHODS.has(cur.expression.name.text)
      ) {
        return true
      }
      cur = cur.parent
    }
    return false
  }
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && REFUND_FNS.has(calleeName(node))) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      sites.push({ line: line + 1, inLoop: insideLoop(node) })
    }
    node.forEachChild(visit)
  }
  visit(sf)
  return sites
}

describe('refundUser/refundAndTell are not called inside a loop (refund-mint #1468)', () => {
  it('detector distinguishes in-loop from out-of-loop (control can fail)', () => {
    const snippet = [
      'function a(ctx: any, items: any[]) {',
      '  refundUser(ctx, 10)', // out of loop
      '  for (const it of items) {',
      '    refundUser(ctx, 10)', // in a for-of loop
      '  }',
      '  items.forEach(() => refundAndTell(ctx, 5))', // in a forEach
      '}',
    ].join('\n')
    const got = refundSites('synthetic.ts', snippet).map(s => s.inLoop)
    expect(got).toEqual([false, true, true])
  })

  const scenesRoot = path.join(__dirname, '..', '..', 'scenes')
  const all = walk(scenesRoot).flatMap(f =>
    refundSites(f, fs.readFileSync(f, 'utf8')).map(s => ({
      file: f.slice(scenesRoot.length + 1),
      ...s,
    }))
  )

  it('finds refund call-sites (matcher is not stale)', () => {
    expect(all.length).toBeGreaterThan(10)
  })

  it('no refund is inside a loop (would mint a scalar payment N times)', () => {
    const inLoop = all
      .filter(s => s.inLoop)
      .filter(s => !(`${s.file}:${s.line}` in ALLOWLIST))
    expect(
      inLoop,
      `refundUser/refundAndTell inside a loop -- a single scalar payment is paid ` +
        `out once PER iteration (refund-mint, #1468). Move the refund OUT of the ` +
        `loop (fire once), or add to ALLOWLIST if the amount is genuinely ` +
        `per-item:\n` +
        inLoop.map(s => `  ${s.file}:${s.line}`).join('\n')
    ).toEqual([])
  })
})
