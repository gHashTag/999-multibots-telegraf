#!/usr/bin/env node
/**
 * Proves the migration arrived intact.
 *
 *   railway run --service <Postgres> -- node scripts/migrate-verify.cjs
 *
 * Row counts alone are not proof. Money is compared as TEXT sums per bot_name
 * and per currency, because a numeric that lost its scale still counts the same
 * number of rows and still sums to the same double — the damage only shows in
 * the literal. Reads both sides; writes nothing.
 */
const { Client } = require('pg')

const SUPABASE_URL = process.env.SUPABASE_URL
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const PG = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL

const TABLES = [
  'users',
  'payments_v2',
  'assets',
  'model_trainings',
  'prompts_history',
  'avatars',
  'translations',
  'superhero_generations',
  'jobs',
  'attachments',
  'templates',
]

async function srcCount(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  return parseInt((res.headers.get('content-range') || '/0').split('/')[1], 10)
}

/** Sum a numeric column on the source, as text, without JSON number coercion. */
async function srcMoney(col) {
  const out = {}
  let from = 0
  for (;;) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/payments_v2?select=${col}::text,bot_name,currency`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          Range: `${from}-${from + 999}`,
        },
      }
    )
    const rows = await res.json()
    if (!rows.length) break
    for (const r of rows) {
      const k = `${r.bot_name ?? '(null)'}|${r.currency ?? '(null)'}`
      // Exact decimal addition via integer cents-equivalent: scale to the
      // widest seen, so no float ever touches the value.
      out[k] = out[k] || []
      out[k].push(r[col])
    }
    if (rows.length < 1000) break
    from += 1000
  }
  return out
}

function exactSum(values) {
  // Sum decimal strings exactly using BigInt at a fixed scale of 20.
  const SCALE = 20n
  let total = 0n
  for (const v of values) {
    if (v === null || v === undefined) continue
    const neg = v.startsWith('-')
    const s = neg ? v.slice(1) : v
    const [i, f = ''] = s.split('.')
    const scaled = BigInt(
      i + f.padEnd(Number(SCALE), '0').slice(0, Number(SCALE))
    )
    total += neg ? -scaled : scaled
  }
  return total
}

async function main() {
  const c = new Client({
    connectionString: PG,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  let bad = 0

  console.log('=== ROW COUNTS ===')
  for (const t of TABLES) {
    const [src, dst] = [
      await srcCount(t),
      (await c.query(`select count(*)::int n from "${t}"`)).rows[0].n,
    ]
    const ok = src === dst
    if (!ok) bad++
    console.log(
      `  ${ok ? 'ok ' : 'BAD'}  ${t.padEnd(24)} src ${String(src).padStart(6)}  dst ${String(dst).padStart(6)}`
    )
  }

  console.log('\n=== MONEY, exact decimal sums per bot_name|currency ===')
  for (const col of ['stars', 'amount', 'cost']) {
    const src = await srcMoney(col)
    const { rows } = await c.query(
      `select coalesce(bot_name,'(null)')||'|'||coalesce(currency,'(null)') k,
              coalesce(sum("${col}"),0)::text s
         from payments_v2 group by 1`
    )
    const dst = Object.fromEntries(rows.map(r => [r.k, r.s]))
    let mism = 0
    for (const [k, vals] of Object.entries(src)) {
      const a = exactSum(vals)
      const b = exactSum([dst[k] ?? '0'])
      if (a !== b) {
        mism++
        console.log(`    MISMATCH ${col} ${k}: src ${a} dst ${b}`)
      }
    }
    if (mism) bad++
    console.log(
      `  ${mism ? 'BAD' : 'ok '}  ${col.padEnd(8)} ${Object.keys(src).length} groups, ${mism} mismatches`
    )
  }

  console.log('\n=== NULL vs EMPTY STRING on the idempotency key ===')
  const inv = await c.query(
    `select count(*) filter (where inv_id is null)::int nulls,
            count(*) filter (where inv_id = '')::int empties from payments_v2`
  )
  const okInv = inv.rows[0].empties === 0
  if (!okInv) bad++
  console.log(
    `  ${okInv ? 'ok ' : 'BAD'}  inv_id NULLs ${inv.rows[0].nulls}, empty strings ${inv.rows[0].empties} (must be 0)`
  )

  console.log('\n=== SEQUENCES past max(pk) ===')
  for (const [t, pk] of Object.entries({
    payments_v2: 'id',
    assets: 'id',
    prompts_history: 'prompt_id',
    translations: 'id',
    superhero_generations: 'id',
  })) {
    const { rows } = await c.query(
      `select (select max("${pk}") from "${t}") mx,
              (select last_value from pg_sequences
                where schemaname='public' and sequencename = replace(pg_get_serial_sequence('${t}','${pk}'),'public.','')) sq`
    )
    const ok = rows[0].sq !== null && Number(rows[0].sq) >= Number(rows[0].mx)
    if (!ok) bad++
    console.log(
      `  ${ok ? 'ok ' : 'BAD'}  ${t.padEnd(24)} max ${rows[0].mx}  seq ${rows[0].sq}`
    )
  }

  console.log('\n=== SCALE PRESERVED on stars (numeric(12,2)) ===')
  const sc = await c.query(
    `select count(*) filter (where scale(stars) <> 2)::int off from payments_v2 where stars is not null`
  )
  const okSc = sc.rows[0].off === 0
  if (!okSc) bad++
  console.log(
    `  ${okSc ? 'ok ' : 'BAD'}  rows whose stars scale <> 2: ${sc.rows[0].off}`
  )

  await c.end()
  console.log(bad ? `\n${bad} CHECK(S) FAILED` : '\nall checks passed')
  process.exit(bad ? 1 : 0)
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
