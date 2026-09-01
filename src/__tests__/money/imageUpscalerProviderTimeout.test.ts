/**
 * Ratchet: imageUpscaler bounds its post-charge replicate.run with a timeout, so
 * a stuck prediction cannot strand a charged user with nothing delivered.
 *
 * upscaleImage charges the user (processBalanceOperation, MONEY_OUTCOME) and only
 * then awaits replicate.run('clarity-upscaler'), which polls the prediction until
 * it settles. A prediction stuck in 'starting'/'processing' polls forever; the
 * refund lives in the catch below and is unreachable without a throw, so the
 * charge stands with nothing delivered (charged-not-delivered on a hang -- the
 * class #1523 closed for modelTrainingV2). Found by the iter230 wave-2 fresh-lens
 * hunt (charge-then-bare-provider lens), adversarially + hand verified (the
 * refund reconciles to the same upscaleCost the charge used, so a timeout that
 * throws into it is balance-neutral).
 *
 * This pins it: the replicate.run call must be wrapped in a Promise.race (the
 * timeout). floor (the charge still precedes it) + self-check + real-source
 * mutation.
 *
 * loop-fable iter230.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../services/imageUpscaler.ts')

/** Is `n` a call to `replicate.run(...)`? */
function isReplicateRun(n: ts.Node): n is ts.CallExpression {
  return (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === 'replicate' &&
    n.expression.name.text === 'run'
  )
}

/** Does `n` have an ancestor call to `Promise.race(...)`? */
function insidePromiseRace(n: ts.Node): boolean {
  let a: ts.Node | undefined = n.parent
  while (a) {
    if (
      ts.isCallExpression(a) &&
      ts.isPropertyAccessExpression(a.expression) &&
      ts.isIdentifier(a.expression.expression) &&
      a.expression.expression.text === 'Promise' &&
      a.expression.name.text === 'race'
    ) {
      return true
    }
    a = a.parent
  }
  return false
}

function analyze(source: string): {
  charges: boolean
  runCalls: number
  unbounded: number
} {
  const sf = ts.createSourceFile(
    'imageUpscaler.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let charges = false
  let runCalls = 0
  let unbounded = 0
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'processBalanceOperation'
    ) {
      charges = true
    }
    if (isReplicateRun(n)) {
      runCalls++
      if (!insidePromiseRace(n)) unbounded++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { charges, runCalls, unbounded }
}

describe('imageUpscaler bounds its post-charge replicate.run with a timeout', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the service still charges and still calls replicate.run', () => {
    expect(a.charges).toBe(true)
    expect(a.runCalls).toBeGreaterThanOrEqual(1)
  })

  it('every replicate.run is bounded by a Promise.race timeout', () => {
    expect(
      a.unbounded,
      `imageUpscaler awaits replicate.run without a Promise.race timeout after ` +
        `charging the user. A stuck prediction polls forever and the refund in the ` +
        `catch is unreachable -- the user is charged with nothing delivered. Wrap ` +
        `the call in Promise.race with a reject-timer so a hang throws into the refund.`
    ).toBe(0)
  })

  it('self-check: detector distinguishes a bare run from a raced run', () => {
    const bad = `async function f() { const o = await replicate.run('m', { input }) }`
    const good = `async function f() {
      const o = await Promise.race([
        replicate.run('m', { input }),
        new Promise((_, r) => setTimeout(() => r(new Error('t')), 1000)),
      ])
    }`
    expect(analyze(bad).unbounded).toBe(1)
    expect(analyze(good).unbounded).toBe(0)
  })

  it('mutation: unwrapping the real Promise.race turns the check RED', () => {
    // Replace `Promise.race([ replicate.run(...), <timer> ])` with a bare
    // `replicate.run(...)` and confirm a run becomes unbounded.
    const mutated = source.replace(
      /Promise\.race\(\[\s*(replicate\.run\([\s\S]*?\}\s*\))\s*,[\s\S]*?\]\)/,
      '$1'
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).unbounded).toBeGreaterThan(0)
  })
})
