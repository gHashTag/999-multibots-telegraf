/**
 * TOKEN LEDGER — every movement of a person's tokens, written once, next to the
 * balance it changed.
 *
 * Owner, 2026-09-09: "the new project starts from zero on the Railway database;
 * every payment must be tracked; we must know exactly what each expense was
 * for." The old bot ledger (Supabase payments_v2) is the archive; this file is
 * the new project's book of record.
 *
 * WHY A SEPARATE TABLE. `user_tokens` is one integer per person. It answers
 * "how much" and nothing else: seven writers in three files added and
 * subtracted from it with `UPDATE ... balance = balance ± $2`, and after the
 * fact nobody could say which generation, refund or purchase produced the
 * number. That is exactly the question the owner asked about the old ledger
 * the same day, where 56 % of the expense rows said only "Payment operation".
 *
 * HOW. `moveTokens` is the ONLY way tokens move: it applies the delta to
 * `user_tokens` (refusing an overdraft in the same statement, so two parallel
 * spends cannot both pass) and appends one `token_ledger` row with the balance
 * after the move, the kind, a human reason and an optional reference (a Stars
 * charge id, a job id). Both statements run in one transaction when the pool
 * can lend a connection, so a crash between them cannot move money without a
 * record. A structural test pins that no other file writes `user_tokens`.
 *
 * OPENING ROW. Balances existed before this ledger. The first movement of a
 * person whose balance is non-zero and whose ledger is empty writes an
 * `adjustment` row equal to that balance, so that from the first entry on
 * `SUM(delta) = balance` holds for everyone — `ledgerDrift` checks it.
 */

export type Queryable = {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: any[]; rowCount?: number | null }>
}
type Client = Queryable & { release: () => void }
type MaybePool = Queryable & { connect?: () => Promise<Client> }

export type MoveKind = 'purchase' | 'grant' | 'spend' | 'refund' | 'adjustment'

export interface Move {
  telegramId: string
  /** Positive credits, negative debits. Never zero. Integer tokens. */
  delta: number
  kind: MoveKind
  /** For a person: "Telegram Stars", "image_generate kie/flux", "welcome tokens". */
  reason: string
  /** Idempotency / cross-reference: a Stars charge id, a job id. */
  ref?: string | null
  meta?: Record<string, unknown>
}

export type MoveOutcome =
  | { ok: true; balance: number }
  | { ok: false; balance: number; reason: 'insufficient' | 'invalid delta' }

export const OPENING_REASON = 'opening balance before the ledger'

let tablesReady = false

export async function ensureTokenLedger(q: Queryable): Promise<void> {
  if (tablesReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS user_tokens (
       telegram_id text PRIMARY KEY,
       balance int NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
    []
  )
  await q.query(
    `CREATE TABLE IF NOT EXISTS token_ledger (
       id bigserial PRIMARY KEY,
       telegram_id text NOT NULL,
       delta int NOT NULL CHECK (delta <> 0),
       balance_after int NOT NULL,
       kind text NOT NULL CHECK (kind IN ('purchase','grant','spend','refund','adjustment')),
       reason text NOT NULL,
       ref text,
       meta jsonb NOT NULL DEFAULT '{}'::jsonb,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
    []
  )
  await q.query(
    `CREATE INDEX IF NOT EXISTS token_ledger_person_time
       ON token_ledger (telegram_id, created_at DESC)`,
    []
  )
  tablesReady = true
}

/** Tests only: forget that the tables were created. */
export function forgetTokenLedgerTables(): void {
  tablesReady = false
}

async function inTransaction<T>(
  pool: MaybePool,
  work: (q: Queryable) => Promise<T>
): Promise<T> {
  if (typeof pool.connect !== 'function') return work(pool)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await work(client)
    await client.query('COMMIT')
    return out
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // The connection is already gone; the server rolls back for us.
    }
    throw e
  } finally {
    client.release()
  }
}

async function currentBalance(q: Queryable, tid: string): Promise<number> {
  const r = await q.query(
    `SELECT balance FROM user_tokens WHERE telegram_id = $1`,
    [tid]
  )
  return Number(r.rows[0]?.balance ?? 0)
}

async function writeOpeningRowIfNeeded(
  q: Queryable,
  tid: string
): Promise<void> {
  const seen = await q.query(
    `SELECT 1 FROM token_ledger WHERE telegram_id = $1 LIMIT 1`,
    [tid]
  )
  if (seen.rows.length > 0) return
  const before = await currentBalance(q, tid)
  if (before === 0) return
  await q.query(
    `INSERT INTO token_ledger (telegram_id, delta, balance_after, kind, reason, ref, meta)
     VALUES ($1, $2, $3, 'adjustment', $4, NULL, '{}'::jsonb)`,
    [tid, before, before, OPENING_REASON]
  )
}

export async function moveTokens(
  pool: MaybePool,
  m: Move
): Promise<MoveOutcome> {
  const tid = String(m.telegramId ?? '').trim()
  if (!tid || !Number.isSafeInteger(m.delta) || m.delta === 0) {
    return { ok: false, balance: 0, reason: 'invalid delta' }
  }
  await ensureTokenLedger(pool)
  return inTransaction(pool, async q => {
    await writeOpeningRowIfNeeded(q, tid)
    let after: number | null = null
    if (m.delta < 0) {
      // Check and debit in ONE statement: two parallel spends cannot both pass.
      // Same statement shape the writers used before the ledger existed, so
      // every fake pool in the test suite still recognises it.
      const r = await q.query(
        `UPDATE user_tokens SET balance = balance - $2, updated_at = now()
         WHERE telegram_id = $1 AND balance >= $2 RETURNING balance`,
        [tid, -m.delta]
      )
      if (r.rows.length === 0) {
        return {
          ok: false,
          balance: await currentBalance(q, tid),
          reason: 'insufficient',
        }
      }
      after = Number(r.rows[0].balance)
    } else {
      // The credit statement the refund writers always used; a person with no
      // row yet (a first purchase) gets the upsert instead.
      const upd = await q.query(
        `UPDATE user_tokens SET balance = balance + $2, updated_at = now()
         WHERE telegram_id = $1 RETURNING balance`,
        [tid, m.delta]
      )
      if (upd.rows.length > 0) {
        after = Number(upd.rows[0].balance)
      } else {
        const ins = await q.query(
          `INSERT INTO user_tokens (telegram_id, balance)
           VALUES ($1, $2)
           ON CONFLICT (telegram_id)
           DO UPDATE SET balance = user_tokens.balance + $2, updated_at = now()
           RETURNING balance`,
          [tid, m.delta]
        )
        after =
          ins.rows[0]?.balance != null ? Number(ins.rows[0].balance) : null
      }
    }
    await q.query(
      `INSERT INTO token_ledger (telegram_id, delta, balance_after, kind, reason, ref, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        tid,
        m.delta,
        after,
        m.kind,
        String(m.reason).slice(0, 200),
        m.ref ? String(m.ref) : null,
        JSON.stringify(m.meta ?? {}),
      ]
    )
    return { ok: true, balance: after ?? 0 }
  })
}

