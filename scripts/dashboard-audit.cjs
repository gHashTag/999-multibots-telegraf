#!/usr/bin/env node
/**
 * Re-measure what the owner dashboard CLAIMS, against the ledger it claims about.
 *
 * The dashboard is the one artifact the owner reads, and it is assembled over a
 * day: a figure measured at 06:00 sits beside one measured at 20:00, and
 * nothing has ever checked whether the first is still true. "The summary is
 * read first and updated last" is a rule this project learned the hard way --
 * counters of 4/6/3 against a reality of 5/9/3, and every wrong one was a
 * derived number rather than a measurement.
 *
 * THE CLAIMED VALUES ARE READ FROM THE ARTIFACT, NOT HARDCODED. A table of
 * expected numbers inside this file would be a second copy of the dashboard,
 * and the two would part company on the first edit -- which is the very defect
 * this checks for. Each claim below carries a pattern that finds the number in
 * the HTML and a function that measures it now.
 *
 * SELECT-ONLY. Reads the dashboard, reads the ledger, writes neither.
 */
const fs = require('fs')

/** Pull the first capture group from the dashboard, digits only. */
function claimed(html, re) {
  const m = re.exec(html)
  if (!m) return null
  return Number(String(m[1]).replace(/[\s ,]/g, ''))
}

const RAIL = /^(Robokassa|Telegram)$/i
const isCompleted = r => String(r.status).toUpperCase() === 'COMPLETED'
const topUp = r =>
  r.type === 'MONEY_INCOME' &&
  RAIL.test(r.payment_method || '') &&
  isCompleted(r)

const CLAIMS = [
  {
    // The dashboard writes the pair as COMPLETED/PENDING, so the first number
    // is the completed one. The label said PENDING while the measurement
    // counted COMPLETED -- they agreed numerically only because the label was
    // wrong about which number it named.
    label: 'Robokassa rows COMPLETED (first of the pair)',
    find: /Robokassa\s+(\d+)\s*\/\s*\d+/,
    measure: rows =>
      rows.filter(
        r => /robokassa/i.test(r.payment_method || '') && isCompleted(r)
      ).length,
  },
  {
    label: 'Robokassa rows still PENDING (second of the pair)',
    find: /Robokassa\s+\d+\s*\/\s*(\d+)/,
    measure: rows =>
      rows.filter(
        r =>
          /robokassa/i.test(r.payment_method || '') &&
          String(r.status).toUpperCase() === 'PENDING'
      ).length,
  },
  {
    label: 'people who ever completed a top-up',
    find: /заплатили когда-либо:\s*(\d+)/, // cyrillic-ok: matches the dashboard's own Russian wording
    measure: rows => new Set(rows.filter(topUp).map(r => r.telegram_id)).size,
  },
  {
    label: 'people in the users table',
    find: /всего людей в базе:\s*([\d\s ]+)/, // cyrillic-ok: matches the dashboard's own Russian wording
    measure: (rows, users) => users,
  },
  {
    label: 'people with any money row',
    find: /хоть одна денежная строка:\s*(\d+)/, // cyrillic-ok: matches the dashboard's own Russian wording
    measure: rows => new Set(rows.map(r => r.telegram_id)).size,
  },
  {
    label: 'people with any charge',
    find: /хоть одно списание:\s*(\d+)/, // cyrillic-ok: matches the dashboard's own Russian wording
    measure: rows =>
      new Set(
        rows.filter(r => r.type === 'MONEY_OUTCOME').map(r => r.telegram_id)
      ).size,
  },
  {
    label: 'people who paid in the last 12 months',
    find: /за последние 12 месяцев:\s*(\d+)/, // cyrillic-ok: matches the dashboard's own Russian wording
    measure: rows =>
      new Set(
        rows
          .filter(
            r =>
              topUp(r) &&
              r.payment_date >=
                new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)
          )
          .map(r => r.telegram_id)
      ).size,
  },
]

/**
 * The checker checks itself: every claim must be findable in the artifact it
 * is given. A pattern that stopped matching would silently drop its claim from
 * the report, and a shorter report reads exactly like a cleaner one.
 */
function selfCheck(html) {
  const lost = CLAIMS.filter(c => claimed(html, c.find) === null)
  if (lost.length) {
    console.error(
      'These claims are no longer findable in the dashboard:\n  ' +
        lost.map(c => c.label).join('\n  ') +
        '\nEither the wording changed or the claim was removed. Fix the pattern' +
        '\nor drop the claim — a checker that quietly stops checking is worse' +
        '\nthan one that fails.'
    )
    process.exit(2)
  }
}

async function pageAll(url, key) {
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
  const file = process.argv.find(a => a.endsWith('.html'))
  if (!file) {
    console.error('usage: dashboard-audit.cjs <owner-queue.html> [--gate]')
    process.exit(2)
  }
  const html = fs.readFileSync(file, 'utf8')
  selfCheck(html)

  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. Exiting 2 (could not check), not 0.'
    )
    process.exit(2)
  }
  const rows = await pageAll(url, key)
  const usersRes = await fetch(
    `${url}/rest/v1/users?select=telegram_id&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
    }
  )
  const users = Number(
    (usersRes.headers.get('content-range') || '').split('/')[1]
  )

  let moved = 0
  console.log(`dashboard: ${file}\nledger: ${rows.length} rows\n`)
  for (const c of CLAIMS) {
    const was = claimed(html, c.find)
    const now = c.measure(rows, users)
    const same = Number(was) === Number(now)
    if (!same) moved++
    console.log(
      `  ${same ? 'ok   ' : 'MOVED'}  ${c.label.padEnd(42)} claimed ${String(was).padStart(7)}   now ${String(now).padStart(7)}`
    )
  }
  console.log(
    `\n${moved === 0 ? 'Every claim still holds.' : moved + ' claim(s) no longer hold.'}`
  )
  if (process.argv.includes('--gate') && moved > 0) process.exit(1)
}

module.exports = { CLAIMS, claimed, selfCheck }
if (require.main === module)
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
