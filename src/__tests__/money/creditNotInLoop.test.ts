import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Credit-in-loop mint class (#1468 / #1470). A user credit inside a loop that
// pays out a single SCALAR amount (e.g. ctx.session.paymentAmount) is a mint:
// the loop multiplies the scalar credit by the iteration count. #1468 was
// cancelPredictionsWizard calling refundUser once per cancelled prediction.
//
// This ratchet pins the whole class: neither a refund (refundUser/refundAndTell)
// nor a raw credit (updateUserBalance with a MONEY_INCOME argument) may be called
// inside a for/while/of/in or a .forEach/.map/.filter callback. A NEW one fails
// until reviewed -- move it out of the loop (fire once), or ALLOWLIST it when the
// amount is genuinely per-item.
//
// Scope: live code. src/scripts is excluded -- those are one-off admin batch
// tools (e.g. fix-robokassa-missing-stars) where a per-record credit is correct.
// setPayments is NOT checked: it also creates PENDING invoices (no balance
// change until confirmed), so an in-loop setPayments is not necessarily a credit.
//
// AST ancestor walk (not a text window) -- the robustness lesson of #1431/#1432.

const REFUND_FNS = new Set(['refundUser', 'refundAndTell'])
const LOOP_METHODS = new Set(['forEach', 'map', 'filter'])
// Files with a GENUINELY per-item credit inside a loop, reviewed and allowed.
// Keyed by file -> the exact number of in-loop credits expected there, so a NEW
// in-loop credit added to an allowlisted file still fails (count mismatch).
const ALLOWLIST: Record<string, { count: number; reason: string }> = {
  'services/generateTextToImageDirect.ts': {
    count: 2,
    reason:
      'per-image refund: the loop is over num_images (user paid costPerImage * num_images up front); it refunds costPerImage for the specific failed image, and the un-attempted (num_images-1) when the first image aborts -- per-item, not a scalar total',
  },
}

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (e.name === 'scripts' || e.name === '__tests__') return []
      return walk(p)
    }
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

const calleeName = (n: ts.CallExpression): string => {
  const e = n.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return ''
}

// A credit call: a refund, or updateUserBalance whose args mention MONEY_INCOME.
function isCreditCall(n: ts.CallExpression, sf: ts.SourceFile): boolean {
  const name = calleeName(n)
  if (REFUND_FNS.has(name)) return true
  if (name === 'updateUserBalance') {
    return n.arguments.some(a => /MONEY_INCOME/.test(a.getText(sf)))
  }
  return false
}

interface Site {
  line: number
  inLoop: boolean
}

// Exported so the self-check can exercise it on a synthetic snippet.
export function creditSites(fileName: string, text: string): Site[] {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
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
    if (ts.isCallExpression(node) && isCreditCall(node, sf)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      sites.push({ line: line + 1, inLoop: insideLoop(node) })
    }
    node.forEachChild(visit)
  }
  visit(sf)
  return sites
}

describe('user credits are not called inside a loop (scalar-credit mint #1468/#1470)', () => {
  it('detector distinguishes in-loop from out-of-loop, and MONEY_INCOME from OUTCOME (control can fail)', () => {
    const snippet = [
      'function a(ctx: any, items: any[]) {',
      '  refundUser(ctx, 10)', // out of loop -> ok
      '  for (const it of items) {',
      '    refundUser(ctx, 10)', // in a for-of -> flagged
      '    updateUserBalance(id, 5, PaymentType.MONEY_INCOME)', // credit in loop -> flagged
      '    updateUserBalance(id, 5, PaymentType.MONEY_OUTCOME)', // a CHARGE, not a credit -> ignored
      '  }',
      '  items.forEach(() => refundAndTell(ctx, 5))', // in a forEach -> flagged
      '}',
    ].join('\n')
    const sites = creditSites('synthetic.ts', snippet)
    expect(sites.map(s => s.inLoop)).toEqual([false, true, true, true])
  })

  const srcRoot = path.join(__dirname, '..', '..')
  const all = walk(srcRoot).flatMap(f =>
    creditSites(f, fs.readFileSync(f, 'utf8')).map(s => ({
      file: f.slice(srcRoot.length + 1),
      ...s,
    }))
  )

  it('finds credit call-sites across live code (matcher is not stale)', () => {
    expect(all.length).toBeGreaterThan(15)
  })

  it('no unreviewed credit is inside a loop (would mint a scalar amount N times)', () => {
    const inLoopByFile = new Map<string, number>()
    for (const s of all.filter(s => s.inLoop)) {
      inLoopByFile.set(s.file, (inLoopByFile.get(s.file) || 0) + 1)
    }
    const unexpected: string[] = []
    for (const [file, count] of inLoopByFile) {
      const allowed = ALLOWLIST[file]
      if (!allowed) {
        unexpected.push(`${file}: ${count} in-loop credit(s), not allowlisted`)
      } else if (allowed.count !== count) {
        unexpected.push(
          `${file}: ${count} in-loop credit(s), allowlist expects ${allowed.count} -- a new one was added`
        )
      }
    }
    expect(
      unexpected,
      `A user credit (refundUser/refundAndTell/updateUserBalance MONEY_INCOME) ` +
        `is inside a loop -- a scalar amount would be paid out once PER iteration ` +
        `(mint, #1468). Move it OUT of the loop (fire once), or ALLOWLIST the file ` +
        `with the correct count if the amount is genuinely per-item:\n` +
        unexpected.join('\n')
    ).toEqual([])
  })

  it('every ALLOWLIST file still has in-loop credits at the expected count (not stale)', () => {
    const inLoopByFile = new Map<string, number>()
    for (const s of all.filter(s => s.inLoop)) {
      inLoopByFile.set(s.file, (inLoopByFile.get(s.file) || 0) + 1)
    }
    const stale = Object.entries(ALLOWLIST).filter(
      ([file, a]) => (inLoopByFile.get(file) || 0) !== a.count
    )
    expect(
      stale.map(([f]) => f),
      'these ALLOWLIST files no longer have the expected in-loop credit count -- update or remove them'
    ).toEqual([])
  })
})
