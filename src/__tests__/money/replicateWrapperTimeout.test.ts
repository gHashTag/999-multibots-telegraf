/**
 * Ratchet: the shared replicate.run wrapper bounds client.run with a timeout, so
 * no caller can hang forever on a stuck prediction.
 *
 * client.run polls the prediction until it settles; a prediction stuck in
 * starting/processing polls indefinitely. ~11 image/photo services (Gemini,
 * FluxKontextPro/Max, Qwen(+Plus), NanoBanana(+ProReplicate), SeedEdit3,
 * Seedream45Replicate, TextToImageDirect, neuroPhotoDirect's fallback) charge the
 * user BEFORE this await, so an infinite hang strands the payment (their refund
 * is in a catch, unreachable without a throw). Bounding client.run at the shared
 * wrapper throws into every caller's existing error/refund path at once -- the
 * charged-not-delivered-on-hang class (#1523/#1582) closed centrally, found by
 * the iter231 timeout-sweep generalising the wave-2 charge-then-bare-provider
 * lens (which surfaced only imageUpscaler + neuroPhotoDirect; the sweep found
 * the whole family).
 *
 * Structural (AST): client.run must sit inside a Promise.race. floor (still
 * delegates to client.run) + self-check + real-source mutation.
 *
 * loop-fable iter231.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../core/replicate/index.ts')

/** Is `n` a call to `client.run(...)`? */
function isClientRun(n: ts.Node): n is ts.CallExpression {
  return (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === 'client' &&
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

function analyze(source: string): { runCalls: number; unbounded: number } {
  const sf = ts.createSourceFile(
    'replicate.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let runCalls = 0
  let unbounded = 0
  const visit = (n: ts.Node): void => {
    if (isClientRun(n)) {
      runCalls++
      if (!insidePromiseRace(n)) unbounded++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { runCalls, unbounded }
}

describe('shared replicate.run wrapper bounds client.run with a timeout', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the wrapper still delegates to client.run', () => {
    expect(a.runCalls).toBeGreaterThanOrEqual(1)
  })

  it('every client.run is bounded by a Promise.race timeout', () => {
    expect(
      a.unbounded,
      `The shared replicate.run wrapper calls client.run without a Promise.race ` +
        `timeout. A stuck prediction hangs forever, and callers that charge before ` +
        `the await are stranded (refund unreachable). Wrap client.run in Promise.race ` +
        `with a reject-timer.`
    ).toBe(0)
  })

  it('self-check: detector distinguishes a bare client.run from a raced one', () => {
    const bad = `const replicate = { run: async (...a) => { const client = c(); return await client.run(...a) } }`
    const good = `const replicate = { run: async (...a) => {
      const client = c()
      return await Promise.race([
        client.run(...a),
        new Promise((_, r) => setTimeout(() => r(new Error('t')), 1000)),
      ])
    } }`
    expect(analyze(bad).unbounded).toBe(1)
    expect(analyze(good).unbounded).toBe(0)
  })

  it('mutation: unwrapping the real Promise.race turns the check RED', () => {
    const mutated = source.replace(
      /Promise\.race\(\[\s*(client\.run\(\.\.\.args\))[\s\S]*?\]\)/,
      '$1'
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).unbounded).toBeGreaterThan(0)
  })
})