/**
 * The welcome grant, recorded. Inserts the row with `amount` tokens only when
 * the person has none yet; returns the current balance either way.
 */
export async function grantWelcomeIfNew(
  pool: MaybePool,
  telegramId: string,
  amount: number
): Promise<number> {
  const tid = String(telegramId)
  await ensureTokenLedger(pool)
  return inTransaction(pool, async q => {
    const ins = await q.query(
      `INSERT INTO user_tokens (telegram_id, balance)
       VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING RETURNING balance`,
      [tid, amount]
    )
    if (ins.rows.length > 0 && amount > 0) {
      await q.query(
        `INSERT INTO token_ledger (telegram_id, delta, balance_after, kind, reason, ref, meta)
         VALUES ($1, $2, $2, 'grant', 'welcome tokens', NULL, '{}'::jsonb)`,
        [tid, amount]
      )
      return amount
    }
    return currentBalance(q, tid)
  })
}

export interface LedgerRow {
  id: number
  delta: number
  balance_after: number
  kind: MoveKind
  reason: string
  ref: string | null
  meta: Record<string, unknown>
  created_at: string
}

/** Newest first. This is what answers "what were my expenses for". */
export async function tokenHistory(
  q: Queryable,
  telegramId: string,
  limit = 50
): Promise<LedgerRow[]> {
  await ensureTokenLedger(q)
  const r = await q.query(
    `SELECT id, delta, balance_after, kind, reason, ref, meta, created_at
       FROM token_ledger WHERE telegram_id = $1
       ORDER BY id DESC LIMIT $2`,
    [String(telegramId), Math.max(1, Math.min(500, limit))]
  )
  return r.rows
}

/**
 * People whose balance no longer equals the sum of their ledger. Empty means
 * the book is whole. Anything here is a writer that bypassed moveTokens.
 */
export async function ledgerDrift(
  q: Queryable
): Promise<
  Array<{ telegram_id: string; balance: number; ledger_sum: number }>
> {
  await ensureTokenLedger(q)
  // Two plain statements, compared here: a join would name columns of one
  // table inside a statement about the other, which the column census reads
  // as a column nobody created.
  const balances = await q.query(
    `SELECT telegram_id, balance FROM user_tokens`,
    []
  )
  const sums = await q.query(
    `SELECT telegram_id, SUM(delta) AS delta FROM token_ledger GROUP BY telegram_id`,
    []
  )
  const byId = new Map<string, number>()
  for (const x of sums.rows) byId.set(String(x.telegram_id), Number(x.delta))
  return balances.rows
    .map((x: any) => ({
      telegram_id: String(x.telegram_id),
      balance: Number(x.balance),
      ledger_sum: byId.get(String(x.telegram_id)) ?? 0,
    }))
    .filter(x => x.balance !== x.ledger_sum)
}
