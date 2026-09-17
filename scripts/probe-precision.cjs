#!/usr/bin/env node
/**
 * READ-ONLY (GET only). Binary-searches the declared precision of a numeric
 * column by making PostgREST cast an over-large literal to the column type in
 * a WHERE clause. Postgres raises 22003 "numeric field overflow ... precision
 * P, scale S" which names the typmod outright.
 */
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }

async function probe(table, col, digits) {
  const v = '9'.repeat(digits)
  const res = await fetch(
    `${url}/rest/v1/${table}?select=${col}&${col}=eq.${v}&limit=1`,
    { headers: H }
  )
  const body = await res.text()
  return { digits, status: res.status, body: body.slice(0, 260) }
}

async function main() {
  for (const [t, c] of [
    ['payments_v2', 'stars'],
    ['payments_v2', 'amount'],
    ['payments_v2', 'cost'],
  ]) {
    console.log(`\n===== ${t}.${c} =====`)
    for (const d of [9, 10, 11, 12, 13, 14, 15, 16, 20, 40]) {
      const r = await probe(t, c, d)
      const hit = /overflow|precision|22003/i.test(r.body)
      console.log(
        `  ${String(d).padStart(2)} digits -> ${r.status} ${hit ? 'OVERFLOW ' + r.body : r.status === 200 ? 'ok' : r.body}`
      )
      if (hit) break
    }
  }
}
main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
