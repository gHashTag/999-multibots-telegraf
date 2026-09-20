/**
 * Close the double-spend hole the carry left open.
 *
 * RUN 2026-09-20: 89 users, 203607⭐. Kept for the audit trail and because it
 * is idempotent -- a re-run writes nothing.
 *
 * A transfer is a credit AND a debit. The carry on 2026-09-20 only did the
 * credit: it put tokens into `user_tokens` and left the same stars sitting in
 * `payments_v2`, which was still the wallet the 13 Telegraf bots spent from,
 * so the same payment was spendable in both places.
 *
 * This writes the missing half: one `MONEY_OUTCOME` row per carried user for
 * exactly what was carried, so the archive stops double-counting money that
 * now lives in the live wallet.
 *
 * ORDER MATTERED, and this header used to warn against the order it was
 * eventually run in. Debiting the archive while the bots still read it would
 * have dropped a paying customer's balance to zero with nowhere else to spend.
 * So step 3 went first (PR #2610: `getUserBalance` reads `user_tokens`), and
 * this ran after, against a ledger nobody spends from. Nothing spendable was
 * taken from anyone.
 *
 * Idempotent by the same read-then-check guard as the clawback: `inv_id` =
 * `carry-debit-<id>`, checked against existing rows before writing, because
 * `inv_id` has no unique constraint.
 *
 * Dry run unless invoked with --commit.
 *
 *   bun run scripts/money/debit-archive-after-carry.ts
 *
 * See `docs/architecture/single-wallet-decision.md`.
 */

import { createRequire } from 'node:module'
import { paged, walletEnv, isCommit, banner } from './lib'
import { foldLedger, type LedgerRow } from '../../src/core/money/ledgerClassify'

const require_ = createRequire(import.meta.url)
const pg = require_('pg')

const CARRY_TAG = 'carry-2026-09-20'
const DEBIT_PREFIX = 'carry-debit-'

type Row = LedgerRow & { telegram_id: string; inv_id?: string | null }

const { supabaseUrl, supabaseKey, renderDb } = walletEnv()
if (!renderDb) throw new Error('RENDER_DATABASE_URL missing (render Postgres)')
const commit = isCommit()
const base = supabaseUrl.replace(/\/$/, '')
const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }

const rows = await paged<Row>(
  supabaseUrl,
  supabaseKey,
  'payments_v2?select=telegram_id,type,stars,status,payment_method,bot_name,service_type,description,inv_id&order=id'
)
const totals = foldLedger(rows)
const already = new Set(
  rows
    .filter(r => String(r.inv_id ?? '').startsWith(DEBIT_PREFIX))
    .map(r => String(r.telegram_id))
)

// What was actually credited, read from the live wallet rather than recomputed
// -- the debit must match the carry that happened, not the carry the rule would
// produce today.
const pool = new pg.Pool({
  connectionString: renderDb,
  ssl: { rejectUnauthorized: false },
  max: 4,
})
const carried = new Map<string, number>()
for (const r of (
  await pool.query(
    'SELECT telegram_id, amount FROM star_payments WHERE charge_id LIKE $1',
    [`${CARRY_TAG}-%`]
  )
).rows) {
  carried.set(String(r.telegram_id), Number(r.amount))
}
await pool.end()
console.log(`carry rows recorded: ${carried.size}`)

const plan: Array<{ id: string; debit: number; balance: number }> = []
for (const [id, amount] of carried) {
  if (already.has(id)) continue
  const balance = totals.get(id)?.balance ?? 0
  // Never push anyone negative: debit at most what is still there. A user who
  // already spent their stars in the bots has nothing left to take back.
  const debit = Math.min(amount, Math.max(0, balance))
  if (debit > 0) plan.push({ id, debit, balance })
}
plan.sort((a, b) => b.debit - a.debit)

banner(commit)
console.log(
  `${plan.length} users, ${Math.round(plan.reduce((s, p) => s + p.debit, 0))}⭐\n`
)
console.log('ID             carried   balance    DEBIT    after')
for (const p of plan.slice(0, 20)) {
  console.log(
    `${p.id.padStart(12)} ${String(carried.get(p.id)).padStart(9)} ${p.balance
      .toFixed(0)
      .padStart(
        9
      )} ${p.debit.toFixed(0).padStart(8)} ${(p.balance - p.debit).toFixed(0).padStart(8)}`
  )
}
if (plan.length > 20) console.log(`  ... and ${plan.length - 20} more`)

const stamp = new Date().toISOString()
const rowFor = (p: (typeof plan)[number]) => ({
  telegram_id: p.id,
  amount: p.debit,
  stars: p.debit,
  currency: 'XTR',
  type: 'MONEY_OUTCOME',
  status: 'COMPLETED',
  category: 'REAL',
  payment_method: 'System',
  inv_id: `${DEBIT_PREFIX}${p.id}`,
  bot_name: 'wallet_carry_debit',
  language: 'ru',
  is_system_payment: true,
  is_test: false,
  transaction_context: 'PERSONAL',
  service_type: null,
  subscription_type: null,
  cost: null,
  model_name: null,
  description: `Moved to user_tokens: ${p.debit} stars carried to the live wallet`,
  metadata: {
    stars_debited: p.debit,
    carried_tokens: carried.get(p.id),
    balance_before: p.balance,
    reason:
      'second half of the carry: the archive must not keep money that now lives in user_tokens',
    rule: 'debit = min(carried, max(0, balance))',
    carry_tag: CARRY_TAG,
    written_at: stamp,
    authorised_by: 'owner',
  },
})

if (!commit || !plan.length) {
  console.log('\nDry run only. Re-run with --commit to write.')
  process.exit(0)
}

const res = await fetch(`${base}/rest/v1/payments_v2`, {
  method: 'POST',
  headers: {
    ...headers,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify(plan.map(rowFor)),
})
const body = await res.text()
console.log(`\ninsert: HTTP ${res.status}`)
if (!res.ok) {
  console.log(body)
  process.exit(1)
}
for (const r of JSON.parse(body)) {
  console.log(`  inserted #${r.id} user ${r.telegram_id} -${r.stars}`)
}
