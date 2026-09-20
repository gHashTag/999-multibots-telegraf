/**
 * Check that the two wallets still say what we think they say.
 *
 * Nothing did this before: the carry and the clawback were verified by hand,
 * once, by the person who ran them. This script re-derives both from the
 * ledger and compares them against what is actually stored, so a drift is
 * found by a command rather than by a customer.
 *
 * Read-only. Exits non-zero when something does not reconcile, so it can be
 * wired into a scheduled check later.
 *
 *   bun run scripts/money/reconcile-wallets.ts
 *
 * See `docs/architecture/single-wallet-decision.md`.
 */

import { createRequire } from 'node:module'
import { paged, walletEnv } from './lib'
import {
  foldLedger,
  carryAmount,
  clawbackAmount,
  type LedgerRow,
} from '../../src/core/money/ledgerClassify'

const require_ = createRequire(import.meta.url)
const pg = require_('pg')

const CARRY_TAG = 'carry-2026-09-20'
const CLAWBACK_PREFIX = 'grant-clawback-'

type Row = LedgerRow & { telegram_id: string; inv_id?: string | null }

const { supabaseUrl, supabaseKey, renderDb } = walletEnv()

const rows = await paged<Row>(
  supabaseUrl,
  supabaseKey,
  'payments_v2?select=telegram_id,type,stars,status,payment_method,bot_name,service_type,description,inv_id&order=id'
)
console.log(`read ${rows.length} ledger rows`)

const totals = foldLedger(rows)

/**
 * The ledger as it stood when the carry ran.
 *
 * Order matters and cost this check a false alarm on its first run: the carry
 * happened first and debited nothing, then the clawback removed admin grants
 * and pushed balances down. Re-deriving the carry from today's balances
 * therefore yields a smaller number than what was recorded -- @tatizaharova
 * carried 869 against a balance of 240030, and her balance is 39 now. That is
 * the two moves working as designed, not a drift. So the carry is checked
 * against the ledger with the reversals taken back out.
 */
const totalsAtCarry = foldLedger(
  rows.filter(r => !String(r.inv_id ?? '').startsWith(CLAWBACK_PREFIX))
)

let failures = 0
const fail = (message: string) => {
  failures++
  console.log(`  FAIL ${message}`)
}

/**
 * Carries this check knows about and cannot justify from the ledger.
 *
 * The script that ran the carry had no `test` bucket: it read a row's
 * `payment_method` and never looked at the TEST_DATA tag. Three accounts hold
 * tagged rows wearing a provider's method, so their test data was counted as
 * money and carried. The classifier here checks the tag first, which is why the
 * numbers no longer agree.
 *
 * All three are admin accounts -- no customer was over-credited -- and the
 * tokens are real in `user_tokens` today. Listing them keeps the check honest:
 * it reports the gap every run instead of hiding it, while still failing on
 * drift nobody has explained. Removing them is the owner's call, not this
 * script's.
 */
const KNOWN_OVERCREDIT = new Map<string, string>([
  ['435572800', '@playom, admin: 101734 of TEST_DATA rows marked payment_method=Telegram'],
  ['6419070693', 'admin: 8708 of TEST_DATA rows marked payment_method=Telegram'],
  ['144022504', '@neuro_sage, admin: TEST_DATA rows across System/Robokassa/balance'],
])

/**
 * Stars are stored as floats, so folding thousands of rows leaves dust:
 * balances land on -9e-13 rather than exactly 0. That is arithmetic, not a
 * missing star, and a check without a tolerance reports it forever. A
 * hundredth of a star is far below anything a person can hold or spend.
 */
const EPS = 0.01

/** telegram_id -> tokens actually credited by the carry. */
const carriedByUser = new Map<string, number>()

// ---------------------------------------------------------------- clawback --
// The clawback rows are in the same ledger they corrected, so this checks
// itself: fold the ledger *including* the reversals and no clawed-back user
// should still be sitting on granted money.
console.log('\n=== admin-grant clawback ===')
const clawedIds = new Set(
  rows
    .filter(r => String(r.inv_id ?? '').startsWith(CLAWBACK_PREFIX))
    .map(r => String(r.telegram_id))
)
console.log(`users with a clawback row: ${clawedIds.size}`)

for (const id of clawedIds) {
  const t = totals.get(id)
  if (!t) {
    fail(`${id}: has a clawback row but no ledger totals`)
    continue
  }
  if (t.balance < -EPS) fail(`${id}: balance went negative (${t.balance})`)
  const stillRemovable = clawbackAmount(t)
  if (stillRemovable > EPS) {
    fail(`${id}: still holds ${stillRemovable} of admin-granted stars`)
  }
}
if (failures === 0) console.log('  every clawed-back user is clean, none negative')

