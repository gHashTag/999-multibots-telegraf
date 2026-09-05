#!/usr/bin/env node
/**
 * Read-only inventory of the Supabase database.
 *
 * Run before any migration talk:
 *   railway run --service <bot> -- node scripts/probe-supabase.cjs
 *
 * Prints no secrets, no row contents — only names, counts and shapes.
 */
const { createClient } = require('@supabase/supabase-js')

const url = process.env.SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(1)
}
const db = createClient(url, key)

// Tables referenced anywhere in src/. Passed in so the probe needs no
// introspection privileges it might not have.
const TABLES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'users',
      'payments_v2',
      'assets',
      'model_trainings',
      'prompts_history',
      'avatars',
      'bots',
      'subscriptions',
      'user_settings',
      'pending_messages',
      'feed',
      'templates',
      'leads',
      'referrals',
      'tasks',
      'broadcasts',
      'superhero_generations',
      'translations',
    ]

async function count(table) {
  const { count, error } = await db
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error)
    return { table, exists: false, reason: error.code || error.message }
  return { table, exists: true, rows: count }
}

async function shape(table) {
  const { data, error } = await db.from(table).select('*').limit(1)
  // null means "no such shape" to the caller, which then SKIPS the breakdown.
  // An error returning null therefore reads as "this table has no bot_name",
  // which is a different claim than "we could not look".
  if (error) {
    console.log(`  ОШИБКА ЧТЕНИЯ СХЕМЫ ${table}: ${error.message}`)
    return null
  }
  if (!data?.length) return null
  return Object.keys(data[0])
}

async function botBreakdown(table) {
  const cols = await shape(table)
  if (!cols || !cols.includes('bot_name')) return null
  // PostgREST has no GROUP BY; page through just the bot_name column.
  const names = {}
  let from = 0
  for (;;) {
    const { data, error } = await db
      .from(table)
      .select('bot_name')
      .range(from, from + 999)
    if (error) {
      console.log(
        `  ОШИБКА ЧТЕНИЯ ${table}: ${error.message} -- счёт ниже занижен`
      )
      break
    }
    if (!data?.length) break
    for (const r of data)
      names[r.bot_name ?? '(null)'] = (names[r.bot_name ?? '(null)'] || 0) + 1
    if (data.length < 1000) break
    from += 1000
  }
  return names
}

async function main() {
  console.log('=== TABLES ===')
  const present = []
  for (const t of TABLES) {
    const c = await count(t)
    if (c.exists) {
      present.push(c)
      console.log(`  ${t.padEnd(24)} ${String(c.rows).padStart(8)} rows`)
    }
  }
  const missing = TABLES.filter(t => !present.some(p => p.table === t))
  console.log('  (absent:', missing.join(', ') || 'none', ')')

  console.log('\n=== COLUMNS ===')
  for (const p of present) {
    const cols = await shape(p.table)
    console.log(`  ${p.table}:`, cols ? cols.join(', ') : '(empty table)')
  }

  console.log('\n=== BOTS ===')
  for (const p of present) {
    const b = await botBreakdown(p.table)
    if (!b) continue
    const entries = Object.entries(b).sort((a, c) => c[1] - a[1])
    console.log(`  ${p.table} — ${entries.length} distinct bot_name:`)
    for (const [name, n] of entries)
      console.log(`      ${String(n).padStart(7)}  ${name}`)
  }
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
