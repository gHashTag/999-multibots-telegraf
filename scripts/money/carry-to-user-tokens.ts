/**
 * Carry real payments from the archived wallet into the live one.
 *
 * OWNER DECISION 2026-09-20: `user_tokens` (render Postgres) is the only live
 * wallet; `payments_v2` (cloud Supabase) becomes a read-only audit archive.
 * Real payments carry over, admin grants do not.
 *
 * RATE 1:1. `creditStarsPayment` credits a paid star into `user_tokens.balance`
 * one for one, so a carried star keeps its exact purchasing power.
 *
 *   carry = min(paid, balance)   -- see `carryAmount` in src/core/money
 *
 * IDEMPOTENT BY CONSTRUCTION. Each carry inserts `star_payments(charge_id)`
 * with a deterministic id, and `charge_id` is the PRIMARY KEY. A second run
 * conflicts, DO NOTHING yields rowCount 0, and the balance is left alone. That
 * is the same lock `creditStarsPayment` uses for Telegram redeliveries -- the
 * dedup path is the one already in production, not a new one.
 *
 * This ran once, on 2026-09-20: 94 users, 212939 tokens. It is kept so the move
 * can be read, re-checked and re-run without harm.
 *
 * Dry run unless invoked with --commit.
 *
 *   bun run scripts/money/carry-to-user-tokens.ts
 *   bun run scripts/money/carry-to-user-tokens.ts --commit
 *
 * See `docs/architecture/single-wallet-decision.md`.
 */

import { createRequire } from 'node:module'
import { paged, walletEnv, isCommit, banner } from './lib'
import { foldLedger, carryAmount, type LedgerRow } from '../../src/core/money/ledgerClassify'

const require_ = createRequire(import.meta.url)
const pg = require_('pg')

const TAG = 'carry-2026-09-20'

type Row = LedgerRow & { telegram_id: string }

const { supabaseUrl, supabaseKey, renderDb } = walletEnv()
if (!renderDb) throw new Error('RENDER_DATABASE_URL missing (render Postgres)')
const commit = isCommit()

const rows = await paged<Row>(
  supabaseUrl,
  supabaseKey,
  'payments_v2?select=telegram_id,type,stars,status,payment_method,bot_name,service_type,description&order=id'
)
console.log(`read ${rows.length} ledger rows`)

const plan: Array<{ id: string; carry: number }> = []
for (const [id, totals] of foldLedger(rows)) {
  const carry = carryAmount(totals)
  if (carry > 0) plan.push({ id, carry })
}
plan.sort((a, b) => b.carry - a.carry)
const planned = plan.reduce((s, p) => s + p.carry, 0)
console.log(`carry plan: ${plan.length} users, ${planned} tokens`)

const pool = new pg.Pool({
  connectionString: renderDb,
  ssl: { rejectUnauthorized: false },
  max: 4,
})

// The same DDL `creditStarsPayment` runs, so a fresh database is not a special
// case.
await pool.query(`CREATE TABLE IF NOT EXISTS user_tokens (
  telegram_id text PRIMARY KEY, balance int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now())`)
await pool.query(`CREATE TABLE IF NOT EXISTS star_payments (
  charge_id text PRIMARY KEY, telegram_id text NOT NULL, amount int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now())`)

const before = new Map<string, number>()
for (const r of (await pool.query('SELECT telegram_id, balance FROM user_tokens')).rows) {
  before.set(String(r.telegram_id), Number(r.balance))
}
const done = new Set<string>()
for (const r of (
  await pool.query('SELECT charge_id FROM star_payments WHERE charge_id LIKE $1', [`${TAG}-%`])
).rows) {
  done.add(String(r.charge_id))
}
console.log(
  `user_tokens holds ${before.size} rows, ${[...before.values()].reduce((s, v) => s + v, 0)} tokens`
)
console.log(`carries already applied in an earlier run: ${done.size}`)

const todo = plan.filter(p => !done.has(`${TAG}-${p.id}`))
banner(commit)
console.log(`to apply now: ${todo.length} users, ${todo.reduce((s, p) => s + p.carry, 0)} tokens\n`)
for (const p of todo.slice(0, 20)) {
  const b = before.get(p.id) ?? 0
  console.log(`  ${p.id.padStart(13)} ${String(p.carry).padStart(8)} ${b} -> ${b + p.carry}`)
}
if (todo.length > 20) console.log(`  ... and ${todo.length - 20} more`)

if (!commit) {
  console.log('\nDry run only. Re-run with --commit to write.')
  await pool.end()
  process.exit(0)
}

let credited = 0
let skipped = 0
let moved = 0
for (const p of todo) {
  const client = await pool.connect()
  try {
    // One transaction per user: the dedup row and the balance move commit
    // together, so a crash cannot leave a charge recorded but uncredited.
    await client.query('BEGIN')
    const ins = await client.query(
      `INSERT INTO star_payments (charge_id, telegram_id, amount)
       VALUES ($1, $2, $3) ON CONFLICT (charge_id) DO NOTHING`,
      [`${TAG}-${p.id}`, p.id, p.carry]
    )
    if ((ins.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK')
      skipped++
      continue
    }
    await client.query(
      `INSERT INTO user_tokens (telegram_id, balance) VALUES ($1, $2)
       ON CONFLICT (telegram_id)
       DO UPDATE SET balance = user_tokens.balance + $2, updated_at = now()`,
      [p.id, p.carry]
    )
    await client.query('COMMIT')
    credited++
    moved += p.carry
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`  FAILED ${p.id}: ${(error as Error).message}`)
  } finally {
    client.release()
  }
}
console.log(`\ncredited ${credited} users, ${moved} tokens; skipped ${skipped} as already applied`)

const after = await pool.query(
  'SELECT count(*)::int n, coalesce(sum(balance),0)::int t FROM user_tokens'
)
console.log(`user_tokens now: ${after.rows[0].n} rows, ${after.rows[0].t} tokens`)
await pool.end()
