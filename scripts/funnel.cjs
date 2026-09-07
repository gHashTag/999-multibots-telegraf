#!/usr/bin/env node
/**
 * IS ANYBODY USING THIS?
 *
 * Every other instrument in this repository measures the CODE. This one
 * measures whether the code is reached, because for four months it has not
 * been, and nothing said so.
 *
 * Generations and charges are counted side by side on purpose: they are
 * independent tables, and a collapse in one alone would be a recording gap
 * rather than a fact about people. When both fall together, it is people.
 *
 * MUST BE RUN WITH THE SERVICE'S ENVIRONMENT:
 *   railway run -s 999-multibots-telegraf node scripts/funnel.cjs
 *
 * Read-only. Every query is a SELECT or an exact count.
 *
 * WHY head:true EVERYWHERE. A first version of this measurement read rows and
 * counted distinct values in JavaScript. Supabase caps a read at 1000 rows, so
 * "354 people have ever generated something" came out as 15 -- a truncation
 * printed as a population, wrong by a factor of twenty-four. `count: 'exact'`
 * with `head: true` is not row-bounded; where a distinct count is genuinely
 * needed, the reader pages and says so.
 */
const { createClient } = require('@supabase/supabase-js')

const url = process.env.SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('NO CREDENTIALS in this environment.')
  console.error(
    'This prints nothing rather than zeros: a zero from a query that'
  )
  console.error('never ran is the failure this whole file exists to avoid.')
  console.error(
    'Run it as:  railway run -s 999-multibots-telegraf node scripts/funnel.cjs'
  )
  process.exit(2)
}

const db = createClient(url, key)

const exact = async (table, shape) => {
  let q = db.from(table).select('*', { count: 'exact', head: true })
  if (shape) q = shape(q)
  const { count, error } = await q
  if (error) return { error: error.message.slice(0, 60) }
  return { count }
}

/**
 * A unique column to page by, per table.
 *
 * PAGING WITHOUT AN ORDER IS NOT A READ, IT IS A SAMPLE. `.range()` asks for
 * rows N..M of an order the server never promised, so rows move between pages
 * and the same query returns different sets. This bit hard on 2026-09-08: a
 * cohort read of `users` ordered by created_at -- where 1559 rows share ONE
 * second -- reported 1787 distinct people and 593 duplicate rows. Both were
 * the reader. The real figures are 2345 and 35, and I nearly published the
 * others as a finding about the data.
 *
 * Ordering by a unique key makes the page boundaries stable. The row-count
 * check below is what proves it on every run rather than on trust.
 */
const PAGE_KEY = {
  users: 'id',
  payments_v2: 'id',
  prompts_history: 'prompt_id',
}

const rowsPaged = async (table, columns, shape) => {
  const key = PAGE_KEY[table]
  if (!key) return { error: `no unique paging key known for ${table}` }
  const out = []
  let from = 0
  for (;;) {
    let q = db
      .from(table)
      .select(columns)
      .order(key, { ascending: true })
      .range(from, from + 999)
    if (shape) q = shape(q)
    const { data, error } = await q
    if (error) return { error: error.message.slice(0, 60) }
    out.push(...data)
    if (data.length < 1000) break
    from += 1000
    if (from > 200000) return { rows: out, bounded: true }
  }
  /*
   * THE COUNT IS NOT THE CONTROL. Unstable paging returns the same NUMBER of
   * rows while duplicating some and dropping others, so comparing the total
   * against the server's count passes straight through it. Uniqueness does not:
   * every row carries the key it was ordered by, and a duplicate is a repeated
   * key.
   *
   * Verified against the defect that actually happened -- paging `users` by
   * created_at, where 1559 rows share one second. This refuses with
   * "2380 rows but only 821 distinct created_at". Omitting the order clause
   * entirely does NOT reproduce it on this data: PostgREST happens to return a
   * stable order, so that mutation survives and is not claimed as evidence.
   */
  const keys = new Set(out.map(r => String(r[key])))
  if (keys.size !== out.length)
    return {
      error: `paging returned ${out.length} rows but only ${keys.size} distinct ${key} -- unstable order`,
    }
  return { rows: out }
}

