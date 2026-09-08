import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/*
 * "COULD NOT ENUMERATE" AND "CANNOT BE LOADED HERE" ARE DIFFERENT FACTS.
 *
 * The gate printed the first for both, and spent a day reporting
 * provider-registry.test.ts as an unexplained loss of 18 test names. The whole
 * reason is that io-ts cannot resolve fp-ts on this machine -- an install, not
 * a deleted test. Somebody reading that line goes looking for the commit that
 * removed the tests, and there is none.
 *
 * The reason was in stderr the whole time, and stderr was piped to nowhere.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { missingModuleFrom } = require('../../../scripts/test-gate.cjs')
const SRC = fs.readFileSync(
  path.join(process.cwd(), 'scripts/test-gate.cjs'),
  'utf8'
)

describe('the gate says why a file produced no tests', () => {
  it('names the module a CommonJS loader could not find', () => {
    expect(
      missingModuleFrom("Error: Cannot find module 'fp-ts/lib/Either'")
    ).toBe('fp-ts/lib/Either')
  })

  it('names it in the ESM wording too, which is a different sentence', () => {
    expect(
      missingModuleFrom("Cannot find package 'undici' imported from x.ts")
    ).toBe('undici')
  })

  it('claims nothing when the failure is not a missing module', () => {
    // A syntax error is a real loss of tests and must not be excused as an
    // install problem; this is the half that keeps the excuse narrow.
    expect(missingModuleFrom('SyntaxError: unexpected token')).toBeNull()
    expect(missingModuleFrom(undefined)).toBeNull()
    expect(missingModuleFrom('')).toBeNull()
  })

  it('actually captures stderr, rather than discarding it as before', () => {
    // The bug was not the parsing, it was that stderr went to 'ignore'. A
    // perfect extractor over a discarded stream returns null forever.
    const at = SRC.indexOf('function collectedNames')
    const block = SRC.slice(at, at + 900)
    expect(block).toContain("stdio: ['ignore', 'pipe', 'pipe']")
    expect(block).not.toContain("stdio: ['ignore', 'pipe', 'ignore']")
  })

  it('passes the reason through to the report instead of a fixed sentence', () => {
    expect(SRC).toContain('unknown.push([file, ids, why])')
  })
})
