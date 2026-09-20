/**
 * The live wallet.
 *
 * OWNER DECISION 2026-09-20: `user_tokens` in the render Postgres is the only
 * wallet. `payments_v2` in cloud Supabase stays as a read-only audit archive.
 * This module is step 3 of that plan — the point where the bots stop spending
 * from the archive.
 *
 * It is deliberately small: a balance read and one atomic delta. Everything
 * that decides *how much* still lives where it lived before.
 *
 * WHY THE DEBIT IS A SINGLE STATEMENT. The old path read the balance, compared
 * it, then wrote — so two taps a few milliseconds apart both passed the check
 * and both spent the same stars (#999). `UPDATE ... WHERE balance >= $2` does
 * the check and the write in one statement, so the database refuses the second
 * one. That race closes here, not by being careful at the call sites.
 *
 * See `docs/architecture/single-wallet-decision.md`.
 */

import { Pool } from 'pg'
import { logger } from '@/utils/logger'

/**
 * Not knowing the balance is not the same as the balance being zero.
 *
 * If this database is unreachable and we answer 0, every paying user is told
 * "not enough funds" — from where they sit that is indistinguishable from
 * theft. Callers must let this propagate rather than default to zero.
 */
export class WalletUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WalletUnavailableError'
  }
}

let pool: Pool | null = null

/**
 * The wallet database, or a loud failure.
 *
 * Deliberately NOT `DATABASE_URL`: a shell (and more than one service) already
 * has that pointing somewhere else, and a wallet that silently attaches to the
 * wrong database reports healthy while holding nobody's money.
 */
function getPool(): Pool {
  if (pool) return pool
  const url =
    process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''
  if (!url) {
    throw new WalletUnavailableError(
      'TOKENS_DATABASE_URL is not set: the wallet is unreachable, balances are unknown'
    )
  }
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 6,
    // A wallet call sits in front of a user waiting on a button. Better to fail
    // loudly in seconds than to hang a scene until Telegram times it out.
    connectionTimeoutMillis: 8000,
    idle_in_transaction_session_timeout: 10000,
  })
  pool.on('error', error => {
    logger.error('token wallet pool error', { error: error.message })
  })
  return pool
}

/** For tests: drop the cached pool so a new env is picked up. */
export function resetTokenWalletPool(): void {
  pool = null
}

/**
 * Tokens the user holds.
 *
 * A missing row is a real zero — that user never received or bought anything.
 * An unreachable database is not, and throws.
 */
export async function getTokenBalance(telegramId: string): Promise<number> {
  const id = String(telegramId ?? '').trim()
  if (!id) return 0
  try {
    const { rows } = await getPool().query(
      'SELECT balance FROM user_tokens WHERE telegram_id = $1',
      [id]
    )
    return rows.length ? Number(rows[0].balance) : 0
  } catch (error) {
    if (error instanceof WalletUnavailableError) throw error
    throw new WalletUnavailableError(
      `could not read the wallet for ${id}: ${(error as Error).message}`
    )
  }
}

/**
 * Add tokens. Creates the row if the user has none yet.
 *
 * Same upsert `creditStarsPayment` uses in the mini app, so a star bought there
 * and a star credited here land the same way.
 */
export async function creditTokens(
  telegramId: string,
  amount: number
): Promise<number> {
  const id = String(telegramId).trim()
  const value = Math.round(Number(amount))
  if (!id || !(value > 0)) {
    throw new Error(`creditTokens needs a positive amount, got ${amount}`)
  }
  const { rows } = await getPool().query(
    `INSERT INTO user_tokens (telegram_id, balance) VALUES ($1, $2)
     ON CONFLICT (telegram_id)
     DO UPDATE SET balance = user_tokens.balance + $2, updated_at = now()
     RETURNING balance`,
    [id, value]
  )
  return Number(rows[0].balance)
}

/**
 * Take tokens, or report that there were not enough.
 *
 * Returns the balance left, or null when the user could not cover it. Null is
 * a refusal, not an error: nothing was taken and nothing needs undoing.
 */
export async function debitTokens(
  telegramId: string,
  amount: number
): Promise<number | null> {
  const id = String(telegramId).trim()
  const value = Math.round(Number(amount))
  if (!id || !(value > 0)) {
    throw new Error(`debitTokens needs a positive amount, got ${amount}`)
  }
  // The check and the write are one statement on purpose — see the note at the
  // top of this file.
  const { rows } = await getPool().query(
    `UPDATE user_tokens SET balance = balance - $2, updated_at = now()
      WHERE telegram_id = $1 AND balance >= $2
      RETURNING balance`,
    [id, value]
  )
  return rows.length ? Number(rows[0].balance) : null
}
