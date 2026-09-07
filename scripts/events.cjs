#!/usr/bin/env node
/**
 * THE DARK SEGMENT OF THE FUNNEL.
 *
 * `payments_v2` knows about invoices and charges. `prompts_history` knows about
 * generations. Between "somebody arrived" and "somebody paid" there was nothing
 * -- and that is where almost everyone stops: 2380 people have registered and
 * 354 have ever generated anything.
 *
 * The steps recorded are a closed list (src/services/trackEvent.ts): start,
 * menu_shown, topup_opened, refused_no_balance, unanswered_message,
 * unanswered_press.
 *
 *   railway run -s 999-multibots-telegraf node scripts/events.cjs
 *
 * Read-only.
 *
 * THE DISTINCTION THIS FILE EXISTS TO MAKE. "No events" has two causes that
 * look identical and mean opposite things: nobody used the bot, or the
 * migration was never applied. A funnel of zeros printed for the second reason
 * is exactly the silence that let a payment defect live for nine months. So a
 * missing table is reported as a missing table, with the file to apply, and
 * the exit code says which of the two happened.
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
    'Refusing to print an empty funnel, which would be indistinguishable'
  )
  console.error(
    'from a real one. Run: railway run -s 999-multibots-telegraf node scripts/events.cjs'
  )
  process.exit(2)
}

const db = createClient(url, key)
const STEPS = [
  'start',
  'menu_shown',
  'topup_opened',
  'refused_no_balance',
  'unanswered_message',
  'unanswered_press',
]
const ago = days => new Date(Date.now() - days * 864e5).toISOString()

const count = async shape => {
  const { count: n, error } = await shape(
    db.from('user_events').select('*', { count: 'exact', head: true })
  )
  return { n, error }
}

;(async () => {
  const probe = await count(q => q)
  /*
   * A missing table does not always arrive as an error. Measured 2026-09-08
   * against production: the count came back as `null` with no error at all, the
   * guard below did not fire, and the reader printed a column of `null` -- the
   * exact ambiguity this file exists to prevent, produced by the file itself.
   *
   * So the condition is "did I get a number", not "was there an error".
   */
  if (probe.error || typeof probe.n !== 'number') {
    const message = probe.error
      ? probe.error.message || ''
      : 'count came back as ' + String(probe.n)
    const missing =
      !probe.error ||
      /does not exist|schema cache|relation .* does not exist|not find the table/i.test(
        message
      )
    if (missing) {
      console.error(
        'THE TABLE IS NOT THERE — the migration has not been applied.'
      )
      console.error('')
      console.error('  sql/migrations/20260908_user_events.sql')
      console.error('')
      console.error(
        'This is not "nobody used the bot". Those two look identical as a'
      )
      console.error(
        'screen of zeros and mean opposite things, so this refuses to print one.'
      )
      console.error('')
      console.error(`  (what came back: ${message.slice(0, 80)})`)
      process.exit(3)
    }
    console.error(`cannot read user_events: ${message.slice(0, 100)}`)
    process.exit(2)
  }

  console.log(`user_events rows: ${probe.n}`)
  if (probe.n === 0) {
    console.log('')
    console.log(
      'The table exists and is empty. Nothing has been recorded since the'
    )
    console.log(
      'migration was applied — which, if the bot has been running, is itself'
    )
    console.log('the finding.')
    process.exit(0)
  }

  for (const days of [1, 7, 30]) {
    console.log('')
    console.log(`LAST ${String(days).padStart(2)} DAY(S)`)
    for (const step of STEPS) {
      const r = await count(q =>
        q.eq('event', step).gte('created_at', ago(days))
      )
      const people = await db
        .from('user_events')
        .select('telegram_id')
        .eq('event', step)
        .gte('created_at', ago(days))
        .limit(1000)
      const distinct = people.data
        ? new Set(people.data.map(x => x.telegram_id)).size
        : '?'
      const bounded = people.data && people.data.length === 1000 ? '+' : ''
      console.log(
        `  ${step.padEnd(20)} ${String(r.error ? 'err' : r.n).padStart(6)}   people ${String(distinct).padStart(5)}${bounded}`
      )
    }
  }
  console.log('')
  console.log(
    'A "+" on a people count means the reader hit the 1000-row ceiling and'
  )
  console.log('the number is a LOWER BOUND, not a total.')
})()
