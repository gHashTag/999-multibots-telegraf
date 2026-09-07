#!/usr/bin/env node
/**
 * A TOP-UP THAT NEVER COMPLETED, AND NOBODY FOUND OUT.
 *
 * Robokassa confirms a payment by calling back within seconds. A row that stays
 * PENDING means the person pressed pay and the stars were never credited.
 *
 * This is not hypothetical. Measured 2026-09-08:
 *
 *   month     COMPLETED  PENDING
 *   2025-10         180       14
 *   2025-11          69       18
 *   2025-12           6       32     <- the callback URL had gone stale
 *   2026-01           1        6
 *   2026-03..07       0      1-2
 *
 * From March 2026 not a single top-up completed. People kept trying -- 217
 * stars on 28 May, 217 on 11 June, 4347 on 22 June, 43 on 25 July -- and every
 * one of those rows is still PENDING today. Balances ran out in June, and
 * generations fell from 88 a month to 6. The product did not break in June; it
 * broke in December and took six months to die.
 *
 * Nobody noticed for nine months because nothing was watching. That is what
 * this is: `checkPaymentStatus` exists in the tree and is called from nowhere.
 *
 * WHAT A PENDING ROW DOES NOT PROVE, corrected 2026-09-08 after an earlier
 * reading of mine overstated it. The row is written when the INVOICE is issued,
 * before any money moves. Most pending rows are therefore abandoned checkouts,
 * and they always existed: 15 in May 2025, 28 in June, 17 in August, long
 * before anything broke. "208 stuck" is not "208 people were robbed", and the
 * sum of their stars is not a debt.
 *
 * The signal is the RATIO, not the count. October 2025: 180 completed against
 * 14 pending. December: 6 against 32. From March 2026: zero completed, ever.
 * Abandonment does not explain a completion rate of zero -- that is the defect,
 * and it is what the gate below watches for.
 *
 * TWO POPULATIONS, ON PURPOSE. The historical backlog cannot be fixed by code
 * and would make a gate permanently red, which is how a gate gets ignored. So
 * the exit code is decided ONLY by rows young enough that the callback should
 * already have arrived. The backlog is printed, not gated.
 *
 *   railway run -s 999-multibots-telegraf node scripts/stuck-payments.cjs
 *   ... --gate       exit 1 if a FRESH top-up is stuck
 *
 * Read-only. Every query is a SELECT or an exact count. This never credits
 * anybody: who is owed stars for the backlog is the owner's decision.
 */
const { createClient } = require('@supabase/supabase-js')

const GATE = process.argv.includes('--gate')
const DETAIL = process.argv.includes('--detail')
/** Robokassa answers in seconds; an hour is generous. */
const FRESH_STUCK_MINUTES = 60
/** Rows older than this are the historical backlog, reported and not gated. */
const BACKLOG_HOURS = 48

const url = process.env.SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('NO CREDENTIALS in this environment.')
  console.error('Refusing to report zero stuck payments, because a zero from a')
  console.error(
    'query that never ran is exactly the silence this file exists to end.'
  )
  console.error(
    'Run: railway run -s 999-multibots-telegraf node scripts/stuck-payments.cjs'
  )
  process.exit(2)
}

const db = createClient(url, key)
const ago = minutes => new Date(Date.now() - minutes * 60000).toISOString()

/** Income that is a real top-up, not a refund credited back for a failed job. */
const topUps = q =>
  q.eq('type', 'MONEY_INCOME').not('description', 'ilike', '%efund%')

const count = async shape => {
  const { count: n, error } = await shape(
    db.from('payments_v2').select('*', { count: 'exact', head: true })
  )
  return error ? { error: error.message.slice(0, 60) } : { n }
}

