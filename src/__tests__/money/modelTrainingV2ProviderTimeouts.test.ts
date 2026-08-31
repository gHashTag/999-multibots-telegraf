/**
 * Ratchet: modelTrainingV2 bounds its post-charge provider calls with a timeout.
 *
 * modelTrainingV2 charges the user in the 'check-balance' step (processBalance-
 * Operation inserts a MONEY_OUTCOME row) BEFORE the try block, and its ONLY
 * refund path is the outer catch's 'refund-balance' step -- reached solely by a
 * thrown error. Two provider calls run inside that try:
 *   - encodeFileToBase64's axios.get(zipUrl) -- axios default timeout is 0
 *     (infinite), so a half-open/silent host hangs forever and never throws.
 *   - the BFL finetune fetch() -- no signal means it relies only on undici's
 *     header timeout.
 * A silent hang produces no throw, so the refund never runs and the user is
 * left charged with no model (charged-not-delivered, indefinitely).
 *
 * The fix bounds both: axios.get gets an explicit `timeout`, and the fetch gets
 * an AbortSignal.timeout. On a hang they throw, the existing refund-balance step
 * runs, and the user is made whole. This pins both guards on this money path.
 *
 * loop-fable iter203 (wave-8 provider-call-no-timeout lens). Fail-fast -> the
 * EXISTING refund fires; it never mints stars, so it is autonomous-safe.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../inngest_app/functions/training/modelTrainingV2.ts'
)

/** An object-literal argument has a property named `name`. */
function argHasProp(call: ts.CallExpression, name: string): boolean {
  for (const arg of call.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue
    for (const p of arg.properties) {
      if (
        (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
        p.name &&
        ts.isIdentifier(p.name) &&
        p.name.text === name
      ) {
        return true
      }
    }
  }
  return false
}

function analyze(source: string): {
  axiosGets: number
  axiosGetsWithTimeout: number
  bflFetches: number
  bflFetchesWithSignal: number
} {
  const sf = ts.createSourceFile('m.ts', source, ts.ScriptTarget.Latest, true)
  let axiosGets = 0
  let axiosGetsWithTimeout = 0
  let bflFetches = 0
  let bflFetchesWithSignal = 0
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const c = n.expression
      // axios.get(...)
      if (
        ts.isPropertyAccessExpression(c) &&
        ts.isIdentifier(c.expression) &&
        c.expression.text === 'axios' &&
        c.name.text === 'get'
      ) {
        axiosGets++
        if (argHasProp(n, 'timeout')) axiosGetsWithTimeout++
      }
      // fetch('...bfl.ai...', {...})
      if (
        ts.isIdentifier(c) &&
        c.text === 'fetch' &&
        n.arguments.length >= 1 &&
        ts.isStringLiteral(n.arguments[0]) &&
        n.arguments[0].text.includes('bfl.ai')
      ) {
        bflFetches++
        if (argHasProp(n, 'signal')) bflFetchesWithSignal++
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { axiosGets, axiosGetsWithTimeout, bflFetches, bflFetchesWithSignal }
}

describe('modelTrainingV2 bounds its post-charge provider calls (no charged-not-delivered hang)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the two calls this ratchet guards must still exist.
  it('still has the axios.get download and the BFL fetch this ratchet guards', () => {
    expect(a.axiosGets).toBeGreaterThanOrEqual(1)
    expect(a.bflFetches).toBeGreaterThanOrEqual(1)
  })

  it('every axios.get has an explicit timeout', () => {
    expect(a.axiosGetsWithTimeout).toBe(a.axiosGets)
  })

  it('the BFL finetune fetch has an AbortSignal timeout', () => {
    expect(a.bflFetchesWithSignal).toBe(a.bflFetches)
  })

  it('self-check: the analyzer flags an axios.get with no timeout', () => {
    const bad = `import axios from 'axios'
      async function f(u){ const r = await axios.get(u, { responseType: 'arraybuffer' }); return r }`
    const r = analyze(bad)
    expect(r.axiosGets).toBe(1)
    expect(r.axiosGetsWithTimeout).toBe(0)
  })
})