const distinctPaged = async (table, column, shape) => {
  const key = PAGE_KEY[table]
  const got = await rowsPaged(
    table,
    key === column ? column : `${key},${column}`,
    shape
  )
  if (got.error) return { error: got.error }
  if (got.bounded)
    return {
      count: new Set(got.rows.map(r => String(r[column]))).size,
      bounded: true,
    }
  // The read must account for every row the server says exists under the same
  // filter. A short read here is exactly the unstable-paging failure above.
  const total = await exact(table, shape)
  if (total.error) return { error: total.error }
  if (got.rows.length !== total.count)
    return {
      error: `read ${got.rows.length} rows of ${total.count} -- unstable paging`,
    }
  return { count: new Set(got.rows.map(r => String(r[column]))).size }
}

const show = r =>
  r.error
    ? `err(${r.error})`
    : String(r.count) + (r.bounded ? '+ (paging stopped: LOWER BOUND)' : '')

;(async () => {
  /*
   * The self-check is the total row count of prompts_history. If it comes back
   * at exactly 1000 the reader is truncating again and every number below is a
   * floor wearing a total.
   */
  /*
   * Self-check, BOTH directions, before any number is printed.
   *
   * A count that comes back at exactly the client's row ceiling is the ceiling,
   * not a count -- that is how "354 people have ever generated" once came out
   * as 15. But a guard that only ever refuses is not a guard either: it has to
   * accept a legitimate count, or it would be indistinguishable from a script
   * that never reports anything. So the predicate is checked against a sample
   * it MUST refuse and a sample it MUST accept.
   */
  const ROW_CEILING = 1000
  const looksLikeCeiling = n => n === ROW_CEILING
  // Positive: the sample that MUST be caught.
  if (!looksLikeCeiling(ROW_CEILING)) {
    console.error(
      `SELF-CHECK FAILED: a count of exactly ${ROW_CEILING} was not recognised as the row ceiling.`
    )
    process.exit(2)
  }
  // Negative: the clean sample that must NOT be caught. Written as its own
  // check rather than folded into the line above, because two directions in
  // one condition are one control twice -- the negative half hides behind the
  // positive one, in the reader and in the ratchet that counts them.
  if (looksLikeCeiling(ROW_CEILING - 1)) {
    console.error(
      `SELF-CHECK FAILED: a legitimate count of ${ROW_CEILING - 1} was refused as a ceiling.`
    )
    console.error(
      'A guard that only ever refuses cannot be told from a script that never reports.'
    )
    process.exit(2)
  }

  const total = await exact('prompts_history')
  if (total.error) {
    console.error(
      `SELF-CHECK FAILED: cannot read prompts_history (${total.error}).`
    )
    process.exit(2)
  }
  if (looksLikeCeiling(total.count)) {
    console.error(
      'SELF-CHECK FAILED: prompts_history reports exactly 1000 rows,'
    )
    console.error(
      'which is the row ceiling, not a count. Refusing to print a funnel.'
    )
    process.exit(2)
  }

  console.log('ALL TIME')
  // ROWS, not people. 35 telegram_ids have more than one row; the cohort
  // section below counts people and says so.
  console.log(`  rows in users            ${show(await exact('users'))}`)
  console.log(`  generations recorded     ${show(total)}`)
  console.log(
    `  charge rows              ${show(await exact('payments_v2', q => q.eq('type', 'MONEY_OUTCOME')))}`
  )
  console.log(
    `  people who ever generated ${show(await distinctPaged('prompts_history', 'telegram_id'))}`
  )
  console.log(
    `  people who ever spent     ${show(await distinctPaged('payments_v2', 'telegram_id', q => q.eq('type', 'MONEY_OUTCOME')))}`
  )
  console.log('')
  console.log('BY MONTH   generations  charges  top-ups  arrived')
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const a = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)
    ).toISOString()
    const b = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1)
    ).toISOString()
    const window = q => q.gte('created_at', a).lt('created_at', b)
    const [g, out, inc, u] = await Promise.all([
      exact('prompts_history', window),
      exact('payments_v2', q => window(q).eq('type', 'MONEY_OUTCOME')),
      exact('payments_v2', q => window(q).eq('type', 'MONEY_INCOME')),
      exact('users', window),
    ])
    console.log(
      `${a.slice(0, 7)}    ${show(g).padStart(9)}  ${show(out).padStart(7)}  ${show(inc).padStart(7)}  ${show(u).padStart(7)}`
    )
  }
  console.log('')
  console.log(
    'Generations and charges are separate tables. A fall in one alone'
  )
  console.log('would be a recording gap; a fall in both is people going away.')

  /*
   * TWO POPULATIONS, NOT ONE AVERAGE.
   *
   * 1559 rows carry a single created_at second -- 2025-09-16T10:09:58 -- which
   * no organic signup rate produces. That is a migration from a previous
   * product, and those people arrived already warm. Averaging them with people
   * who found the bot themselves describes neither: measured the same day,
   * imported convert at 5.2% and organic at 1.9%.
   *
   * The split is derived, not hard-coded: the busiest single second is taken as
   * the import, and the script refuses if no second is anywhere near bulk.
   */
  console.log('')
  console.log('')
  const users = await rowsPaged('users', 'id,telegram_id,created_at')
  if (users.error) {
    console.error(`cannot read users for the cohort split: ${users.error}`)
    process.exit(2)
  }
  const bySecond = {}
  for (const u of users.rows) {
    const sec = String(u.created_at).slice(0, 19)
    bySecond[sec] = (bySecond[sec] || 0) + 1
  }
  const [importSec, importN] = Object.entries(bySecond).sort(
    (a, b) => b[1] - a[1]
  )[0]
  if (importN < 200) {
    console.error(
      `SELF-CHECK FAILED: busiest second holds ${importN} rows, which is not a bulk import.`
    )
    console.error('The cohort split below would be inventing a boundary.')
    process.exit(2)
  }

  const people = new Set(users.rows.map(u => String(u.telegram_id).trim()))
  const imported = new Set(
    users.rows
      .filter(u => String(u.created_at).slice(0, 19) === importSec)
      .map(u => String(u.telegram_id).trim())
  )
  const organic = new Set([...people].filter(x => !imported.has(x)))
  if (imported.size + organic.size !== people.size) {
    console.error('SELF-CHECK FAILED: the cohorts do not partition the people.')
    process.exit(2)
  }

  const pays = await rowsPaged(
    'payments_v2',
    'id,telegram_id,status,payment_method,type'
  )
  const gens = await rowsPaged('prompts_history', 'prompt_id,telegram_id')
  if (pays.error || gens.error) {
    console.error(`cannot read the ladder: ${pays.error || gens.error}`)
    process.exit(2)
  }
  const PAID_CHANNELS = new Set([
    'Robokassa',
    'Telegram',
    'bank_card',
    'TON_NATIVE',
    'TON_USDT',
    'X402',
    'CryptoBot',
  ])
  const idsOf = rows => new Set(rows.map(r => String(r.telegram_id).trim()))
  const generated = idsOf(gens.rows)
  const invoiced = idsOf(
    pays.rows.filter(
      p => p.type === 'MONEY_INCOME' && PAID_CHANNELS.has(p.payment_method)
    )
  )
  const paid = idsOf(
    pays.rows.filter(
      p =>
        p.type === 'MONEY_INCOME' &&
        p.status === 'COMPLETED' &&
        PAID_CHANNELS.has(p.payment_method)
    )
  )
  // A person who paid must also appear as invoiced, or the two filters
  // disagree about what a payment is.
  const impossible = [...paid].filter(x => !invoiced.has(x))
  if (impossible.length) {
    console.error(
      `SELF-CHECK FAILED: ${impossible.length} payers never appear as invoiced.`
    )
    process.exit(2)
  }

  const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '-')
  const line = (label, set) => {
    const i = [...set].filter(x => imported.has(x)).length
    const o = [...set].filter(x => organic.has(x)).length
    console.log(
      `  ${label.padEnd(22)} imported ${String(i).padStart(4)} ${pct(i, imported.size).padStart(6)}    organic ${String(o).padStart(4)} ${pct(o, organic.size).padStart(6)}`
    )
  }
  console.log(
    `PEOPLE, BY COHORT   imported ${imported.size} (one second: ${importSec})   organic ${organic.size}`
  )
  line('ever generated', generated)
  line('ever saw a price', invoiced)
  line('ever paid', paid)
  console.log('')
  console.log('An opt-in free trial converts 8-15% of signups in this market.')
  console.log('The drop that matters is generated -> saw a price: most of the')
  console.log('people who get something out of this product never reach one.')
})()
