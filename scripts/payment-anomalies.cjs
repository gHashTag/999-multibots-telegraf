#!/usr/bin/env node
/**
 * EVERYTHING ODD ABOUT THE MONEY, IN ONE PASS.
 *
 * The owner asked for "all payment anomalies". The existing tools each answer
 * one question -- `tri stuck` per channel, `tri reconcile` against Robokassa,
 * `tri ledger` for the invariants inside a window -- and each of them is
 * narrow on purpose. This is the sweep across the whole table, and every check
 * below exists because its shape has cost money at least once in this project.
 *
 * WHAT IT IS NOT. It does not decide anything and it writes nothing. Several
 * findings below are EXPECTED (a subscription credits zero stars; an old
 * abandoned invoice stays pending for ever) and are printed as counts rather
 * than as alarms, because a list where everything is red teaches nobody to
 * look twice.
 *
 * WHAT IT CANNOT SEE. Telegram Stars has no "was this invoice paid" lookup:
 * the `successful_payment` update is the only signal there will ever be. So a
 * pending Stars row cannot be verified against anybody -- unlike Robokassa,
 * where the provider remembers. That limit is printed, not hidden.
 *
 *   railway run -s 999-multibots-telegraf node scripts/payment-anomalies.cjs
 *
 * Exit: 0 nothing needs a person, 1 something does, 2 the table is unreadable.
 */
'use strict'

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const yellow = s => wrap(33, s)
const bold = s => wrap(1, s)

const DAY = 24 * 60 * 60 * 1000

/**
 * THE BALANCE, AS THE DATABASE COMPUTES IT.
 *
 * Not a column: the sum of `stars` over COMPLETED rows, MONEY_OUTCOME
 * subtracted and everything else added. Copied here from the money map rather
 * than guessed, because every number below depends on it.
 */
