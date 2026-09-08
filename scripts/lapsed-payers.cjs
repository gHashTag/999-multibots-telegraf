#!/usr/bin/env node
/**
 * People who once paid and stopped -- the only segment in this product that
 * has already answered the hard question.
 *
 * WHY THIS ONE. 2380 people have arrived; 98 ever completed a top-up on a real
 * rail; one has paid in the last six months. Any message to "everybody" is a
 * message to 2300 people who never valued the thing enough to pay. These 98
 * did. That is the difference between a segment and a mailing list.
 *
 * SELECT-ONLY, AND IT SENDS NOTHING. Writing to live people needs the owner's
 * explicit word every time; this prints who they are and what state they are
 * in, so that decision can be made with the numbers in front of it.
 *
 * Aggregates by default. Per-person rows only under --detail, so a routine run
 * does not spray identifiers into a terminal or a log.
 */
const DAYS = Number(process.env.LAPSED_DAYS || 365)
const RAIL = /^(Robokassa|Telegram)$/i

async function pageAll(url, key, table, select, extra = '') {
  // Unique-key paging. Ordering by a timestamp is not stable here: 1559 users
  // share one created_at second, and range-paging over it returned 1787 people
  // where there were 2345. The distinct-id check below is what caught that,
  // and a row-count check would not have.
  const out = []
  let last = null
  for (;;) {
    const f = last === null ? '' : `&id=gt.${last}`
    const r = await fetch(
      `${url}/rest/v1/${table}?select=${select}${extra}${f}&order=id.asc&limit=1000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    )
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    out.push(...rows)
    last = rows[rows.length - 1].id
    if (rows.length < 1000) break
  }
  const ids = new Set(out.map(r => r.id))
  if (ids.size !== out.length) {
    console.error(
      `paging returned ${out.length} rows but only ${ids.size} distinct ids -- unstable, refusing`
    )
    process.exit(2)
  }
  return out
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. Reads only; sends nothing.'
    )
    process.exit(2)
  }
  const detail = process.argv.includes('--detail')
  const now = Date.now()
  const cut = new Date(now - DAYS * 864e5).toISOString()

  const pay = await pageAll(
    url,
    key,
    'payments_v2',
    'id,telegram_id,payment_date,type,stars,amount,status,payment_method,bot_name,language,description,is_test,is_system_payment'
  )

  // A filter over fields that were never fetched matches nothing and reports
  // it as "none found". The first version of this script selected ten columns
  // and then asked three others whether a credit was seeded: every answer was
  // no, the total came out 757112 instead of 59806, and the line printing it
  // still said the seeding had been removed. Absence of a field is not absence
  // of the thing.
  const need = ['description', 'is_test', 'is_system_payment']
  const got = pay.length ? Object.keys(pay[0]) : []
  const absent = need.filter(k => !got.includes(k))
  if (absent.length) {
    console.error(
      'cannot tell seeded credits apart without: ' +
        absent.join(', ') +
        '\nrefusing rather than reporting a balance that counts test data as money'
    )
    process.exit(2)
  }

  const byUser = new Map()
  for (const r of pay) {
    if (!byUser.has(r.telegram_id)) byUser.set(r.telegram_id, [])
    byUser.get(r.telegram_id).push(r)
  }

  const payers = []
  for (const [uid, rows] of byUser) {
    const tops = rows.filter(
      r =>
        r.type === 'MONEY_INCOME' &&
        RAIL.test(r.payment_method || '') &&
        String(r.status).toUpperCase() === 'COMPLETED'
    )
    if (!tops.length) continue
    tops.sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    const lastPay = tops[tops.length - 1]
    const spends = rows.filter(r => r.type === 'MONEY_OUTCOME')
    spends.sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    // A balance that counts seeded credits is not this person's balance.
    // The raw sum over these 80 people came to 757112 stars; 697305 of that
    // -- ninety-two percent -- was TEST_DATA and system seeding, and the raw
    // figure would have been quoted at the owner as money owed to real people.
    const isSeed = r =>
      r.is_test === true ||
      r.is_system_payment === true ||
      /TEST_DATA|Testing|Migration/i.test(r.description || '')
    const signed = r =>
      (r.type === 'MONEY_INCOME' ? 1 : -1) * (Number(r.stars) || 0)
    const rawBalance = rows.reduce((s, r) => s + signed(r), 0)
    const seeded = rows.filter(isSeed).reduce((s, r) => s + signed(r), 0)
    // TWO QUESTIONS, TWO NUMBERS, AND THEY ARE NOT INTERCHANGEABLE.
    // rawBalance is what the bot shows this person and what they can spend
    // today. balance is what is left once seeded credits are taken out -- what
    // they hold because they paid for it. Picking one silently produced two
    // different answers from two of my own commands (143788 against 59806),
    // which is how the difference was noticed at all.
    const balance = rawBalance - seeded
    payers.push({
      uid,
      firstPay: tops[0].payment_date,
      lastPay: lastPay.payment_date,
      payments: tops.length,
      money: tops.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      balance: Math.round(balance * 100) / 100,
      rawBalance: Math.round(rawBalance * 100) / 100,
      seeded: Math.round(seeded * 100) / 100,
      lastSpend: spends.length ? spends[spends.length - 1].payment_date : null,
      bot: lastPay.bot_name || '?',
      lang: lastPay.language || '?',
    })
  }

  const lapsed = payers.filter(p => p.lastPay < cut)
  const active = payers.length - lapsed.length
  console.log(
    `people who ever completed a top-up on a real rail: ${payers.length}`
  )
  console.log(`  paid within the last ${DAYS} days: ${active}`)
  console.log(
    `  lapsed (no top-up since ${cut.slice(0, 10)}): ${lapsed.length}`
  )

  // The message is not the same for these two, which is the point of splitting
  // them: one group left money on the table, the other spent what they bought.
  const withStars = lapsed.filter(p => p.balance > 0)
  const spentOut = lapsed.filter(p => p.balance <= 0)
  const spendable = lapsed.filter(p => p.rawBalance > 0)
  const sum = a => a.reduce((s, p) => s + p.balance, 0)
  const med = a => {
    if (!a.length) return 0
    const v = a.map(p => p.balance).sort((x, y) => x - y)
    return v[Math.floor(v.length / 2)]
  }
  // A total is never printed alone here. The top holder was 31.8% of it, so
  // the sum describes one person more than it describes the group.
  const top = [...withStars].sort((a, b) => b.balance - a.balance)
  const total = sum(withStars)
  const share = total > 0 ? (100 * (top[0] ? top[0].balance : 0)) / total : 0
  const seededHolders = withStars.filter(p => Math.abs(p.seeded) > 0).length
  console.log(`\n  of the lapsed, still holding stars: ${withStars.length}`)
  console.log(
    `    median ${med(withStars)}, total ${Math.round(total)} (seeding already removed)`
  )
  console.log(
    `    top holder is ${share.toFixed(1)}% of that total -- do not quote the sum alone`
  )
  console.log(
    `    balances that had seeded credits stripped out: ${seededHolders}`
  )
  const rawTotal = spendable.reduce((s, p) => s + p.rawBalance, 0)
  console.log(
    `  and the other question -- what they can SPEND today, seeding included:`
  )
  console.log(`    ${spendable.length} people, total ${Math.round(rawTotal)}`)
  console.log(
    `    the gap between the two totals is seeded credit that is spendable but was never paid for`
  )
  console.log(`  of the lapsed, balance spent out:   ${spentOut.length}`)

  const byBot = new Map()
  for (const p of lapsed) byBot.set(p.bot, (byBot.get(p.bot) || 0) + 1)
  console.log(
    '\n  which bot they last paid through (that is where a message would come from):'
  )
  ;[...byBot.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([b, n]) => console.log(`    ${String(n).padStart(4)}  ${b}`))

  const byYear = new Map()
  for (const p of lapsed) {
    const k = p.lastPay.slice(0, 7)
    byYear.set(k, (byYear.get(k) || 0) + 1)
  }
  console.log('\n  when they last paid:')
  ;[...byYear.entries()]
    .sort()
    .forEach(([k, n]) =>
      console.log(`    ${k}  ${'#'.repeat(Math.min(n, 40))} ${n}`)
    )

  if (detail) {
    console.log(
      '\n--detail: one row per person. This is personal data; do not paste it anywhere.'
    )
    lapsed.sort((a, b) => b.money - a.money)
    for (const p of lapsed) {
      console.log(
        `  tg=${String(p.uid).padEnd(12)} last_paid=${p.lastPay.slice(0, 10)} paid=${String(p.payments).padStart(3)}x ` +
          `money=${String(Math.round(p.money)).padStart(7)} balance=${String(p.balance).padStart(8)} ` +
          `last_spend=${p.lastSpend ? p.lastSpend.slice(0, 10) : 'never'} bot=${p.bot}`
      )
    }
  } else {
    console.log(
      '\n  (--detail prints the people; left off by default on purpose)'
    )
  }
  console.log(
    '\nNobody is messaged by this script. Writing to living people needs your word,' +
      '\nevery time, and this is only the list to decide from.'
  )
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
