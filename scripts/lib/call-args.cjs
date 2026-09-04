'use strict'
/**
 * THE ARGUMENTS OF A CALL, WHICH IS THE UNIT A LINE WINDOW STANDS IN FOR.
 *
 * Ratchets keep asking "is X passed to Y?" and keep answering it with a window:
 * take N lines (or N characters) after the call and search that text. Measured
 * across this repository's money ratchets, a window is wrong in both directions
 * at once -- narrow hides real sites behind a long comment, wide invents sites
 * out of a neighbour that merely says the word -- so no width is safer, and the
 * fix is to stop measuring width. See vibee-stack-hard-won 203.
 *
 * Pass a source already masked by blank-code: comments and string literals must
 * not be able to vote, and the entry anchor must sit on code.
 */

/**
 * Balanced argument text of every call to `name` (a regex fragment, so
 * 'videoTaskStore\\.saveTask' works as well as a bare identifier).
 *
 * A call whose parentheses never close is DROPPED rather than truncated: an
 * unbalanced tail would hand the rest of the file to one argument list, which
 * is the same over-reach as a too-wide window.
 */
function callArgs(masked, name) {
  const re = new RegExp(`(?<![A-Za-z0-9_$])${name}\\s*\\(`, 'g')
  const out = []
  for (const m of masked.matchAll(re)) {
    let i = m.index + m[0].length
    let depth = 1
    while (i < masked.length && depth > 0) {
      const c = masked[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      i++
    }
    if (depth === 0) out.push(masked.slice(m.index + m[0].length, i - 1))
  }
  return out
}

/** True when an identifier appears in `args` as a word, not as a substring. */
function argsMention(args, identifier) {
  return new RegExp(`(?<![\\w$])${identifier}(?![\\w$])`).test(args)
}

/**
 * The balanced `{ ... }` block that follows `anchor` -- a function body, when
 * the anchor is its signature.
 *
 * The alternative people reach for is `slice(start, start + N)`, and N is never
 * right: measured on the Sora handler in kie-webhook-charge, the assertion
 * passes at 6000 characters and fails at 3000, so the constant was carrying the
 * verdict. A body ends where its brace closes, and that is not a tunable.
 *
 * Returns '' when the anchor is absent or its braces never close, so a caller
 * that forgets to check gets an empty body rather than the rest of the file.
 */
function braceBody(masked, anchor) {
  const m = new RegExp(anchor).exec(masked)
  if (!m) return ''
  const open = masked.indexOf('{', m.index + m[0].length)
  if (open === -1) return ''
  let i = open
  let depth = 0
  while (i < masked.length) {
    if (masked[i] === '{') depth++
    else if (masked[i] === '}' && --depth === 0)
      return masked.slice(open, i + 1)
    i++
  }
  return ''
}

const SAMPLES = [
  { why: 'one call, one argument list', code: `f(a, b)`, name: 'f', n: 1 },
  {
    why: 'nested parens do not end the list early',
    code: `f(g(1, 2), h(3))`,
    name: 'f',
    n: 1,
    contains: 'g(1, 2), h(3)',
  },
  {
    why: 'a dotted callee is addressable',
    code: `store.saveTask(id, { modelId })`,
    name: 'store\\.saveTask',
    n: 1,
    contains: 'modelId',
  },
  {
    why: 'a longer identifier ending in the name is not the name',
    code: `notf(a)`,
    name: 'f',
    n: 0,
  },
  {
    why: 'an unbalanced call is dropped, not truncated to the end of file',
    code: `f(a, b`,
    name: 'f',
    n: 0,
  },
  { why: 'two calls are two lists', code: `f(1)\nf(2)`, name: 'f', n: 2 },
]

const BODY_SAMPLES = [
  {
    why: 'a body ends at its own closing brace, not at the next one',
    code: `function a() {\n  if (x) { y() }\n  z()\n}\nfunction b() { NOT_MINE }`,
    anchor: 'function a\\(\\)',
    contains: 'z()',
    excludes: 'NOT_MINE',
  },
  {
    why: 'an absent anchor yields nothing, not the whole file',
    code: `function a() { y() }`,
    anchor: 'function missing\\(\\)',
    empty: true,
  },
  {
    why: 'an unclosed body yields nothing, not the rest of the file',
    code: `function a() { y()`,
    anchor: 'function a\\(\\)',
    empty: true,
  },
]

function selfCheck() {
  for (const s of SAMPLES) {
    const got = callArgs(s.code, s.name)
    if (got.length !== s.n)
      throw new Error(
        `callArgs disagrees with its own sample (${s.why}): expected ${s.n}, got ${got.length}`
      )
    if (s.contains && !got[0].includes(s.contains))
      throw new Error(
        `callArgs lost part of the list (${s.why}): ${JSON.stringify(got[0])}`
      )
  }
  for (const s of BODY_SAMPLES) {
    const body = braceBody(s.code, s.anchor)
    if (s.empty && body !== '')
      throw new Error(
        `braceBody should have returned nothing (${s.why}): ${JSON.stringify(body)}`
      )
    if (s.contains && !body.includes(s.contains))
      throw new Error(`braceBody lost the body (${s.why})`)
    if (s.excludes && body.includes(s.excludes))
      throw new Error(`braceBody ran past the end of the body (${s.why})`)
  }
  return true
}

module.exports = {
  callArgs,
  argsMention,
  braceBody,
  SAMPLES,
  BODY_SAMPLES,
  selfCheck,
}