function balanceOf(rows) {
  let sum = 0
  for (const r of rows) {
    if (r.status !== 'COMPLETED') continue
    const stars = Number(r.stars) || 0
    sum += r.type === 'MONEY_OUTCOME' ? -stars : stars
  }
  return sum
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error(
      'Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. Run it as\n' +
        '  railway run -s 999-multibots-telegraf node scripts/payment-anomalies.cjs'
    )
    process.exitCode = 2
    return
  }
  const { createClient } = require('@supabase/supabase-js')
  const db = createClient(url, key)

  /*
   * The whole table, in pages. A LIMIT would make every count below a lower
   * bound dressed as a number -- and the interesting rows are the old ones.
   */
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('payments_v2')
      .select(
        'inv_id,telegram_id,status,type,stars,amount,payment_method,payment_date,bot_name,description'
      )
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error(`could not read payments_v2: ${error.message}`)
      process.exitCode = 2
      return
    }
    rows.push(...data)
    if (data.length < PAGE) break
  }

  if (rows.length < 100) {
    // The table has held thousands for a year; a short read is a broken
    // reader, and every "clean" answer below would be meaningless.
    console.error(`only ${rows.length} rows read -- the reader is broken`)
    process.exitCode = 2
    return
  }

  console.log(bold(`payments_v2: ${rows.length} rows`))
  console.log('')

  const now = Date.now()
  let needsAPerson = 0

  /* 1. PENDING, BY CHANNEL AND BY AGE -------------------------------------- */
  const pending = rows.filter(r => r.status === 'PENDING')
  const fresh = pending.filter(r => now - Date.parse(r.payment_date) < 2 * DAY)
  const byMethod = {}
  for (const r of pending) {
    const m = r.payment_method || '(none)'
    byMethod[m] = (byMethod[m] || 0) + 1
  }
  console.log(bold('invoices that never completed'))
  for (const [m, n] of Object.entries(byMethod).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${m}`)
  }
  if (fresh.length) {
    needsAPerson++
    console.log(
      red(`  ${fresh.length} of them are younger than 48 hours`) +
        ' -- a live cashier failing now, not an old abandoned checkout'
    )
  } else {
    console.log(dim('  none younger than 48 hours: no cashier is failing now'))
  }
  console.log(
    dim(
      '  Robokassa: ask the provider with `tri reconcile`. Telegram Stars: there' +
        ' is no such question to ask -- the successful_payment update is the only' +
        ' signal, so a pending Stars row can never be verified against anybody.'
    )
  )
  console.log('')

  /* 2. A BALANCE BELOW ZERO ------------------------------------------------ */
  const byPerson = new Map()
  for (const r of rows) {
    const id = String(r.telegram_id)
    if (!byPerson.has(id)) byPerson.set(id, [])
    byPerson.get(id).push(r)
  }
  const negative = []
  for (const [id, theirs] of byPerson) {
    const b = balanceOf(theirs)
    if (b < 0) negative.push({ id, balance: b })
  }
  console.log(bold('people whose balance is below zero'))
  if (negative.length) {
    needsAPerson++
    for (const n of negative
      .sort((a, b) => a.balance - b.balance)
      .slice(0, 10)) {
      console.log(`  ${red(String(n.balance).padStart(8))}  ${n.id}`)
    }
    console.log(
      dim(
        '  Spending is read-check-write with no atomic RPC (#999), so a double' +
          ' tap can outrun the check. A negative balance is that race, settled.'
      )
    )
  } else {
    console.log(green('  none'))
  }
  console.log('')

  /* 3. A CREDIT THAT CANNOT BE DEDUPLICATED -------------------------------- */
  const credits = rows.filter(
    r => r.status === 'COMPLETED' && r.type !== 'MONEY_OUTCOME'
  )
  const keyless = credits.filter(r => !r.inv_id)
  const recentKeyless = keyless.filter(
    r => now - Date.parse(r.payment_date) < 90 * DAY
  )
  console.log(bold('credits with no key to deduplicate them'))
  console.log(
    `  ${keyless.length} of ${credits.length} credits, ${recentKeyless.length} in the last 90 days`
  )
  if (recentKeyless.length) {
    needsAPerson++
    console.log(
      red('  a redelivery of any of these would credit a second time')
    )
  } else {
    console.log(dim('  historical only: nothing new can be delivered twice'))
  }
  console.log('')

  /* 4. TWO ROWS UNDER ONE KEY ---------------------------------------------- */
  const seen = new Map()
  const dupes = []
  for (const r of rows) {
    if (!r.inv_id) continue
    const k = String(r.inv_id)
    if (seen.has(k)) dupes.push(k)
    else seen.set(k, r)
  }
  console.log(bold('one key, more than one row'))
  if (dupes.length) {
    needsAPerson++
    console.log(
      red(`  ${dupes.length}: ${[...new Set(dupes)].slice(0, 5).join(', ')}`)
    )
    console.log(
      dim('  UNIQUE(inv_id) is the backstop against a double credit.')
    )
  } else {
    console.log(green('  none -- UNIQUE(inv_id) is holding'))
  }
  console.log('')

  /* 5. A CHARGE THAT CHARGED NOTHING --------------------------------------- */
  const zeroCharges = rows.filter(
    r =>
      r.status === 'COMPLETED' &&
      r.type === 'MONEY_OUTCOME' &&
      (Number(r.stars) || 0) === 0
  )
  const recentZero = zeroCharges.filter(
    r => now - Date.parse(r.payment_date) < 90 * DAY
  )
  console.log(bold('work recorded as paid for, at a price of zero'))
  console.log(
    `  ${zeroCharges.length} all time, ${recentZero.length} in the last 90 days`
  )
  if (recentZero.length) needsAPerson++
  console.log(
    dim(
      '  Not always wrong: a compensating debit beside a club fee is one of' +
        ' these by design. Wrong when it is the only row of a generation.'
    )
  )
  console.log('')

  /* 6. THE LARGEST MOVEMENTS OF THE LAST MONTH ----------------------------- */
  const month = rows.filter(
    r => r.status === 'COMPLETED' && now - Date.parse(r.payment_date) < 30 * DAY
  )
  const top = [...month]
    .sort((a, b) => (Number(b.stars) || 0) - (Number(a.stars) || 0))
    .slice(0, 5)
  console.log(bold('the largest movements of the last 30 days'))
  if (!top.length) console.log(dim('  nothing completed in the last 30 days'))
  for (const r of top) {
    console.log(
      `  ${String(r.stars).padStart(7)}⭐  ${String(r.type).padEnd(14)}` +
        ` ${String(r.payment_date).slice(0, 10)}  ${String(r.description || '').slice(0, 44)}`
    )
  }
  console.log('')

  /* 7. MONEY FOR SOMEBODY WHO IS NOT IN `users` ---------------------------- */
  const ids = [...byPerson.keys()]
  const known = new Set()
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db
      .from('users')
      .select('telegram_id')
      .in('telegram_id', ids.slice(i, i + 500))
    for (const u of data || []) known.add(String(u.telegram_id))
  }
  const ghosts = ids.filter(id => !known.has(id))
  console.log(bold('payments for somebody with no users row'))
  console.log(`  ${ghosts.length} people`)
  console.log(
    dim(
      '  updateUserBalance answers false for these without throwing, so a' +
        ' credit to a ghost payer fails silently unless the result is read.'
    )
  )

  console.log('')
  if (needsAPerson) {
    console.log(yellow(`${needsAPerson} finding(s) above want a person.`))
    process.exitCode = 1
  } else {
    console.log(green('nothing here needs a person today.'))
  }
}

main()
