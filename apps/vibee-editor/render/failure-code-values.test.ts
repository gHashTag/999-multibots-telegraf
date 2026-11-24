import { describe, it, expect } from 'vitest'
import { codeValues } from './failure-code-values'

/*
 * The extractor every failure-code contract reads the server with. Each shape
 * here once set a code a contract did not see (see failure-code-values.ts).
 */
describe('codeValues', () => {
  it('reads a bare literal', () => {
    expect(codeValues("a({ code: 'sign_in' })")).toEqual({
      found: ['sign_in'],
      opaque: [],
    })
  })

  it('reads a digit code', () => {
    expect(codeValues("a({ code: 't27_scope' })")).toEqual({
      found: ['t27_scope'],
      opaque: [],
    })
  })

  it('reads both branches of a ternary, not its condition', () => {
    expect(
      codeValues("a({ code: emptyFrom.length ? 'no_answer' : 'model_failed' })")
    ).toEqual({ found: ['no_answer', 'model_failed'], opaque: [] })
  })

  it('names a variable, a shorthand and a member', () => {
    expect(
      codeValues(
        'a({ code: reason, x })\nb({ x, code })\nc({ code: gate.code })'
      ).opaque
    ).toEqual(['reason', 'gate.code', 'code'])
  })

  it('names the variable beside a literal fallback', () => {
    expect(codeValues("a({ code: reason ?? 'internal' })")).toEqual({
      found: ['internal'],
      opaque: ['reason'],
    })
    expect(codeValues("a({ code: c ? reason : 'internal' })")).toEqual({
      found: ['internal'],
      opaque: ['reason'],
    })
  })

  it('reads a value Prettier moved to the next line', () => {
    expect(codeValues('a({\n  code:\n    someVar,\n})').opaque).toEqual([
      'someVar',
    ])
  })

  it('ignores numbers and a type annotation', () => {
    expect(codeValues("a({ code: -32001 })\ntype T = { code?: 'x' }")).toEqual({
      found: [],
      opaque: [],
    })
  })

  it('names a literal no client map can key, instead of dropping it', () => {
    // Review of #3369: these read as "no codes, all known" and passed.
    expect(codeValues("a({ code: 'bad-amount' })").opaque).toEqual([
      "'bad-amount'",
    ])
    expect(codeValues('a({ code: "sign_in" })').opaque).toEqual(['"sign_in"'])
    expect(codeValues("a({ code: 'Sign_in' })").opaque).toEqual(["'Sign_in'"])
    // A template is cut at its `}`, so only its parts are named -- loudly.
    const t = codeValues('a({ code: `x_${n}` })')
    expect(t.found).toEqual([])
    expect(t.opaque.length).toBeGreaterThan(0)
    expect(codeValues("a({ code: ok ? 'x' : 'step-limit' })")).toEqual({
      found: ['x'],
      opaque: ["'step-limit'"],
    })
  })
})
