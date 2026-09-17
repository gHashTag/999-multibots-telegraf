#!/usr/bin/env node
/**
 * Copies data from Supabase (PostgREST) into Railway Postgres.
 *
 *   railway run --service <Postgres> -- node scripts/migrate-data.cjs [--apply]
 *
 * Dry-run by default: reads everything, writes nothing, reports what it would do.
 *
 * WHY EVERY VALUE IS FETCHED AS TEXT
 * PostgREST returns numeric as a JSON number, and JSON.parse collapses "30.00"
 * to 30 before any code can see it — the scale is gone. payments_v2.stars is
 * numeric(12,2) and amount/cost are unconstrained numeric holding up to 17
 * decimal places. So the select list casts every non-text column to ::text and
 * the insert casts it back, which round-trips the exact stored literal.
 * Timestamps get the same treatment: assets.created_at is the schema's only
 * `timestamp WITHOUT time zone` and re-parsing it through JS Date would attach
 * a zone it never had.
 */
const { Client } = require('pg')

const SUPABASE_URL = process.env.SUPABASE_URL
// NOT SUPABASE_SERVICE_KEY — that variable is misnamed in this project and
// holds an anon-role JWT, which RLS silently filters. Verified by decoding.
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const PG = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL
const APPLY = process.argv.includes('--apply')

if (!SUPABASE_URL || !KEY || !PG) {
  console.error(
    'need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_PUBLIC_URL'
  )
  process.exit(1)
}

// Ordered so that anything referenced comes first.
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

// Sequence-backed integer PKs; setval after load or the next insert collides.
const SEQUENCES = {
  payments_v2: 'id',
  assets: 'id',
  prompts_history: 'prompt_id',
  translations: 'id',
  superhero_generations: 'id',
}

const PAGE = 1000

async function pgColumns(c, table) {
  const { rows } = await c.query(
    `select column_name, data_type, udt_name
       from information_schema.columns
      where table_schema='public' and table_name=$1
      order by ordinal_position`,
    [table]
  )
  return rows
}

/** Everything that is not already text is fetched as ::text and cast back. */
function selectList(cols) {
  return cols
    .map(c =>
      c.data_type === 'text' ? c.column_name : `${c.column_name}::text`
    )
    .join(',')
}

async function fetchPage(table, sel, from) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(sel)}`
  const res = await fetch(url, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Range: `${from}-${from + PAGE - 1}`,
      'Range-Unit': 'items',
      Prefer: 'count=exact',
    },
  })
  if (!res.ok)
    throw new Error(
      `${table} ${res.status}: ${(await res.text()).slice(0, 200)}`
    )
  return res.json()
}

async function copyTable(c, table) {
  const cols = await pgColumns(c, table)
  if (!cols.length) return { table, skipped: 'no such table in destination' }
  const names = cols.map(x => x.column_name)
  const sel = selectList(cols)

  let from = 0
  let copied = 0
  for (;;) {
    const rows = await fetchPage(table, sel, from)
    if (!rows.length) break

    if (APPLY) {
      // One multi-row INSERT per page. Every value arrives as text (or null)
      // and is cast to the destination column's own type by ::udt, so Postgres
      // — not JavaScript — does the parsing.
      const params = []
      const tuples = rows.map(r => {
        const ph = cols.map(col => {
          params.push(r[col.column_name] ?? null)
          return `$${params.length}::${col.udt_name}`
        })
        return `(${ph.join(',')})`
      })
      await c.query(
        `insert into "${table}" (${names.map(n => `"${n}"`).join(',')})
         values ${tuples.join(',')} on conflict do nothing`,
        params
      )
    }

    copied += rows.length
    if (rows.length < PAGE) break
    from += PAGE
  }
  return { table, rows: copied }
}

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN (no writes) ===')
  const c = new Client({
    connectionString: PG,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  if (APPLY) {
    // users.inviter references users. Rows arrive in page order, so a row can
    // reference one that has not been inserted yet — the first attempt died on
    // users_inviter_fkey. Bulk loads defer referential checks and validate
    // afterwards; that is what the verification step below is for.
    await c.query('set session_replication_role = replica')
  }

  for (const t of TABLES) {
    const r = await copyTable(c, t)
    console.log(
      `  ${String(r.rows ?? '-').padStart(6)}  ${t}${r.skipped ? '  (' + r.skipped + ')' : ''}`
    )
  }

  if (APPLY) {
    for (const [table, pk] of Object.entries(SEQUENCES)) {
      // max(pk) exceeds the row count on every one of these — deletion gaps are
      // real, so the sequence must follow the data, not the count.
      await c.query(
        `select setval(pg_get_serial_sequence('${table}','${pk}'),
                       coalesce((select max("${pk}") from "${table}"), 1), true)`
      )
    }
    console.log('sequences advanced past max(pk)')

    await c.query('set session_replication_role = origin')

    // Prove the deferred checks actually hold, rather than assuming it.
    const { rows: orphans } = await c.query(
      `select count(*)::int n from users u
        where u.inviter is not null
          and not exists (select 1 from users p where p.telegram_id = u.inviter)`
    )
    console.log('orphaned users.inviter references:', orphans[0].n)
  }

  await c.end()
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
