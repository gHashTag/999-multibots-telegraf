#!/usr/bin/env node
/**
 * Invariants of the money ledger, checked against the rows themselves.
 *
 * The balance in this product is NOT a column: get_user_balance SUMS
 * payments_v2. That makes the table the ledger, and a ledger has properties a
 * reader can check without knowing which code wrote which row -- which is the
 * point, because seven different places write it and the guard that mattered
 * lived in one of them for months.
 *
 * Every number here was produced by hand first, on 2026-09-08, and each
 * invariant is written so that the hand-measured answer is the one it gives:
 *
 *   credits sharing an inv_id            0 of 1301 keys   (a unique index holds it)
 *   negative stars                     114 rows, -1026    one person, 27-28 Jun 2025
 *   outcomes charging exactly 0         19 rows           last 2025-08-24
 *   credits with no dedup key          418 rows           none since 2025-12-14
 *
 * SELECT-ONLY. It writes nothing and credits nobody.
 *
 * THE RECENT WINDOW IS THE POINT. Every one of those violations is historical,
 * and a check that only reported totals would stay red forever and be ignored
 * within a week. `--gate` fails on violations INSIDE the window (default: this
 * year), so an old scar stays visible without drowning a new one.
 */
const WINDOW_FROM = process.env.LEDGER_SINCE || '2026-01-01'

/** The invariants, each a pure function over rows so they can be self-checked. */
const INVARIANTS = [
  {
    name: 'a credit is not recorded twice under one inv_id',
    find: rows => {
      const byInv = new Map()
      for (const r of rows) {
        if (r.type !== 'MONEY_INCOME' || !r.inv_id) continue
        if (String(r.status).toUpperCase() !== 'COMPLETED') continue
        if (!byInv.has(r.inv_id)) byInv.set(r.inv_id, [])
        byInv.get(r.inv_id).push(r)
      }
      return [...byInv.values()].filter(v => v.length > 1).flat()
    },
    why: 'a redelivered payment credited twice',
  },
  {
    name: 'the sign is set by type, never by the number',
    find: rows => rows.filter(r => Number(r.stars) < 0),
    why: 'a negative OUTCOME row ADDS to a summed balance',
  },
  {
    name: 'a charge charges something',
    find: rows =>
      rows.filter(r => r.type === 'MONEY_OUTCOME' && Number(r.stars) === 0),
    why: 'work recorded as paid for, at a price of zero',
  },
  {
    /*
     * THE ONLY ONE OF THESE THAT CHECKS MEANING RATHER THAN SHAPE.
     *
     * The other four would all pass a row that says "balance top-up" and is
     * typed as a spend: the sign is positive, the amount is not zero, the key
     * is present, nothing is duplicated. Only the words disagree with the
     * type, and in a table that IS the balance, that row debits somebody for
     * paying.
     *
     * THE WORD LIST IS NARROW ON PURPOSE, AND THE FIRST VERSION WAS NOT.
     * "subscription" was in it, and it produced two false positives out of
     * three hits: a subscription is BOUGHT with stars, so it is an outflow and
     * belongs on an OUTCOME row. "payment" is absent for the same reason --
     * this table uses it in both directions. Anything ambiguous stays out: a
     * check on meaning that cries wolf gets switched off faster than one that
     * misses, and there is exactly one real violation in 17140 rows to find.
     */
    name: 'the words agree with the direction',
    find: rows => {
      const IN = /пополнени|top ?up|refund|возврат|purchase and sale/i // cyrillic-ok: matches Russian descriptions in the data
      const OUT = /generation|генерац|image to prompt|render|списан/i // cyrillic-ok: matches Russian descriptions in the data
      return rows.filter(r => {
        const d = String(r.description || '')
        if (r.type === 'MONEY_OUTCOME') return IN.test(d) && !OUT.test(d)
        if (r.type === 'MONEY_INCOME') return OUT.test(d) && !IN.test(d)
        return false
      })
    },
    why: 'the row says one direction and is typed as the other',
  },
  {
    name: 'a credit carries a key that can deduplicate it',
    find: rows =>
      rows.filter(
        r => r.type === 'MONEY_INCOME' && !r.inv_id && !r.operation_id
      ),
    why: 'nothing stops a redelivery of this one',
  },
]

