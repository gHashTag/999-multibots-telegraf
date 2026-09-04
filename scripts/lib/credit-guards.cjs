'use strict'
/**
 * WHAT ACTUALLY PROTECTS EACH CREDIT, CHECKED RATHER THAN PROMISED.
 *
 * The credit-site census pins WHICH files credit. Next to each it carries a
 * sentence of prose saying WHY that credit is safe -- "refund inside step.run",
 * "atomic status CAS", "the purchase behind it is idempotent".
 *
 * Prose ages silently. One of those sentences was measurably false when it was
 * read a day later: the marketplace payout was described as idempotent, and its
 * only guard was an in-memory Set that a throw could leave set forever (#1861).
 * The census stayed green throughout, because a census checks a LIST, not the
 * promises written beside it.
 *
 * So the mechanisms are detected structurally here, and the registry in
 * creditGuardsHold.test.ts names the one each site is expected to have. Delete
 * the step.run wrapper, or the catch, or the CAS, and the test fails -- instead
 * of the protection quietly becoming a sentence nobody rechecks.
 *
 * WHAT THIS IS NOT. Detecting `step.run` around a credit does not prove the
 * credit is idempotent; it proves the mechanism the note names is still there.
 * A guard can be present and wrong. This closes the gap between "the note says
 * X" and "X exists", which is the gap that hid #1861 -- not the gap between "X
 * exists" and "X is correct".
 */

const { blank, matchCode } = require('./blank-code.cjs')
const { callArgs } = require('./call-args.cjs')
const { CREDIT_TYPES, PRIMITIVES } = require('./credit-sites.cjs')

const CREDIT = new RegExp(`PaymentType\\.(${CREDIT_TYPES.join('|')})\\b`)
const CHARGE = /PaymentType\.MONEY_OUTCOME\b/

/** Every kind this can detect. A registry entry naming anything else is a typo. */
const KINDS = ['step.run', 'catch', 'cas', 'finally', 'charge-first']

/** Balanced `{...}` ranges opened by each match of `anchor`. */
function blockRanges(mask, anchor) {
  const out = []
  for (const m of mask.matchAll(anchor)) {
    const open = mask.indexOf('{', m.index + m[0].length - 1)
    if (open === -1) continue
    let i = open
    let depth = 0
    while (i < mask.length) {
      if (mask[i] === '{') depth++
      else if (mask[i] === '}' && --depth === 0) {
        out.push([open, i])
        break
      }
      i++
    }
  }
  return out
}

const within = (ranges, p) => ranges.some(([a, b]) => p > a && p < b)

/** Offsets of the credit calls and of the charge calls, told apart by args. */
function moneyCalls(mask) {
  const bound = new Set(
    [
      ...mask.matchAll(
        new RegExp(
          `(?:const|let)\\s+([A-Za-z_$][\\w$]*)[^\\n]*PaymentType\\.(?:${CREDIT_TYPES.join('|')})\\b`,
          'g'
        )
      ),
    ].map(m => m[1])
  )
  const credits = []
  const charges = []
  for (const name of PRIMITIVES)
    for (const m of mask.matchAll(
      new RegExp(`(?<![A-Za-z0-9_$])${name}\\s*\\(`, 'g')
    )) {
      const args = callArgs(mask.slice(m.index), name)[0] || ''
      if (CHARGE.test(args)) charges.push(m.index)
      else if (
        CREDIT.test(args) ||
        [...bound].some(v => new RegExp(`(?<![\\w$])${v}(?![\\w$])`).test(args))
      )
        credits.push(m.index)
    }
  return { credits, charges }
}

/** The mechanisms detectable around this file's credits. */
function guardsFor(raw) {
  const mask = blank(raw)
  const { credits, charges } = moneyCalls(mask)
  const found = new Set()
  if (!credits.length) return found

  const steps = blockRanges(mask, /(?<![\w$])step\.run\s*\(/g)
  const catches = blockRanges(mask, /(?<![\w$])catch\s*(?:\([^)]*\))?\s*\{/g)

  if (credits.some(p => within(steps, p))) found.add('step.run')
  if (credits.some(p => within(catches, p))) found.add('catch')
  // The column name lives INSIDE a string literal, which the mask blanks, so
  // this one is matched on the raw source with the anchor on the code around
  // it. Matching the masked text here reported "no CAS anywhere", including
  // files where the CAS had been read by eye the day before.
  if (matchCode(raw, /\.eq\(\s*['"]status['"]/g).length) found.add('cas')
  if (/\}\s*finally\s*\{/.test(mask)) found.add('finally')
  if (charges.length && credits.every(p => charges.some(ch => ch < p)))
    found.add('charge-first')
  return found
}

const SAMPLES = [
  {
    why: 'a credit inside step.run',
    code: `await step.run('refund', async () => {\n  await updateUserBalance(id, 1, PaymentType.REFUND, 'x')\n})`,
    expect: ['step.run'],
  },
  {
    why: 'a refund on the failure path',
    code: `try { go() } catch (e) {\n  await updateUserBalance(id, 1, PaymentType.MONEY_INCOME, 'x')\n}`,
    expect: ['catch'],
  },
  {
    why: 'a charge before the credit, in the same file',
    code: `await updateUserBalance(id, 1, PaymentType.MONEY_OUTCOME, 'c')\nif (!ok) await updateUserBalance(id, 1, PaymentType.MONEY_INCOME, 'r')`,
    expect: ['charge-first'],
  },
  {
    why: 'a credit BEFORE any charge is not charge-first',
    code: `await updateUserBalance(id, 1, PaymentType.MONEY_INCOME, 'r')\nawait updateUserBalance(id, 1, PaymentType.MONEY_OUTCOME, 'c')`,
    expect: [],
  },
  {
    why: 'a status compare-and-set, whose column name sits in a literal',
    code: `await db.update({ status: 'DONE' }).eq('status', 'PENDING')\nawait updateUserBalance(id, 1, PaymentType.MONEY_INCOME, 'x')`,
    expect: ['cas'],
  },
  {
    why: 'a bare credit has nothing',
    code: `await updateUserBalance(id, 1, PaymentType.MONEY_INCOME, 'x')`,
    expect: [],
  },
  {
    why: 'a step.run around a CHARGE does not protect a credit elsewhere',
    code: `await step.run('charge', async () => {\n  await updateUserBalance(id, 1, PaymentType.MONEY_OUTCOME, 'c')\n})\nawait updateUserBalance(id, 1, PaymentType.MONEY_INCOME, 'r')`,
    expect: ['charge-first'],
  },
]

function selfCheck() {
  for (const s of SAMPLES) {
    const got = [...guardsFor(s.code)].sort()
    const want = [...s.expect].sort()
    if (JSON.stringify(got) !== JSON.stringify(want))
      throw new Error(
        `guard detector disagrees with its own sample (${s.why}): expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
      )
  }
  return true
}

module.exports = { KINDS, guardsFor, moneyCalls, SAMPLES, selfCheck }
