/**
 * Ratchet: generateNeuroPhotoDirect bounds its fal.subscribe calls with a
 * timeout, so a stuck flux-lora job cannot hang forever on the charged flagship
 * path.
 *
 * The user is charged (directPaymentProcessor, MONEY_OUTCOME) BEFORE generation.
 * The primary path awaits fal.subscribe('fal-ai/flux-lora') -- both the default
 * LoRA (generateImageWithFalAndLora) and the user-model LoRA
 * (generateImageWithUserModelLora) -- and the fal queue polls with no
 * client-side max wait. An infinite hang strands the payment (the caller's
 * falError handler that falls back to Replicate / refunds is unreachable without
 * a throw). Found by the iter231 timeout-sweep (the wave-2 charge-then-bare-
 * provider lens flagged neuroPhotoDirect; its replicate fallback is covered by
 * the shared-wrapper backstop #1584, this pins the fal primary path).
 *
 * Structural (AST): every fal.subscribe call must be inside falSubscribeWithTimeout
 * or a Promise.race. floor (still calls fal.subscribe) + self-check + mutation.
 *
 * loop-fable iter231.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../services/generateNeuroPhotoDirect.ts'
)

/** Is `n` a call to `fal.subscribe(...)`? */
function isFalSubscribe(n: ts.Node): n is ts.CallExpression {
  return (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === 'fal' &&
    n.expression.name.text === 'subscribe'
  )
}

/** Does `n` have an ancestor call to falSubscribeWithTimeout(...) or Promise.race(...)? */
function insideTimeout(n: ts.Node): boolean {
  let a: ts.Node | undefined = n.parent
  while (a) {
    if (ts.isCallExpression(a)) {
      const e = a.expression
      if (ts.isIdentifier(e) && e.text === 'falSubscribeWithTimeout')
        return true
      if (
        ts.isPropertyAccessExpression(e) &&
        ts.isIdentifier(e.expression) &&
        e.expression.text === 'Promise' &&
        e.name.text === 'race'
      ) {
        return true
      }
    }
    a = a.parent
  }
  return false
}

function analyze(source: string): { subs: number; unbounded: number } {
  const sf = ts.createSourceFile(
    'neuroPhotoDirect.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let subs = 0
  let unbounded = 0
  const visit = (n: ts.Node): void => {
    if (isFalSubscribe(n)) {
      subs++
      if (!insideTimeout(n)) unbounded++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { subs, unbounded }
}

describe('generateNeuroPhotoDirect bounds its fal.subscribe with a timeout', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the flagship path still calls fal.subscribe', () => {
    expect(a.subs).toBeGreaterThanOrEqual(1)
  })

  it('every fal.subscribe is bounded by a timeout', () => {
    expect(
      a.unbounded,
      `generateNeuroPhotoDirect awaits fal.subscribe without a timeout after ` +
        `charging the user. A stuck flux-lora job hangs forever and strands the ` +
        `payment. Wrap it in falSubscribeWithTimeout (or Promise.race).`
    ).toBe(0)
  })

  it('self-check: detector distinguishes a bare fal.subscribe from a bounded one', () => {
    const bad = `async function f() { const r = await fal.subscribe('m', { input }) }`
    const good = `async function f() { const r = await falSubscribeWithTimeout(fal.subscribe('m', { input })) }`
    const race = `async function f() { const r = await Promise.race([fal.subscribe('m', {}), t]) }`
    expect(analyze(bad).unbounded).toBe(1)
    expect(analyze(good).unbounded).toBe(0)
    expect(analyze(race).unbounded).toBe(0)
  })

  it('mutation: unwrapping a real falSubscribeWithTimeout turns the check RED', () => {
    const mutated = source.replace(
      /falSubscribeWithTimeout\(\s*(fal\.subscribe\([\s\S]*?\}\s*\))\s*\)/,
      '$1'
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).unbounded).toBeGreaterThan(0)
  })
})
