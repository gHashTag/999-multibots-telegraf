'use strict'
/**
 * WHERE THIS REPOSITORY CREDITS A USER.
 *
 * A credit creates money: a replay double-credits, a forged payload mints, an
 * amount taken from untrusted input mints as much as it likes. The census in
 * src/__tests__/money/creditSiteCensus.test.ts exists so that a NEW credit site
 * cannot arrive without someone reviewing it for idempotency and authenticity.
 *
 * Its first matcher tested a LINE for `updateUserBalance(` and then searched the
 * next EIGHT LINES for MONEY_INCOME. Measured, that spelling was wrong in four
 * separate ways at once:
 *
 *   window too narrow  a twelve-line comment between the call and its
 *                      PaymentType hid TWO training credit sites, one of them
 *                      LIVE (modelTrainingV2 is registered in registerFunctions)
 *   window too wide    at 40 lines it invented three credits that are not
 *                      there -- a charge whose neighbour merely says the word
 *   raw text           a comment counted as a credit; the census worked around
 *                      that by EXCLUDING the primitive's own file rather than
 *                      masking, so the workaround hid the defect
 *   one spelling only  a credit typed PaymentType.REFUND was invisible, and one
 *                      of those (aiCoverWizard) is a live, registered scene
 *
 * The unit here is the CALL, not a window: the balanced argument list of each
 * updateUserBalance call, read from a source masked through blank-code so that
 * comments and string literals cannot vote. That removes the window in both
 * directions at once -- there is no number left to tune.
 *
 * ONE HOP OF INDIRECTION IS FOLLOWED. refundAndTell passes its type through a
 * local (`const type = params.type ?? PaymentType.MONEY_INCOME`), so the literal
 * never appears in the argument list. The old matcher "found" that file anyway,
 * but only because a COMMENT above it happened to contain the word -- a real
 * site caught for a false reason, which is indistinguishable from luck.
 */

const fs = require('fs')
const path = require('path')
const { blank } = require('./blank-code.cjs')

/** Both spellings of a credit. A refund mints exactly as hard as a top-up. */
const CREDIT_TYPES = ['MONEY_INCOME', 'REFUND']

const CREDIT_RE = new RegExp(`PaymentType\\.(${CREDIT_TYPES.join('|')})\\b`)
const PRIMITIVES = ['updateUserBalance', 'updateUserBalanceUnlocked']

/** The balanced argument text of every call to `name` in a masked source. */
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
    // An unbalanced tail means the parse lost the end of the call; counting it
    // would attribute the rest of the file to this one argument list.
    if (depth === 0) out.push(masked.slice(m.index + m[0].length, i - 1))
  }
  return out
}

/** Locals bound to a credit PaymentType, so one hop of indirection resolves. */
function creditBoundLocals(masked) {
  const names = new Set()
  const decl = new RegExp(
    `(?:const|let)\\s+([A-Za-z_$][\\w$]*)[^\\n]*PaymentType\\.(?:${CREDIT_TYPES.join('|')})\\b`,
    'g'
  )
  for (const m of masked.matchAll(decl)) names.add(m[1])
  return names
}

/** True when this argument list credits, directly or through one local. */
function argsCredit(args, bound) {
  if (CREDIT_RE.test(args)) return true
  for (const v of bound)
    if (new RegExp(`(?<![\\w$])${v}(?![\\w$])`).test(args)) return true
  return false
}

function creditCallsInSource(raw) {
  const masked = blank(raw)
  const bound = creditBoundLocals(masked)
  let n = 0
  for (const p of PRIMITIVES)
    for (const args of callArgs(masked, p)) if (argsCredit(args, bound)) n++
  return n
}

/** Every non-test source under `root` that credits, and how many times. */
function creditCallsByFile(root) {
  const out = {}
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(p)
        continue
      }
      if (!p.endsWith('.ts')) continue
      const rel = path.relative(root, p)
      // src/scripts holds one-off repair scripts run by hand, not product code.
      if (
        rel.includes('__tests__') ||
        rel.includes('/test') ||
        rel.startsWith('scripts/')
      )
        continue
      const n = creditCallsInSource(fs.readFileSync(p, 'utf8'))
      if (n) out[rel] = n
    }
  }
  walk(root)
  return out
}

/**
 * Every sample is a defect this reader actually had. The negatives matter more
 * than the positives: a census that over-counts sends someone to review a
 * charge, and the next false alarm is what teaches people to ignore it.
 */
const SAMPLES = [
  {
    why: 'literal in the argument list',
    code: `await updateUserBalance(id, 10, PaymentType.MONEY_INCOME, 'top-up')`,
    credits: 1,
  },
  {
    why: 'the PaymentType sits past any fixed window',
    code: `await updateUserBalance(\n  id,\n${'  // comment\n'.repeat(20)}  10,\n  PaymentType.MONEY_INCOME,\n  'x'\n)`,
    credits: 1,
  },
  {
    why: 'one hop through a local, as refundAndTell does',
    code: `const type = params.type ?? PaymentType.MONEY_INCOME\nawait updateUserBalance(id, 10, type, 'refund')`,
    credits: 1,
  },
  {
    why: 'a refund mints too',
    code: `await updateUserBalance(id, 10, PaymentType.REFUND, 'refund')`,
    credits: 1,
  },
  {
    why: 'a comment is not a credit',
    code: `// await updateUserBalance(id, 10, PaymentType.MONEY_INCOME, 'x')`,
    credits: 0,
  },
  {
    why: 'a charge is not a credit',
    code: `await updateUserBalance(id, 10, PaymentType.MONEY_OUTCOME, 'charge')`,
    credits: 0,
  },
  {
    why: 'a credit word elsewhere in the file does not colour a charge',
    code: `const unused = PaymentType.MONEY_INCOME\nawait updateUserBalance(id, 10, PaymentType.MONEY_OUTCOME, 'charge')`,
    credits: 0,
  },
  {
    why: 'a neighbouring credit does not colour the charge above it',
    code: `await updateUserBalance(a, 1, PaymentType.MONEY_OUTCOME, 'charge')\nawait updateUserBalance(b, 2, PaymentType.MONEY_INCOME, 'credit')`,
    credits: 1,
  },
]

function selfCheck() {
  for (const s of SAMPLES) {
    const got = creditCallsInSource(s.code)
    if (got !== s.credits)
      throw new Error(
        `credit reader disagrees with its own sample (${s.why}): expected ${s.credits}, got ${got}`
      )
  }
  return true
}

module.exports = {
  CREDIT_TYPES,
  PRIMITIVES,
  SAMPLES,
  callArgs,
  creditCallsInSource,
  creditCallsByFile,
  selfCheck,
}
