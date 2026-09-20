/**
 * How a `payments_v2` row earned its money — and what that means for a move
 * between wallets.
 *
 * This logic decided real balances on 2026-09-20: it drove the carry into
 * `user_tokens` (94 users, 212939 tokens) and the admin-grant clawback (19
 * users, 852839 stars). It lived in a throwaway script while it did that. It
 * lives here now so the next person can read the rule that moved their money,
 * and so a test fails when someone changes it by accident.
 *
 * See `docs/architecture/single-wallet-decision.md`.
 */

/** A settled income row, reduced to the fields that decide its bucket. */
export interface LedgerRow {
  type?: string | null
  stars?: number | string | null
  status?: string | null
  payment_method?: string | null
  bot_name?: string | null
  service_type?: string | null
  description?: string | null
}

export type Bucket = 'paid' | 'admin' | 'refund' | 'test' | 'other'

/**
 * Payment methods that mean a person actually parted with money.
 * Anything outside this set is NOT treated as a payment — the list is an
 * allowlist on purpose, because guessing wrong invents money that never came.
 */
const PROVIDER_METHODS = new Set([
  'Telegram',
  'telegram',
  'Robokassa',
  'robokassa',
  'TON',
  'USDT',
  'Stars',
])

/** Markers left by the various admin-grant scripts that ran over the years. */
const ADMIN_METHODS = new Set([
  'Admin',
  'admin',
  'ADMIN_OVERRIDE',
  'Admin_Bonus',
  'admin_topup',
  'admin_special_topup',
  'Manual',
  'Bonus_Credit',
  'System Compensation',
])
const ADMIN_BOTS = new Set([
  'admin_system',
  'admin_script',
  'admin_tools',
  'admin_bonus_system',
  'admin_cli',
  'admin',
  'system_grant',
])
const ADMIN_SERVICES = new Set([
  'admin_grant',
  'staff_access_grant',
  'admin_topup',
  'admin_bonus',
  'staff_bonus',
  'admin_subscription_renewal',
  'balance_correction',
])

/**
 * Test rows are tagged, and there are a lot of them: 735 rows worth 406497
 * stars carry this marker. A report that forgets to exclude them overstates
 * the platform's money several times over.
 */
export function isTestData(row: LedgerRow): boolean {
  return /TAG:TEST_DATA|TEST_DATA:/.test(row.description ?? '')
}

/** Stars as a number. The counted column is `stars` — never `amount`. */
export function starsOf(row: LedgerRow): number {
  const n = Number(row.stars ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Which bucket an income row falls into.
 *
 * Order matters. Test data is checked first: a tagged row is not real money
 * even when it wears a provider's payment_method. Admin markers are checked
 * before provider ones because a grant script may leave `payment_method` alone
 * and mark only `service_type`.
 */
export function classify(row: LedgerRow): Bucket {
  if (isTestData(row)) return 'test'
  if (row.type === 'REFUND') return 'refund'
  if (
    ADMIN_METHODS.has(row.payment_method ?? '') ||
    ADMIN_BOTS.has(row.bot_name ?? '') ||
    ADMIN_SERVICES.has(row.service_type ?? '')
  ) {
    return 'admin'
  }
  if (PROVIDER_METHODS.has(row.payment_method ?? '')) return 'paid'
  return 'other'
}

/** Per-user totals, as the ledger reduces to them. */
export interface Totals {
  balance: number
  paid: number
  admin: number
  refund: number
  test: number
  other: number
}

export function emptyTotals(): Totals {
  return { balance: 0, paid: 0, admin: 0, refund: 0, test: 0, other: 0 }
}

/**
 * Fold settled rows into per-user totals.
 *
 * Balance is a SUM over the ledger, not a column: income and refunds add,
 * outcome subtracts. Only COMPLETED rows count.
 */
export function foldLedger(
  rows: Array<LedgerRow & { telegram_id?: string | number | null }>
): Map<string, Totals> {
  const out = new Map<string, Totals>()
  for (const row of rows) {
    if (row.status !== 'COMPLETED') continue
    const id = String(row.telegram_id ?? '')
    if (!id) continue
    const stars = starsOf(row)
    const totals = out.get(id) ?? emptyTotals()

    if (row.type === 'MONEY_OUTCOME') {
      totals.balance -= stars
    } else if (row.type === 'MONEY_INCOME' || row.type === 'REFUND') {
      totals.balance += stars
      totals[classify(row)] += stars
    } else {
      out.set(id, totals)
      continue
    }
    out.set(id, totals)
  }
  return out
}

/**
 * What carries from the archive into the live wallet.
 *
 *   carry = min(paid, balance)
 *
 * The `paid` cap is what keeps admin grants from crossing over. The `balance`
 * cap is what stops us handing back money already spent — spending is charged
 * against grants first, which favours the payer. Floored, because
 * `user_tokens.balance` is an integer column and half a token is not a thing.
 */
export function carryAmount(totals: Totals): number {
  return Math.floor(Math.min(totals.paid, Math.max(0, totals.balance)))
}

/**
 * What an admin-grant clawback removes.
 *
 *   remove = min(admin, balance)
 *
 * Capped by balance so nobody is pushed negative, and capped by the grant so a
 * real payer keeps everything their own money bought.
 */
export function clawbackAmount(totals: Totals): number {
  return Math.min(totals.admin, Math.max(0, totals.balance))
}
