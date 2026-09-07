#!/usr/bin/env node
/**
 * A TOP-UP THAT NEVER COMPLETED, AND NOBODY FOUND OUT.
 *
 * Robokassa confirms a payment by calling back within seconds. A row that stays
 * PENDING means the person pressed pay and the stars were never credited.
 *
 * ONE NUMBER FOR ALL CHANNELS TOLD THE WRONG STORY, and this file told it.
 * Corrected 2026-09-08 by splitting the population, which is why the breakdown
 * below is now printed and self-checked rather than summarised away.
 *
 * The union said "top-ups stopped completing". Per channel, measured the same
 * day, it reads completely differently:
 *
 *   channel     completed  pending   last COMPLETED
 *   Telegram          364       24   2026-09-07   <- yesterday. Never stopped.
 *   Robokassa          75      164   2026-02-24   <- and that one was BY HAND
 *   bank_card           0        7   never
 *   X402                0       12   never
 *   TON_NATIVE          0        1   never
 *
 * The product did not lose its ability to take money. It lost ONE channel,
 * quietly, while another kept working -- and three more were shipped that have
 * never credited anybody at all, across twenty attempts by real people.
 *
 * Robokassa's cause was found and fixed on 2026-09-08: config handed the
 * provider `${base}/payment-success`, while the router serving it is mounted at
 * '/api'. Live against production, GET /payment-success answered 404 and GET
 * /api/payment-success answered 200. See the ratchet
 * src/__tests__/money/robokassa-result-url-is-mounted.test.ts.
 *
 * The single repair on record before that was manual: row `fix-264623904`,
 * February 2026, metadata fix_reason "OutSum string/number comparison bug". One
 * person was patched; the channel stayed dead for five more months, because
 * nothing was watching. That is what this is: `checkPaymentStatus` exists in
 * the tree and is called from nowhere.
 *
 * WHAT A PENDING ROW DOES NOT PROVE, corrected 2026-09-08 after an earlier
 * reading of mine overstated it. The row is written when the INVOICE is issued,
 * before any money moves. Most pending rows are therefore abandoned checkouts,
 * and they always existed: 15 in May 2025, 28 in June, 17 in August, long
 * before anything broke. "208 stuck" is not "208 people were robbed", and the
 * sum of their stars is not a debt.
 *
 * The signal is the RATIO, not the count, and it must be read PER CHANNEL.
 * Robokassa ran 9/6, 11/24, 8/15 completed-against-pending from its first month
 * -- abandonment, and normal. Then 0/18 in November 2025 and zero completions
 * in every month after. Abandonment does not explain a completion rate of
 * exactly zero; that is the defect, and it is what the gate watches for.
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

  /*
   * PER CHANNEL, because the union lies. A single completed/pending pair over
   * every payment method reads as "top-ups are broken" when in fact one channel
   * is healthy and another is dead -- which is exactly the wrong story this
   * file used to tell.
   *
   * The control is that the breakdown must ADD UP to the two totals counted
   * independently above. That is what catches the failure mode this script is
   * most exposed to: rows are read in pages, and a silent truncation would
   * quietly shrink every channel while still looking like a tidy table.
   */
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await topUps(
      db
        .from('payments_v2')
        .select('payment_method,status,payment_date')
        .order('payment_date', { ascending: true })
    ).range(from, from + PAGE - 1)
    if (error) {
      console.error('cannot read the channel breakdown:', error.message)
      process.exit(2)
    }
    rows.push(...data)
    if (data.length < PAGE) break
  }

  const byChannel = new Map()
  for (const r of rows) {
    const name = r.payment_method || '(none)'
    if (!byChannel.has(name))
      byChannel.set(name, { ok: 0, pending: 0, lastOk: '' })
    const c = byChannel.get(name)
    if (r.status === 'COMPLETED') {
      c.ok++
      if ((r.payment_date || '') > c.lastOk) c.lastOk = r.payment_date || ''
    } else if (r.status === 'PENDING') c.pending++
  }

  let sumOk = 0
  let sumPending = 0
  for (const c of byChannel.values()) {
    sumOk += c.ok
    sumPending += c.pending
  }
  if (sumOk !== everDone.n || sumPending !== everPending.n) {
    console.error('SELF-CHECK FAILED: the channel breakdown does not add up.')
    console.error(
      `  completed: ${sumOk} across channels vs ${everDone.n} counted directly`
    )
    console.error(
      `  pending:   ${sumPending} across channels vs ${everPending.n} counted directly`
    )
    console.error('A table that does not reconcile is a truncated read, not a')
    console.error('finding. Refusing to print it.')
    process.exit(2)
  }

  console.log(
    'BY CHANNEL   (a dead channel beside a live one, not one average)'
  )
  const live = []
  for (const [name, c] of [...byChannel.entries()].sort(
    (a, b) => b[1].ok + b[1].pending - (a[1].ok + a[1].pending)
  )) {
    if (c.ok + c.pending === 0) continue
    const rate =
      c.ok + c.pending > 0 ? Math.round((100 * c.ok) / (c.ok + c.pending)) : 0
    console.log(
      `  ${name.padEnd(24)} ok=${String(c.ok).padStart(4)} pending=${String(c.pending).padStart(4)}` +
        `  ${String(rate).padStart(3)}%  lastOK=${c.lastOk ? c.lastOk.slice(0, 10) : 'NEVER'}`
    )
    if (c.ok > 0) live.push(name)
  }
  console.log(
    `  -- ${live.length} of ${byChannel.size} channels have ever credited anybody`
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
