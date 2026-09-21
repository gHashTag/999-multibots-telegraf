/**
 * Carry the off-platform cash payers into the live wallet.
 *
 * THE MONEY THEY PAID NEVER REACHED THE NEW WALLET.
 *
 * Two people paid for a digital clone in cash, off the platform, and were
 * credited by hand in the archive on 2026-09-17:
 *
 *   373211349 @Farishka  +1303 stars, ADMIN_OVERRIDE / admin_grant
 *   504608015 @SamHold   +1303 stars, ADMIN_OVERRIDE / admin_grant
 *
 * The 2026-09-20 move to the single wallet then treated them as two separate
 * cases and lost the money in the seam between:
 *
 *   - `clawback-admin-grants.ts` EXEMPTED them, so the archive still shows the
 *     grant -- but the archive is read-only now, so that protected nothing a
 *     person can spend;
 *   - `carry-to-user-tokens.ts` carries `min(paid, balance)`, and `classify`
 *     buckets an ADMIN_OVERRIDE row as `admin`, not `paid`. So `paid = 0` and
 *     nothing carried.
 *
 * Both rules are right on their own. Together they say: money recorded with an
 * admin marker does not cross over. That is correct for a staff freebie and
 * wrong for cash in hand -- and the only thing that can tell the two apart is
 * the owner's own record of who paid, which is the list below.
 *
 * The amount is capped by the archive balance, so spending in the old wallet is
 * not handed back:
 *
 *   carry = min(cash grant, archive balance)
 *
 * IDEMPOTENT. Each carry inserts `star_payments(charge_id)` with a
 * deterministic id -- the same primary-key lock `creditStarsPayment` uses for
 * Telegram redeliveries -- and writes one `token_ledger` row inside the same
 * transaction as the balance move, so `SUM(delta) = balance` keeps holding.
 *
 * Dry run unless invoked with --commit.
 *
 *   bun run scripts/money/carry-cash-payers.ts
 *   bun run scripts/money/carry-cash-payers.ts --commit
 *
 * See `docs/architecture/single-wallet-decision.md`.
 */

import { createRequire } from 'node:module'
import { paged, walletEnv, isCommit, banner } from './lib'
import { foldLedger, type LedgerRow } from '../../src/core/money/ledgerClassify'

const require_ = createRequire(import.meta.url)
const pg = require_('pg')

const TAG = 'cash-carry-2026-09-21'

/**
 * The owner's record of who paid cash off-platform, and for what.
 *
 * This is the same list as `EXEMPT` in `clawback-admin-grants.ts` minus the
 * staff: an admin was exempted because their grant was a perk, these two
 * because they handed over money. Only the second kind carries.
 */
const CASH_PAYERS = new Map<string, string>([
  ['373211349', '@Farishka -- digital clone, paid cash off-platform'],
  ['504608015', '@SamHold -- digital clone, paid cash off-platform'],
])

const { supabaseUrl, supabaseKey, renderDb } = walletEnv()
if (!renderDb) throw new Error('RENDER_DATABASE_URL missing (render Postgres)')
const commit = isCommit()

const rows = await paged<LedgerRow & { telegram_id: string }>(
  supabaseUrl,
  supabaseKey,
  'payments_v2?select=telegram_id,type,stars,status,payment_method,bot_name,service_type,description&order=id'
)
console.log(`read ${rows.length} archive rows`)

const totals = foldLedger(rows)
const plan: Array<{ id: string; note: string; carry: number }> = []
for (const [id, note] of CASH_PAYERS) {
  const t = totals.get(id)
  if (!t) {
    console.log(`skip ${id}: no archive rows at all`)
    continue
  }
  // Their cash landed in the `admin` bucket -- that is the whole defect. Cap by
  // the archive balance so anything already spent there is not handed back.
  const carry = Math.floor(Math.min(t.admin, Math.max(0, t.balance)))
  if (carry <= 0) {
    console.log(
      `skip ${id}: nothing left to carry (admin ${t.admin}, balance ${t.balance})`
    )
    continue
  }
  plan.push({ id, note, carry })
}

const pool = new pg.Pool({
  connectionString: renderDb,
  ssl: { rejectUnauthorized: false },
  max: 2,
})

const before = new Map<string, number>()
for (const r of (
  await pool.query(
    'SELECT telegram_id, balance FROM user_tokens WHERE telegram_id = ANY($1)',
    [[...CASH_PAYERS.keys()]]
  )
).rows) {
  before.set(String(r.telegram_id), Number(r.balance))
}
const done = new Set<string>()
for (const r of (
  await pool.query(
    'SELECT charge_id FROM star_payments WHERE charge_id LIKE $1',
    [`${TAG}-%`]
  )
).rows) {
  done.add(String(r.charge_id))
}

const todo = plan.filter(p => !done.has(`${TAG}-${p.id}`))
banner(commit)
console.log(
  `to apply now: ${todo.length} people, ${todo.reduce((s, p) => s + p.carry, 0)} tokens\n`
)
for (const p of todo) {
  const b = before.get(p.id) ?? 0
  console.log(
    `  ${p.id.padStart(13)} ${String(p.carry).padStart(6)}   ${b} -> ${b + p.carry}   ${p.note}`
  )
}

if (!commit) {
  console.log('\nDry run only. Re-run with --commit to write.')
  await pool.end()
  process.exit(0)
}

let credited = 0
let moved = 0
for (const p of todo) {
  const client = await pool.connect()
  try {
    // One transaction: the dedup row, the balance and the ledger entry commit
    // together, so a crash cannot move money without a record of why.
    await client.query('BEGIN')
    const ins = await client.query(
      `INSERT INTO star_payments (charge_id, telegram_id, amount)
       VALUES ($1, $2, $3) ON CONFLICT (charge_id) DO NOTHING`,
      [`${TAG}-${p.id}`, p.id, p.carry]
    )
    if ((ins.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK')
      continue
    }
    const updated = await client.query(
      `INSERT INTO user_tokens (telegram_id, balance) VALUES ($1, $2)
       ON CONFLICT (telegram_id)
       DO UPDATE SET balance = user_tokens.balance + $2, updated_at = now()
       RETURNING balance`,
      [p.id, p.carry]
    )
    await client.query(
      `INSERT INTO token_ledger (telegram_id, delta, balance_after, kind, reason, ref, meta)
       VALUES ($1, $2, $3, 'purchase', $4, $5, $6)`,
      [
        p.id,
        p.carry,
        Number(updated.rows[0].balance),
        'цифровой клон, оплачен наличными вне платформы', // cyrillic-ok: the reason a person reads in their own history
        `${TAG}-${p.id}`,
        JSON.stringify({ note: p.note, source: 'payments_v2 archive' }),
      ]
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
console.log(`\ncredited ${credited} people, ${moved} tokens`)

for (const r of (
  await pool.query(
    'SELECT telegram_id, balance FROM user_tokens WHERE telegram_id = ANY($1) ORDER BY telegram_id',
    [[...CASH_PAYERS.keys()]]
  )
).rows) {
  console.log(`  ${r.telegram_id}: ${r.balance}`)
}
await pool.end()
