/**
 * Telling bookkeeping apart from spending.
 *
 * Three moves in September 2026 wrote `MONEY_OUTCOME` rows into `payments_v2`
 * that no user ever spent:
 *
 *   - `admin_grant_clawback` — admin-granted stars taken back (19 users)
 *   - `robokassa_clawback`   — three rows from the same pass
 *   - `wallet_carry_debit`   — the second half of the carry into `user_tokens`,
 *                              removing from the archive exactly what the live
 *                              wallet had been given (89 users)
 *
 * They belong in the ledger: the archive is an audit trail and must stay
 * append-only. What they do not belong in is a user's list of purchases. Left
 * unfiltered they surfaced on the balance screen as the largest "expense" the
 * person had ever made — 102 251⭐ labelled "Unknown" for one account — which
 * reads as the bot having taken the money.
 *
 * WHY THIS PREDICATE. Matching on `bot_name` would mean editing this file for
 * every future bookkeeping pass. Those rows are instead the only completed
 * `MONEY_OUTCOME` rows that are flagged as system payments AND carry no
 * `service_type` — checked against the live ledger on 2026-09-20: the predicate
 * matches those 111 rows and nothing a user bought.
 *
 * The same rule is applied inside `get_user_balance_stats_optimized` (migration
 * `hide_wallet_bookkeeping_from_spend_stats`); this is the fallback path's copy.
 *
 * See `docs/architecture/single-wallet-decision.md`.
 */

export interface SpendRow {
  type?: string | null
  is_system_payment?: boolean | null
  service_type?: string | null
}

/** True when the row is a wallet move rather than something the user bought. */
export function isWalletBookkeepingRow(row: SpendRow): boolean {
  return row.is_system_payment === true && !row.service_type
}

/** The outcome rows a user should actually see as their spending. */
export function realSpending<T extends SpendRow>(rows: T[]): T[] {
  return rows.filter(r => !isWalletBookkeepingRow(r))
}
