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

const distinctPaged = async (table, column, shape) => {
  const seen = new Set()
  let from = 0
  for (;;) {
    let q = db
      .from(table)
      .select(column)
      .range(from, from + 999)
    if (shape) q = shape(q)
    const { data, error } = await q
    if (error) return { error: error.message.slice(0, 60) }
    for (const row of data) seen.add(String(row[column]))
    if (data.length < 1000) break
    from += 1000
    if (from > 200000) return { count: seen.size, bounded: true }
  }
  return { count: seen.size }
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
  const total = await exact('prompts_history')
  if (total.error) {
    console.error(
      `SELF-CHECK FAILED: cannot read prompts_history (${total.error}).`
    )
    process.exit(2)
  }
  if (total.count === 1000) {
    console.error(
      'SELF-CHECK FAILED: prompts_history reports exactly 1000 rows,'
    )
    console.error(
      'which is the row ceiling, not a count. Refusing to print a funnel.'
    )
    process.exit(2)
  }

  console.log('ALL TIME')
  console.log(`  registered people        ${show(await exact('users'))}`)
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
})()