;(async () => {
  /*
   * Self-check, both ways, before any claim. COMPLETED top-ups must exist in
   * history -- if that comes back zero the filter is wrong, not the world --
   * and the PENDING count must be smaller than the total, or the status filter
   * is doing nothing at all.
   */
  const everDone = await count(q => topUps(q).eq('status', 'COMPLETED'))
  const everPending = await count(q => topUps(q).eq('status', 'PENDING'))
  const everAll = await count(q => topUps(q))
  if (everDone.error || everPending.error || everAll.error) {
    console.error('SELF-CHECK FAILED: cannot read payments_v2.')
    process.exit(2)
  }
  if (everDone.n === 0) {
    console.error(
      'SELF-CHECK FAILED: no COMPLETED top-up exists in all of history.'
    )
    console.error(
      'That is not a product fact, it is a broken filter. Refusing to report.'
    )
    process.exit(2)
  }
  if (everPending.n >= everAll.n) {
    console.error('SELF-CHECK FAILED: the status filter selects everything.')
    process.exit(2)
  }

  const fresh = await count(q =>
    topUps(q)
      .eq('status', 'PENDING')
      .lt('created_at', ago(FRESH_STUCK_MINUTES))
      .gte('created_at', ago(BACKLOG_HOURS * 60))
  )
  const backlog = await count(q =>
    topUps(q)
      .eq('status', 'PENDING')
      .lt('created_at', ago(BACKLOG_HOURS * 60))
  )

  console.log(
    `self-check ok: ${everDone.n} top-ups have completed in history, ${everPending.n} are pending`
  )
  console.log('')
  console.log(
    `STUCK, FRESH  (older than ${FRESH_STUCK_MINUTES}m, newer than ${BACKLOG_HOURS}h): ${fresh.n}`
  )
  console.log(
    `BACKLOG       (older than ${BACKLOG_HOURS}h, not gated):                ${backlog.n}`
  )
  console.log('')

  const { data: recent } = await db
    .from('payments_v2')
    .select('created_at,stars,bot_name,description')
    .eq('type', 'MONEY_INCOME')
    .eq('status', 'PENDING')
    .not('description', 'ilike', '%efund%')
    .order('created_at', { ascending: false })
    .limit(10)
  if (recent && recent.length) {
    console.log(
      'most recent invoices that never completed (issued, not necessarily paid):'
    )
    for (const r of recent) {
      console.log(
        `  ${String(r.created_at).slice(0, 10)}  ${String(r.stars ?? '-').padStart(6)} stars  ${String(r.bot_name || '?').padEnd(22)} ${String(r.description || '').slice(0, 34)}`
      )
    }
    console.log('')
  }

  console.log(
    'A PENDING row means an invoice was issued, not that money changed hands:'
  )
  console.log(
    'most of the backlog is abandoned checkouts, and those existed long before'
  )
  console.log(
    'anything broke. What abandonment does NOT explain is a completion rate of'
  )
  console.log('zero, which is what the gate watches.')
  console.log('')
  console.log(
    'Nobody is credited by this script. Whether Robokassa actually took money'
  )
  console.log(
    'for any of these is visible only in the merchant dashboard, and what to do'
  )
  console.log("about it is the owner's decision.")

  if (DETAIL) {
    /*
     * The reconciliation list, printed only on request and only where the owner
     * runs it. It carries telegram ids, so it belongs on their machine and not
     * in a report: these are people, not rows.
     *
     * Paged rather than read once -- the client caps a read at 1000, and a
     * bounded read printed as a population is how "354 people" once became 15.
     */
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from('payments_v2')
        .select('created_at,stars,bot_name,telegram_id')
        .eq('type', 'MONEY_INCOME')
        .eq('status', 'PENDING')
        .not('description', 'ilike', '%efund%')
        .order('created_at', { ascending: false })
        .range(from, from + 999)
      if (error) {
        console.error(`detail read failed: ${error.message.slice(0, 60)}`)
        break
      }
      rows.push(...data)
      if (data.length < 1000) break
    }
    console.log('')
    console.log(`DETAIL: ${rows.length} pending top-ups, newest first`)
    for (const r of rows) {
      console.log(
        `${String(r.created_at).slice(0, 10)}  ${String(r.stars ?? '-').padStart(6)}  ${String(r.bot_name || '?').padEnd(22)} ${r.telegram_id}`
      )
    }
    console.log('')
    console.log(
      'Rows after 2026-02 are worth checking first: in that window NOTHING'
    )
    console.log(
      'completed, so an abandoned checkout and a lost payment look the same'
    )
    console.log(
      'from here and only the merchant dashboard can tell them apart.'
    )
  }

  if (GATE && fresh.n > 0) {
    console.error('')
    console.error(
      `GATE RED: ${fresh.n} top-up(s) pressed more than ${FRESH_STUCK_MINUTES} minutes ago and still not credited.`
    )
    console.error(
      'Check that the Robokassa callback still reaches /api/payment-success.'
    )
    process.exit(1)
  }
})()
