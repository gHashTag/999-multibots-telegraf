'use strict'
/**
 * WHY A FAILURE HERE COSTS THE USER NOTHING -- CHECKED, NOT COMMENTED.
 *
 * Ten files charge and never refund. Six are primitives, helpers, a documented
 * honest message, a batch with reconciliation, or a path that bails before
 * spending. The other four are safe for a reason that lives ONLY in a comment
 * beside the call:
 *
 *   "Charging AFTER the await also means an ElevenLabs throw short-circuits
 *    before any deduction (no charge-on-fail)."
 *
 * That sentence is true today and nothing checks it. Move the charge twenty
 * lines up during a refactor and the comment still reads the same while the
 * user starts paying for failures. It is the same shape as the marketplace
 * payout described as "idempotent" (#1861): a promise with no test behind it.
 *
 * THE FOUR DO NOT SHARE ONE MECHANISM, and writing one loose rule for them would
 * have hidden that:
 *
 *   delivery-first  the charge sits AFTER a call that hands the result to the
 *                   user (replyWithVideo, replyWithDocument...). The user has
 *                   the thing before any money moves. Strongest of the two.
 *   success-gated   the charge sits inside a conditional on the provider's
 *                   result (`if (result?.success)`), so a falsy result skips it.
 *
 * Both prevent charge-on-failure; they fail differently and are checked
 * differently.
 */

const { blank } = require('./blank-code.cjs')

/** Calls that put the paid artefact in the user's hands. */
const DELIVERY =
  /(?<![\w$])(replyWithVoice|replyWithDocument|replyWithVideo|replyWithPhoto|replyWithAudio|sendVideo|sendPhoto|sendDocument|sendAudio)\s*\(/g

const CHARGE =
  /(?<![\w$])(updateUserBalance|processBalanceOperation|directPaymentProcessor)\s*\(/g

/** Offsets of every charge call in a masked source. */
function chargeOffsets(mask) {
  return [...mask.matchAll(CHARGE)].map(m => m.index)
}

/** Offsets of every delivery call in a masked source. */
function deliveryOffsets(mask) {
  return [...mask.matchAll(DELIVERY)].map(m => m.index)
}

/**
 * The condition of the innermost `if` whose block contains `at`, or null.
 *
 * Walks candidate `if (`s and keeps the last whose braces actually enclose the
 * offset -- not the nearest one above it, which would pick up a sibling branch
 * that closed before the charge.
 */
function enclosingCondition(raw, mask, at) {
  let found = null
  for (const m of mask.matchAll(/(?<![\w$])if\s*\(/g)) {
    if (m.index > at) break
    let i = m.index + m[0].length
    let depth = 1
    while (i < mask.length && depth > 0) {
      if (mask[i] === '(') depth++
      else if (mask[i] === ')') depth--
      i++
    }
    const open = mask.indexOf('{', i - 1)
    if (open === -1) continue
    let j = open
    let d = 0
    let end = -1
    while (j < mask.length) {
      if (mask[j] === '{') d++
      else if (mask[j] === '}' && --d === 0) {
        end = j
        break
      }
      j++
    }
    if (open < at && end > at)
      found = raw
        .slice(m.index + m[0].length, i - 1)
        .replace(/\s+/g, ' ')
        .trim()
  }
  return found
}

/** A condition that tests a provider RESULT, not merely a price being positive. */
const RESULT_SHAPED = /result|Result|success|voiceId|\bdata\b|url|Url|id\b/

/**
 * Which of the two mechanisms this file's charges satisfy.
 * Returns { deliveryFirst, successGated } -- true only when EVERY charge in the
 * file satisfies it, because one unprotected charge is the whole problem.
 */
function timingFor(raw) {
  const mask = blank(raw)
  const charges = chargeOffsets(mask)
  if (!charges.length) return { deliveryFirst: false, successGated: false }
  const deliveries = deliveryOffsets(mask)
  return {
    deliveryFirst: charges.every(c => deliveries.some(d => d < c)),
    successGated: charges.every(c => {
      const cond = enclosingCondition(raw, mask, c)
      return !!cond && RESULT_SHAPED.test(cond)
    }),
  }
}

const SAMPLES = [
  {
    why: 'charge after the artefact is delivered',
    code: `await ctx.replyWithVideo(v)\nawait updateUserBalance(id, 1, T, 'x')`,
    deliveryFirst: true,
    successGated: false,
  },
  {
    why: 'charge BEFORE delivery is not delivery-first',
    code: `await updateUserBalance(id, 1, T, 'x')\nawait ctx.replyWithVideo(v)`,
    deliveryFirst: false,
    successGated: false,
  },
  {
    why: 'charge inside a conditional on the result',
    code: `if (result?.success) {\n  await updateUserBalance(id, 1, T, 'x')\n}`,
    deliveryFirst: false,
    successGated: true,
  },
  {
    why: 'a price check is not a success check',
    code: `if (cost > 0) {\n  await updateUserBalance(id, 1, T, 'x')\n}`,
    deliveryFirst: false,
    successGated: false,
  },
  {
    why: 'a sibling branch that closed before the charge does not count',
    code: `if (result?.success) { log() }\nawait updateUserBalance(id, 1, T, 'x')`,
    deliveryFirst: false,
    successGated: false,
  },
  {
    why: 'one unguarded charge spoils the file',
    code: `if (result?.success) {\n  await updateUserBalance(a, 1, T, 'x')\n}\nawait updateUserBalance(b, 1, T, 'y')`,
    deliveryFirst: false,
    successGated: false,
  },
]

function selfCheck() {
  for (const s of SAMPLES) {
    const got = timingFor(s.code)
    if (
      got.deliveryFirst !== s.deliveryFirst ||
      got.successGated !== s.successGated
    )
      throw new Error(
        `charge-timing disagrees with its own sample (${s.why}): got ${JSON.stringify(got)}`
      )
  }
  return true
}

module.exports = { timingFor, enclosingCondition, SAMPLES, selfCheck }
