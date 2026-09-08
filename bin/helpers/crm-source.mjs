/**
 * WHICH DATABASE IS ACTUALLY LIVE.
 *
 * The platform has two copies of `users` and `payments_v2`: Supabase cloud and
 * Railway Postgres. Measured 2026-09-08, they had diverged -- Railway's payment
 * table was twelve days behind -- and `crm-tools.ts` reads Supabase while every
 * other agent table (tg_sessions, hive_events, crm_touches) is on Railway.
 *
 * A sales tool pointed at the stale copy reports last fortnight's revenue as
 * today's. This says which is fresher, in one line, so nobody has to find that
 * out by trusting a number.
 *
 * Exit 1 when the copy the CRM reads is NOT the freshest.
 */
import pg from 'pg'

const railway = process.env.DB
const supaUrl = process.env.SU
const supaKey = process.env.SK

if (!railway || !supaUrl || !supaKey) {
  console.error('missing DB / SU / SK -- check NOT performed')
  process.exit(2)
}

const age = (iso) => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.round((Date.now() - t) / 86400000)
}

const client = new pg.Client({
  connectionString: railway,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const rows = {}
for (const [table, col] of [
  ['users', 'created_at'],
  ['payments_v2', 'payment_date'],
]) {
  try {
    const r = await client.query(
      `SELECT count(*)::int n, max(${col}) newest FROM ${table}`
    )
    rows[table] = { railway: { n: r.rows[0].n, newest: r.rows[0].newest } }
  } catch {
    rows[table] = { railway: null }
  }
}
await client.end()

const headers = {
  apikey: supaKey,
  Authorization: `Bearer ${supaKey}`,
  Prefer: 'count=exact',
  Range: '0-0',
  'Range-Unit': 'items',
}
for (const [table, col] of [
  ['users', 'created_at'],
  ['payments_v2', 'payment_date'],
]) {
  try {
    const r = await fetch(
      `${supaUrl}/rest/v1/${table}?select=${col}&order=${col}.desc&limit=1`,
      { headers }
    )
    const total = (r.headers.get('content-range') || '/?').split('/')[1]
    const body = await r.json().catch(() => [])
    rows[table].supabase = { n: Number(total), newest: body?.[0]?.[col] ?? null }
  } catch {
    rows[table].supabase = null
  }
}

let stale = false
for (const [table, v] of Object.entries(rows)) {
  const rAge = v.railway?.newest ? age(v.railway.newest) : null
  const sAge = v.supabase?.newest ? age(v.supabase.newest) : null
  const fresher =
    rAge === null ? 'supabase' : sAge === null ? 'railway' : rAge <= sAge ? 'railway' : 'supabase'
  console.log(
    `${table.padEnd(12)} railway ${String(v.railway?.n ?? '-').padStart(6)} ` +
      `(${rAge === null ? '?' : rAge + 'd'})   ` +
      `supabase ${String(v.supabase?.n ?? '-').padStart(6)} ` +
      `(${sAge === null ? '?' : sAge + 'd'})   fresher: ${fresher}`
  )
  // crm-tools.ts reads Supabase. Anything fresher on Railway means the CRM is
  // reporting from the wrong copy.
  if (fresher === 'railway') stale = true
}

console.log('')
console.log(
  stale
    ? 'CRM reads Supabase, but Railway is fresher -- the CRM is on the wrong copy'
    : 'CRM reads Supabase, which is the freshest copy -- correct for now'
)
process.exit(stale ? 1 : 0)