// A clawback row must never appear twice for the same person: the guard is a
// read-then-check in the script, not a constraint in the database.
const clawCounts = new Map<string, number>()
for (const r of rows) {
  const inv = String(r.inv_id ?? '')
  if (!inv.startsWith(CLAWBACK_PREFIX)) continue
  clawCounts.set(inv, (clawCounts.get(inv) ?? 0) + 1)
}
const doubled = [...clawCounts].filter(([, n]) => n > 1)
if (doubled.length) {
  for (const [inv, n] of doubled) fail(`${inv} written ${n} times — double charge`)
} else {
  console.log('  no clawback was written twice')
}

// -------------------------------------------------------------------- carry --
console.log('\n=== carry into user_tokens ===')
if (!renderDb) {
  console.log('  SKIPPED: RENDER_DATABASE_URL not set (live wallet unreachable)')
} else {
  const pool = new pg.Pool({
    connectionString: renderDb,
    ssl: { rejectUnauthorized: false },
    max: 4,
  })
  try {
    for (const r of (
      await pool.query(
        'SELECT charge_id, telegram_id, amount FROM star_payments WHERE charge_id LIKE $1',
        [`${CARRY_TAG}-%`]
      )
    ).rows) {
      carriedByUser.set(String(r.telegram_id), Number(r.amount))
    }
    console.log(`carry rows recorded: ${carriedByUser.size}`)

    // Re-derive every carry from the rule and compare against what was
    // actually credited. A mismatch means the live wallet holds a number the
    // ledger cannot justify.
    let expectedTotal = 0
    let recordedTotal = 0
    for (const [id, t] of totalsAtCarry) {
      const expected = carryAmount(t)
      const recorded = carriedByUser.get(id) ?? 0
      expectedTotal += expected
      recordedTotal += recorded
      if (Math.abs(expected - recorded) > EPS) {
        const known = KNOWN_OVERCREDIT.get(id)
        if (known) {
          console.log(
            `  KNOWN ${id}: carried ${recorded}, rule says ${expected} (+${Math.round(recorded - expected)} unbacked) — ${known}`
          )
        } else {
          fail(`${id}: rule says carry ${expected}, ledger recorded ${recorded}`)
        }
      }
    }
    console.log(`  rule total ${expectedTotal}, recorded total ${recordedTotal}`)
    console.log(
      `  ${Math.round(recordedTotal - expectedTotal)} tokens in the live wallet are not backed by a payment (all on admin accounts, see KNOWN above)`
    )

    const stored = await pool.query(
      'SELECT count(*)::int n, coalesce(sum(balance),0)::int t FROM user_tokens'
    )
    console.log(
      `  user_tokens now: ${stored.rows[0].n} rows, ${stored.rows[0].t} tokens`
    )

    // A balance below what was carried means tokens left by some path other
    // than spending through the app, or a carry landed on the wrong row.
    const short = (
      await pool.query(
        `SELECT s.telegram_id, s.amount, coalesce(u.balance, 0) AS balance
           FROM star_payments s
           LEFT JOIN user_tokens u ON u.telegram_id = s.telegram_id
          WHERE s.charge_id LIKE $1 AND coalesce(u.balance, 0) < 0`,
        [`${CARRY_TAG}-%`]
      )
    ).rows
    for (const r of short) fail(`${r.telegram_id}: negative token balance ${r.balance}`)
    if (!short.length) console.log('  no negative token balances')
  } finally {
    await pool.end()
  }
}

// ------------------------------------------------------------ double-spend --
// The carry credited the live wallet without debiting the archive, and the
// bots still spend from the archive. Until the bots read `user_tokens`, the
// same payment is spendable twice. Report the exposure rather than let it sit
// silently in a document.
console.log('\n=== double-spend exposure (carry credited, archive not debited) ===')
let exposed = 0
let exposedUsers = 0
for (const [id, t] of totals) {
  // What a person can spend twice is the smaller of the tokens they were
  // given and the stars they still hold -- not the carry on its own.
  const both = Math.min(carriedByUser.get(id) ?? 0, Math.max(0, t.balance))
  if (both > EPS) {
    exposed += both
    exposedUsers++
  }
}
console.log(
  `  ${exposedUsers} users can spend the same ${Math.round(exposed)}⭐ in both wallets`
)
console.log('  closes when the bots read user_tokens (step 3 of the wallet plan)')

console.log(`\n${failures === 0 ? 'OK — everything reconciles' : `${failures} FAILURES`}`)
process.exit(failures === 0 ? 0 : 1)
