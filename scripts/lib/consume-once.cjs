'use strict'
/**
 * CHECK-THEN-SET GUARDS: THE THIRD WAY THIS REPOSITORY STOPS A DOUBLE CHARGE.
 *
 * Three mechanisms protect a charge from firing twice for one user action:
 *
 *   an in-progress flag on a scene   -- 18 scenes, held by paid-wizard-guard-ratchet
 *   step.run in an Inngest function  -- held by inngestMoneyInStepRun
 *   CONSUME-ONCE                     -- three sites, each with its own test and
 *                                       NO census over the mechanism
 *
 * The third is the one a new site slips into unnoticed: every instance is
 * pinned, the population is not. This provides the population.
 *
 * THE SHAPE. Compare a session field against the thing about to be paid for,
 * reject if it matches, then mark it consumed -- and mark it BEFORE the charge,
 * with nothing awaited in between on the path that reaches the mark:
 *
 *   if (ctx.session.lastUpscaledImageUrl === ctx.session.lastGeneratedImageUrl) {
 *     await ctx.reply('already upscaled')   // reject branch, returns
 *     return
 *   }
 *   ctx.session.lastUpscaledImageUrl = ctx.session.lastGeneratedImageUrl
 *   ... charge ...
 *
 * WHY THE REGION MATTERS. Counting awaits over the raw span between the
 * comparison and the mark reports a race at all three real sites -- twice in a
 * row, for two different reasons. First because the span contains the reject
 * branch, whose `await ctx.reply` is followed by `return`. Then, after skipping
 * that one block, because aiPhotoshopScene stacks a SECOND guard that also
 * awaits and returns.
 *
 * The fall-through path is not a contiguous slice: it is the span MINUS every
 * returning block, however many there are. Measuring the wrong region turns
 * three correct guards into three findings.
 */

const { blank } = require('./blank-code.cjs')

const SET = /ctx\.session\.([A-Za-z_$][\w$]*)\s*=(?!=)/g
const AWAIT = /(?<![\w$])await(?![\w$])/g

/** End offset of the `{...}` block opened at or after `from`, or -1. */
function blockEnd(mask, from) {
  const open = mask.indexOf('{', from)
  if (open === -1) return -1
  let i = open
  let depth = 0
  while (i < mask.length) {
    if (mask[i] === '{') depth++
    else if (mask[i] === '}' && --depth === 0) return i
    i++
  }
  return -1
}

/**
 * The span between two offsets with every RETURNING block removed.
 *
 * The fall-through path is not a contiguous slice. Between the first comparison
 * and the mark there can be any number of guard blocks, each of which awaits a
 * reply and then returns; none of them is on the path that reaches the mark.
 * Counting awaits over the raw span reported a race at all three real sites,
 * twice in a row, for two different reasons -- one stacked guard, then another.
 */
function fallThrough(mask, from, to) {
  let out = ''
  let i = from
  while (i < to) {
    const open = mask.indexOf('{', i)
    if (open === -1 || open >= to) {
      out += mask.slice(i, to)
      break
    }
    const end = blockEnd(mask, open)
    if (end === -1 || end >= to) {
      out += mask.slice(i, to)
      break
    }
    out += mask.slice(i, open)
    const body = mask.slice(open, end)
    // A block that returns is not on the path to the mark; anything else (a
    // plain object literal, a non-returning branch) still is.
    if (!/(?<![\w$])return(?![\w$])/.test(body)) out += body
    i = end + 1
  }
  return out
}

/**
 * Every check-then-set site in a source.
 *
 * Each is { field, compareAt, markAt, awaitsBetween } where awaitsBetween counts
 * only the FALL-THROUGH path: from the close of the rejecting block to the mark.
 */
function sites(raw) {
  const mask = blank(raw)
  const out = []
  for (const m of mask.matchAll(SET)) {
    const field = m[1]
    const cmp = new RegExp(`ctx\\.session\\.${field}\\s*===`, 'g')
    const compares = [...mask.matchAll(cmp)]
      .map(c => c.index)
      .filter(i => i < m.index)
    if (!compares.length) continue
    const compareAt = compares[compares.length - 1]
    const between = fallThrough(mask, compareAt, m.index)
    out.push({
      field,
      compareAt,
      markAt: m.index,
      awaitsBetween: (between.match(AWAIT) || []).length,
    })
  }
  return out
}

const lineOf = (raw, at) => raw.slice(0, at).split('\n').length

const SAMPLES = [
  {
    why: 'the reject branch may await, because it returns',
    code: `if (ctx.session.a === b) {\n  await ctx.reply('no')\n  return\n}\nctx.session.a = b`,
    count: 1,
    awaits: 0,
  },
  {
    why: 'an await on the fall-through path is a race window',
    code: `if (ctx.session.a === b) {\n  return\n}\nawait sleep()\nctx.session.a = b`,
    count: 1,
    awaits: 1,
  },
  {
    why: 'a SECOND guard that also returns is still not on the path',
    code: `if (ctx.session.a === b) {\n  await ctx.reply('no')\n  return\n}\nif (ctx.session.busy) {\n  await ctx.reply('wait')\n  return\n}\nctx.session.busy = true\nctx.session.a = b`,
    count: 1,
    awaits: 0,
  },
  {
    why: 'a set with no earlier comparison is not a check-then-set',
    code: `ctx.session.a = b`,
    count: 0,
  },
  {
    why: 'a comparison AFTER the set does not make it one either',
    code: `ctx.session.a = b\nif (ctx.session.a === c) {}`,
    count: 0,
  },
]

function selfCheck() {
  for (const s of SAMPLES) {
    const got = sites(s.code)
    if (got.length !== s.count)
      throw new Error(
        `consume-once detector disagrees with its own sample (${s.why}): expected ${s.count}, got ${got.length}`
      )
    if (s.awaits !== undefined && got[0].awaitsBetween !== s.awaits)
      throw new Error(
        `await counting wrong (${s.why}): expected ${s.awaits}, got ${got[0].awaitsBetween}`
      )
  }
  return true
}

module.exports = { sites, lineOf, SAMPLES, selfCheck }
