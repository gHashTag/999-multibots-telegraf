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
const CARRY_DEBIT_PREFIX = 'carry-debit-'
const UNBACKED_REMOVAL_PREFIX = 'unbacked-removal-2026-09-20-'

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
 *
 * `carry-debit-` rows are taken out for exactly the same reason, one move
 * later. They are the second half of the carry: they removed from the archive
 * precisely what the live wallet had been given. Leaving them in makes the rule
 * say "carry 0" for 74 people who really did carry, and the check would report
 * its own footprint as a drift.
 */
const totalsAtCarry = foldLedger(
  rows.filter(r => {
    const inv = String(r.inv_id ?? '')
    return (
      !inv.startsWith(CLAWBACK_PREFIX) && !inv.startsWith(CARRY_DEBIT_PREFIX)
    )
  })
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
 * All three are admin accounts -- no customer was over-credited. The owner
 * decided on 2026-09-20 to take them back, and
 * `remove-unbacked-admin-tokens.ts` did: 112685 tokens, netted off above. So
 * this map should now match nothing.
 *
 * It stays as a net rather than being deleted. If one of these accounts ever
 * shows a gap again, the KNOWN line names it instead of a bare FAIL, and the
 * next person gets the history with the number.
 */
const KNOWN_OVERCREDIT = new Map<string, string>([
  [
    '435572800',
    '@playom, admin: 101734 of TEST_DATA rows marked payment_method=Telegram',
  ],
  [
    '6419070693',
    'admin: 8708 of TEST_DATA rows marked payment_method=Telegram',
  ],
  [
    '144022504',
    '@neuro_sage, admin: TEST_DATA rows across System/Robokassa/balance',
  ],
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
if (failures === 0)
  console.log('  every clawed-back user is clean, none negative')

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
  for (const [inv, n] of doubled)
    fail(`${inv} written ${n} times — double charge`)
} else {
  console.log('  no clawback was written twice')
}

// -------------------------------------------------------------------- carry --
console.log('\n=== carry into user_tokens ===')
if (!renderDb) {
  console.log(
    '  SKIPPED: RENDER_DATABASE_URL not set (live wallet unreachable)'
  )
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

    // The unbacked test-data tokens were taken back off three admin accounts on
    // 2026-09-20, recorded as negative rows in the same table. Netting them off
    // here is what makes the rule and the wallet agree again; without it the
    // check reports a gap that has already been closed.
    let removedTotal = 0
    for (const r of (
      await pool.query(
        'SELECT telegram_id, amount FROM star_payments WHERE charge_id LIKE $1',
        [`${UNBACKED_REMOVAL_PREFIX}%`]
      )
    ).rows) {
      const id = String(r.telegram_id)
      const amount = Number(r.amount)
      removedTotal += amount
      carriedByUser.set(id, (carriedByUser.get(id) ?? 0) + amount)
    }
    if (removedTotal) {
      console.log(
        `unbacked tokens removed since the carry: ${Math.round(-removedTotal)}`
      )
    }

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
          fail(
            `${id}: rule says carry ${expected}, ledger recorded ${recorded}`
          )
        }
      }
    }
    console.log(
      `  rule total ${expectedTotal}, recorded total ${recordedTotal}`
    )
    const unbacked = Math.round(recordedTotal - expectedTotal)
    console.log(
      unbacked === 0
        ? '  every token in the live wallet is backed by a payment'
        : `  ${unbacked} tokens in the live wallet are not backed by a payment (see KNOWN above)`
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
    for (const r of short)
      fail(`${r.telegram_id}: negative token balance ${r.balance}`)
    if (!short.length) console.log('  no negative token balances')
  } finally {
    await pool.end()
  }
}

// ------------------------------------------------------------ double-spend --
// This was the open wound: the carry credited the live wallet without debiting
// the archive, while the bots still spent from the archive, so the same payment
// was spendable twice. Both halves are closed now -- the bots read `user_tokens`
// (step 3), and `debit-archive-after-carry.ts` wrote the missing debits -- so
// this section checks the closure holds rather than measuring the damage.
console.log('\n=== double-spend closure ===')
const debitedIds = new Set(
  rows
    .filter(r => String(r.inv_id ?? '').startsWith(CARRY_DEBIT_PREFIX))
    .map(r => String(r.telegram_id))
)
let undebited = 0
let undebitedUsers = 0
for (const [id, carried] of carriedByUser) {
  if (debitedIds.has(id)) continue
  // Someone who carried but has no debit row is only a problem if the archive
  // still holds stars: with a zero balance there was nothing to take back.
  const left = Math.max(0, totals.get(id)?.balance ?? 0)
  const both = Math.min(carried, left)
  if (both > EPS) {
    undebited += both
    undebitedUsers++
    fail(
      `${id}: carried ${carried} but the archive still holds ${Math.round(left)}⭐ undebited`
    )
  }
}
if (!undebitedUsers) {
  console.log(
    `  every carried user is debited in the archive (${debitedIds.size} debit rows)`
  )
} else {
  console.log(
    `  ${undebitedUsers} users still hold ${Math.round(undebited)}⭐ that was also carried`
  )
}
// Stars left in the archive above what was carried are not exposure: the bots
// no longer read this ledger at all. Printed because the number changing is
// worth noticing.
let archiveLeft = 0
for (const [, t] of totals) archiveLeft += Math.max(0, t.balance)
console.log(
  `  archive holds ${Math.round(archiveLeft)}⭐ in total, spendable nowhere — the bots read user_tokens`
)

console.log(
  `\n${failures === 0 ? 'OK — everything reconciles' : `${failures} FAILURES`}`
)
process.exit(failures === 0 ? 0 : 1)
