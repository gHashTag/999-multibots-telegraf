/**
 * Ratchet: every money mutation inside an Inngest function must be wrapped in
 * step.run(...).
 *
 * Inngest delivers at-least-once and RETRIES a function on failure. Inngest
 * memoizes completed steps in its journal: a step.run(...) that already
 * succeeded is replayed from the journal on retry, NOT re-executed. So a
 * balance charge/refund placed inside step.run() runs exactly once across
 * retries; the SAME call left bare in the function body re-executes on every
 * retry -> double-charge / double-refund (money loss with no cap).
 *
 * Today all 6 money-mutation call sites in src/inngest_app/functions are inside
 * a step.run (charge-user-balance, refund-user-balance, refund-balance,
 * refund-user, ...). Nothing pins them there: moving one out of step.run would
 * silently reintroduce the double-money bug with no failing test. This ratchet
 * pins the invariant.
 *
 * Scope: src/inngest_app/functions/** only (Inngest handlers). Helpers under
 * inngest_app/services are wrapped by their callers and are out of scope. A
 * legit future helper-indirection pattern (a money mutation in a helper called
 * from step.run) would fail this and should be allowlisted after review --
 * failing toward review is the right posture for a money-idempotency gate.
 *
 * See loop-fable iter191.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FUNCTIONS_DIR = path.resolve(__dirname, '../../inngest_app/functions')

const MONEY_MUTATIONS = new Set([
  'updateUserBalance',
  'refundUser',
  'refundAndTell',
])

interface Site {
  file: string
  line: number
  fn: string
  inStepRun: boolean
}

/** Does an ancestor of `n` represent a `step.run(...)` call? */
function insideStepRun(n: ts.Node): boolean {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (
      ts.isCallExpression(c) &&
      ts.isPropertyAccessExpression(c.expression) &&
      c.expression.name.text === 'run'
    ) {
      const obj = c.expression.expression
      const objName = ts.isIdentifier(obj)
        ? obj.text
        : ts.isPropertyAccessExpression(obj)
          ? obj.name.text
          : ''
      if (objName === 'step') return true
    }
    c = c.parent
  }
  return false
}

function calleeName(n: ts.CallExpression): string {
  const e = n.expression
  return ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? e.name.text
      : ''
}

function analyzeSource(fileLabel: string, source: string): Site[] {
  const sf = ts.createSourceFile(
    fileLabel,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const sites: Site[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && MONEY_MUTATIONS.has(calleeName(n))) {
      sites.push({
        file: fileLabel,
        line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        fn: calleeName(n),
        inStepRun: insideStepRun(n),
      })
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return sites
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return listFiles(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })
}

function analyzeAll(): Site[] {
  return listFiles(FUNCTIONS_DIR).flatMap(f =>
    analyzeSource(path.relative(FUNCTIONS_DIR, f), fs.readFileSync(f, 'utf8'))
  )
}

describe('inngest money mutations are inside step.run (retry-idempotent)', () => {
  const sites = analyzeAll()

  it('self-check: the detector distinguishes step.run from bare mutations', () => {
    const wrapped = `
      export const fn = inngest.createFunction({ id: 'x' }, { event: 'e' }, async ({ step }) => {
        await step.run('refund', async () => {
          await updateUserBalance(id, amt, PaymentType.MONEY_INCOME, 'r')
        })
      })
    `
    const bare = `
      export const fn = inngest.createFunction({ id: 'x' }, { event: 'e' }, async ({ step }) => {
        await updateUserBalance(id, amt, PaymentType.MONEY_INCOME, 'r')
      })
    `
    expect(analyzeSource('w.ts', wrapped).map(s => s.inStepRun)).toEqual([true])
    expect(analyzeSource('b.ts', bare).map(s => s.inStepRun)).toEqual([false])
  })

  it('matcher is not stale: finds every money-mutation site (>= 6)', () => {
    expect(sites.length).toBeGreaterThanOrEqual(6)
  })

  it('every money mutation in inngest functions is wrapped in step.run', () => {
    const bare = sites.filter(s => !s.inStepRun)
    expect(
      bare,
      `An Inngest function mutates balance outside step.run: ` +
        `${bare.map(s => `${s.file}:${s.line} ${s.fn}`).join(', ')}. Inngest ` +
        `retries at-least-once; a bare charge/refund re-executes on retry ` +
        `(double-money). Wrap it in step.run() so the journal memoizes it.`
    ).toEqual([])
  })
})
