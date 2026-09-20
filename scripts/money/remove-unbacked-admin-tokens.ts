/**
 * Take back the tokens nobody paid for.
 *
 * The carry on 2026-09-20 read each row's `payment_method` and never looked at
 * the TEST_DATA tag, so rows tagged as test money but wearing a provider's
 * method were counted as real and carried into `user_tokens`. Three accounts
 * hold the result: 112685 tokens the ledger cannot justify.
 *
 * All three are admin accounts, which is the only reason this was survivable --
 * no customer was over-credited. `reconcile-wallets.ts` has been printing them
 * as KNOWN every run rather than hiding them. This removes them, so the number
 * the reconciler reports is zero because it is zero, not because it is listed.
 *
 * WHAT IT DOES NOT TOUCH. Only the unbacked part goes. What the rule says these
 * accounts actually carried -- 517, 22 and 46 stars -- stays, as does anything
 * they bought or were credited since. The debit is capped at the current
 * balance, so nobody is pushed negative.
 *
 * Idempotent: `star_payments.charge_id` is the primary key, and each removal
 * writes one row keyed by account, so a second run inserts nothing and moves no
 * money.
 *
 * Dry run unless invoked with --commit.
 *
 *   bun run scripts/money/remove-unbacked-admin-tokens.ts
 *
 * See `docs/architecture/single-wallet-decision.md`.
 */

import { createRequire } from 'node:module'
import { paged, walletEnv, isCommit, banner } from './lib'
import {
  foldLedger,
  carryAmount,
  type LedgerRow,
} from '../../src/core/money/ledgerClassify'

const require_ = createRequire(import.meta.url)
const pg = require_('pg')

const CARRY_TAG = 'carry-2026-09-20'
const CLAWBACK_PREFIX = 'grant-clawback-'
const CARRY_DEBIT_PREFIX = 'carry-debit-'
const REMOVAL_PREFIX = 'unbacked-removal-2026-09-20-'

/**
 * The three accounts, named rather than discovered.
 *
 * The gap is computed from the ledger, but which accounts are allowed to be
 * touched is written down here on purpose: a bug in the classifier must not be
 * able to reach a customer's wallet.
 */
const ADMIN_ACCOUNTS = new Map<string, string>([
  ['435572800', '@playom (owner)'],
  ['6419070693', 'admin'],
  ['144022504', '@neuro_sage'],
])

type Row = LedgerRow & { telegram_id: string; inv_id?: string | null }

const { supabaseUrl, supabaseKey, renderDb } = walletEnv()
if (!renderDb) throw new Error('RENDER_DATABASE_URL missing (render Postgres)')
const commit = isCommit()

const rows = await paged<Row>(
  supabaseUrl,
  supabaseKey,
  'payments_v2?select=telegram_id,type,stars,status,payment_method,bot_name,service_type,description,inv_id&order=id'
)

// The carry ran before the clawback and before the archive debit, so both are
// taken back out to re-derive what the rule said at the time. Same reasoning as
// in `reconcile-wallets.ts`.
const totalsAtCarry = foldLedger(
  rows.filter(r => {
    const inv = String(r.inv_id ?? '')
    return (
      !inv.startsWith(CLAWBACK_PREFIX) && !inv.startsWith(CARRY_DEBIT_PREFIX)
    )
  })
)

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

const balances = new Map<string, number>()
for (const r of (
  await pool.query('SELECT telegram_id, balance FROM user_tokens')
).rows) {
  balances.set(String(r.telegram_id), Number(r.balance))
}

const done = new Set(
  (
    await pool.query(
      'SELECT telegram_id FROM star_payments WHERE charge_id LIKE $1',
      [`${REMOVAL_PREFIX}%`]
    )
  ).rows.map((r: { telegram_id: string }) => String(r.telegram_id))
)

const plan: Array<{
  id: string
  who: string
  carried: number
  backed: number
  unbacked: number
  balance: number
  remove: number
}> = []

for (const [id, who] of ADMIN_ACCOUNTS) {
  if (done.has(id)) continue
  const recorded = carried.get(id) ?? 0
  const backed = carryAmount(totalsAtCarry.get(id) ?? ({} as never)) || 0
  const unbacked = Math.round(recorded - backed)
  const balance = balances.get(id) ?? 0
  // Never push anyone negative: take at most what is there today.
  const remove = Math.min(unbacked, Math.max(0, balance))
  if (remove > 0)
    plan.push({ id, who, carried: recorded, backed, unbacked, balance, remove })
}

banner(commit)
console.log(
  `${plan.length} accounts, ${plan.reduce((s, p) => s + p.remove, 0)} tokens\n`
)
console.log(
  'ID             who                  carried    backed  unbacked  balance   REMOVE    after'
)
for (const p of plan) {
  console.log(
    `${p.id.padStart(12)} ${p.who.padEnd(18)} ${String(p.carried).padStart(9)} ${String(
      Math.round(p.backed)
    ).padStart(
      9
    )} ${String(p.unbacked).padStart(9)} ${String(p.balance).padStart(8)} ${String(
      p.remove
    ).padStart(8)} ${String(p.balance - p.remove).padStart(8)}`
  )
}

if (!commit || !plan.length) {
  console.log('\nDry run only. Re-run with --commit to write.')
  await pool.end()
  process.exit(0)
}

for (const p of plan) {
  // The debit is guarded in the same statement that writes it, for the same
  // reason `debitTokens` is: a concurrent spend must not be able to slip
  // between a read and a write and take the balance negative.
  const { rows: after } = await pool.query(
    `UPDATE user_tokens SET balance = balance - $2, updated_at = now()
      WHERE telegram_id = $1 AND balance >= $2
      RETURNING balance`,
    [p.id, p.remove]
  )
  if (!after.length) {
    console.log(
      `  SKIP ${p.id}: balance moved below ${p.remove} since the plan was made`
    )
    continue
  }
  // Recorded as a negative row in the same table the carry used, so the wallet's
  // own history explains the drop without anyone having to find this script.
  await pool.query(
    `INSERT INTO star_payments (charge_id, telegram_id, amount, created_at)
     VALUES ($1, $2, $3, now()) ON CONFLICT (charge_id) DO NOTHING`,
    [`${REMOVAL_PREFIX}${p.id}`, p.id, -p.remove]
  )
  console.log(
    `  ${p.id} ${p.who}: -${p.remove}, balance now ${after[0].balance}`
  )
}

await pool.end()