/**
 * The probe checks itself before it reports. Each invariant must FIND a
 * planted violation and must NOT find one in a clean row -- a checker that has
 * never said yes is indistinguishable from a table with nothing wrong in it.
 */
function selfCheck() {
  const clean = {
    id: 1,
    type: 'MONEY_INCOME',
    status: 'COMPLETED',
    stars: 10,
    inv_id: 'A',
    operation_id: 'op',
    payment_date: '2026-06-01',
    telegram_id: '1',
  }
  const planted = [
    [
      { ...clean, id: 2 },
      { ...clean, id: 3 },
    ],
    [{ ...clean, id: 4, type: 'MONEY_OUTCOME', stars: -9 }],
    [{ ...clean, id: 5, type: 'MONEY_OUTCOME', stars: 0 }],
    [
      {
        ...clean,
        id: 7,
        type: 'MONEY_OUTCOME',
        description: 'Пополнение баланса',
      },
    ], // cyrillic-ok: the fixture text under test
    [{ ...clean, id: 6, inv_id: null, operation_id: null }],
  ]
  const problems = []
  INVARIANTS.forEach((inv, i) => {
    if (inv.find(planted[i]).length === 0)
      problems.push(`${inv.name}: misses its own planted violation`)
    if (inv.find([clean]).length !== 0)
      problems.push(`${inv.name}: flags a clean row`)
  })
  if (problems.length) {
    console.error(
      'SELF-CHECK FAILED, refusing to report:\n  ' + problems.join('\n  ')
    )
    process.exit(2)
  }
}

async function pageAll(url, key) {
  // Unique-key paging with a distinct-id check: ordering by payment_date is
  // not stable here (1559 rows share one second), and a row COUNT does not
  // catch the shuffle -- only counting distinct ids does.
  const out = []
  let last = null
  for (;;) {
    const f = last === null ? '' : `&id=gt.${last}`
    const r = await fetch(
      `${url}/rest/v1/payments_v2?select=id,telegram_id,payment_date,type,status,stars,inv_id,operation_id,payment_method,description${f}&order=id.asc&limit=1000`,
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
      `paging returned ${out.length} rows and ${ids.size} distinct ids — unstable, refusing`
    )
    process.exit(2)
  }
  return out
}

async function main() {
  selfCheck()
  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. Reads only.')
    process.exit(2)
  }
  const gate = process.argv.includes('--gate')
  const rows = await pageAll(url, key)
  console.log(`payments_v2: ${rows.length} rows, window from ${WINDOW_FROM}\n`)

  let recentTotal = 0
  for (const inv of INVARIANTS) {
    const bad = inv.find(rows)
    const recent = bad.filter(r => String(r.payment_date) >= WINDOW_FROM)
    recentTotal += recent.length
    const newest = bad.length
      ? bad
          .map(r => r.payment_date)
          .sort()
          .slice(-1)[0]
          .slice(0, 10)
      : '—'
    const mark = recent.length ? 'BROKEN' : bad.length ? 'healed' : 'clean '
    console.log(`  ${mark}  ${inv.name}`)
    console.log(
      `          all time ${String(bad.length).padStart(5)}   in window ${String(recent.length).padStart(4)}   newest ${newest}`
    )
    if (bad.length && !recent.length)
      console.log(`          (${inv.why} — historical, nothing since)`)
    if (recent.length) {
      console.log(`          ${inv.why}`)
      for (const r of recent.slice(0, 5)) {
        console.log(
          `            id=${r.id} tg=${r.telegram_id} ${String(r.payment_date).slice(0, 10)} ${r.type} ${r.stars}⭐ inv=${r.inv_id ?? '-'}`
        )
      }
    }
  }
  console.log(
    `\n${recentTotal === 0 ? 'No invariant is broken inside the window.' : recentTotal + ' row(s) break an invariant inside the window.'}`
  )
  if (gate && recentTotal > 0) process.exit(1)
}

module.exports = { INVARIANTS, selfCheck }
if (require.main === module)
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
