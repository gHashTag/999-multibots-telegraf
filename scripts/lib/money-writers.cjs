'use strict'
/**
 * WHO CAN MOVE MONEY IN THIS REPOSITORY.
 *
 * Balance is not a column. `get_user_balance` derives it by summing the
 * payments table, so "moving money" means writing a row there -- an insert, an
 * upsert, or an update of an existing row's amount or status.
 *
 * Every money ratchet in src/__tests__/money currently spells that population
 * as a list of four function names:
 *
 *   updateUserBalance | directPaymentProcessor | setPayments | processBalanceOperation
 *
 * That is a spelling, not the thing. Measured, ten files write the table, and
 * four of them never name any of those four functions at all -- they hold
 * their own `.from('payments_v2').insert(...)`. A test that asserts "this file
 * moves no money" using the four names reports those four clean.
 *
 * The other six do name a primitive somewhere, so a file-level matcher sees
 * them -- but seeing the file is not seeing the write, and the number to trust
 * is the one this module computes, not one written from memory.
 *
 * This module owns the detector so the ratchet, the CLI (`tri money-writers`)
 * and any future probe ask the question the same way. A copy would drift, and
 * a control that exercises the copy proves nothing about the original.
 */

const fs = require('fs')
const path = require('path')
const { blank, matchCode } = require('./blank-code.cjs')

const TABLE = 'payments_v2'

/** The vocabulary the existing money ratchets use. Kept for comparison. */
const PRIMITIVE_NAMES = [
  'updateUserBalance',
  'directPaymentProcessor',
  'setPayments',
  'processBalanceOperation',
]

const TABLE_ENTRY = new RegExp(`\\.from\\(\\s*['"]${TABLE}['"]\\s*\\)`, 'g')
const WRITE_LINK = /\.(insert|upsert|update)\s*\(/

/**
 * The method chain that starts at each `.from('payments_v2')`.
 *
 * The chain ends where it actually ends: at a newline whose next non-space
 * character is not a dot. It is deliberately NOT a character budget -- a fixed
 * window is what let an earlier matcher run past the end of a statement and
 * attribute a neighbouring call to the wrong one.
 */
function paymentsChains(raw) {
  // Two views of the same offsets. Structure -- where the chain ends -- is read
  // from the source; content is read from the mask, in which comments and
  // string literals are blanked. Without the mask a commented-out write counts
  // as a live money path: measured, one comment added to an unrelated file put
  // that file in the writer set.
  //
  // The table name itself lives inside a string literal, so the entry point is
  // anchored on the code around it (`.from(`) as blank-code.cjs requires -- a
  // matcher that started inside the literal would be dropped every time.
  const mask = blank(raw)
  const out = []
  for (const m of matchCode(raw, TABLE_ENTRY)) {
    let i = m.index + m[0].length
    const start = i
    while (i < raw.length) {
      if (raw[i] === '\n') {
        let j = i + 1
        while (j < raw.length && /\s/.test(raw[j])) j++
        if (raw[j] !== '.') break
        i = j
        continue
      }
      i++
    }
    out.push(mask.slice(start, i))
  }
  return out
}

/** True when the file writes the payments table, by any spelling. */
function writesPayments(src) {
  return paymentsChains(src).some(c => WRITE_LINK.test(c))
}

/** Every non-test .ts file under `dir` that writes the payments table. */
function writerFiles(root, dir = 'src') {
  const found = []
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(root, rel), {
      withFileTypes: true,
    })) {
      const child = `${rel}/${e.name}`
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '__tests__') walk(child)
      } else if (e.name.endsWith('.ts')) {
        if (writesPayments(fs.readFileSync(path.join(root, child), 'utf8')))
          found.push(child)
      }
    }
  }
  walk(dir)
  return found.sort()
}

/** Longest chain seen in a source -- a walker that loses its end runs away. */
function longestChain(src) {
  return paymentsChains(src).reduce((n, c) => Math.max(n, c.length), 0)
}

/**
 * Both boundaries get their own negative. The second sample is the one that
 * matters: a read of the payments table followed by a write of a DIFFERENT
 * table is exactly what a span-based matcher reports as a payments write.
 */
const SAMPLES = [
  { code: `await supabase.from('${TABLE}').insert({ a: 1 })`, writes: true },
  {
    code: `await supabase\n  .from('${TABLE}')\n  .update({ status: 'DONE' })`,
    writes: true,
  },
  {
    code: `await supabase.from('${TABLE}').select('id')\nconst x = await supabase.from('users').insert({})`,
    writes: false,
  },
  { code: `await supabase.from('users').insert({ a: 1 })`, writes: false },
  { code: `await supabase.from('${TABLE}').select('id')`, writes: false },
  // Dead text is not a money path. Before the mask, adding this single line as
  // a comment to an unrelated file was enough to enrol it as a writer.
  {
    code: `// await supabase.from('${TABLE}').insert({ a: 1 })`,
    writes: false,
  },
  {
    code: `/* await supabase.from('${TABLE}').insert({ a: 1 }) */`,
    writes: false,
  },
]

function selfCheck() {
  for (const s of SAMPLES) {
    if (writesPayments(s.code) !== s.writes)
      throw new Error(
        `detector disagrees with its own sample (expected writes=${s.writes}): ${JSON.stringify(s.code)}`
      )
  }
  return true
}

module.exports = {
  TABLE,
  PRIMITIVE_NAMES,
  SAMPLES,
  paymentsChains,
  writesPayments,
  writerFiles,
  longestChain,
  selfCheck,
}
