/**
 * Crediting a Stars payment, extracted so it can be PROVEN.
 *
 * This logic used to live inline in the webhook handler, where the only way to
 * exercise it was to make a real payment. Money code that can only be tested by
 * spending money is money code that never gets tested: the idempotency fix
 * (#873) and the numeric-date fix (#874) both shipped on reasoning alone, and
 * both were later silently reverted without a single test going red.
 *
 * Same SQL and the same order as before; the handler now calls this.
 */
import { record } from './hive/journal'
import { moveTokens } from './token-ledger'
import { sendToTelegram } from './auth/telegram-sender'

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any> }
type Client = Queryable & { release: () => void }
/** A `pg` Pool also lends a single connection, which is what a transaction needs. */
type MaybePool = Queryable & { connect?: () => Promise<Client> }

/**
 * THE LOCK AND THE CREDIT MUST COMMIT TOGETHER.
 *
 * The lock is an INSERT into star_payments; the credit is an INSERT ... ON
 * CONFLICT into user_tokens. They used to be two separate `pool.query` calls,
 * which under node-postgres are two autocommit statements -- possibly on two
 * DIFFERENT physical connections, since `Pool.query` checks a connection out
 * per call.
 *
 * So a death in the gap left the lock committed and the balance untouched, and
 * that is not a transient failure that a retry heals: every later delivery
 * finds the charge id present, answers `redelivery of a payment already
 * credited`, and the buyer is thanked for tokens nobody ever gave them. The
 * money is with Telegram, the tokens are nowhere, and no error is raised
 * anywhere -- the owner's own morning report would call it a healthy sale.
 *
 * One transaction, taken from one connection, closes it: either both rows
 * land or neither does, and a failed payment stays retryable.
 *
 * A caller that hands us something without `connect` -- every test, and any
 * wrapper -- keeps the old two-statement path. That is deliberate: the
 * transaction is an improvement in production, not a new requirement on
 * everyone who wants to exercise this function.
 */
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

export interface CreditDeps {
  /**
   * How a notice reaches the owner. Defaults to sendToTelegram
   * (src/auth/telegram-sender.ts), the service's one Telegram sender.
   * Injected so a test can see the notice without the network.
   */
  notifyOwner?: (ownerId: string, text: string) => Promise<unknown>
}

/**
 * THE OWNER LEARNS THAT THEIR CLIENT PAID.
 *
 * An owner's crm_offer mints an invoice for the client and stamps the owner
 * on it (token_invoices.owner_id). When that invoice is paid, the credit
 * lands on the client -- and until now the owner who made the sale heard
 * nothing, and kept "warming" somebody who had already bought.
 *
 * Called only after a FIRST-time credit, so a redelivery is never announced
 * twice. Fire-and-forget: every failure is caught and logged here, and the
 * credit it follows has already committed. A notice to the OWNER only --
 * nothing here reaches the client.
 */
export async function notifyOwnerOfPayment(
  pool: Queryable,
  payment: {
    telegramId: string
    amount: number
    invoiceId?: number
    matchOpenInvoice?: boolean
  },
  deps: CreditDeps = {}
): Promise<boolean> {
  try {
    const payer = String(payment.telegramId)
    let row: { owner_id?: unknown; stars?: unknown; tokens?: unknown } | null =
      null
    if (payment.invoiceId !== undefined && payment.invoiceId !== null) {
      const r = await pool.query(
        `SELECT owner_id, stars, tokens FROM token_invoices WHERE id = $1`,
        [payment.invoiceId]
      )
      row = r?.rows?.[0] ?? null
    } else if (payment.matchOpenInvoice) {
      const r = await pool.query(
        `SELECT owner_id, stars, tokens FROM token_invoices
          WHERE telegram_id = $1 AND tokens = $2 AND redeemed = FALSE
            AND owner_id IS NOT NULL
            AND created_at > now() - interval '30 days'
          ORDER BY created_at DESC LIMIT 1`,
        [payer, payment.amount]
      )
      row = r?.rows?.[0] ?? null
    }
    const owner = String(row?.owner_id ?? '').trim()
    if (!owner || owner === payer) return false

    let who = payer
    try {
      const p = await pool.query(
        `SELECT first_name, username FROM crm_people
          WHERE owner_id = $1 AND lead_id = $2`,
        [owner, payer]
      )
      const person = p?.rows?.[0]
      const name = String(person?.first_name ?? '').trim()
      const handle = String(person?.username ?? '').trim()
      if (name || handle)
        who = [name, handle ? `@${handle}` : ''].filter(Boolean).join(' ')
      if (who !== payer) who = `${who} (${payer})`
    } catch {
      // No CRM table: the id alone still names the person.
    }
    const tokens = Number(row?.tokens) || payment.amount
    const stars = Number(row?.stars) || payment.amount
    const text =
      `💰 Клиент ${who} оплатил ваш счёт: ${stars} ⭐, ` + // cyrillic-ok: owner notice
      `зачислено ${tokens} токенов.\n` + // cyrillic-ok: owner notice
      'Новое предложение сейчас ни к чему — лучше поблагодарите.' // cyrillic-ok: owner notice
    const send = deps.notifyOwner ?? sendToTelegram
    await send(owner, text)
    return true
  } catch (e) {
    console.warn(
      '[STARS] owner notice not delivered:',
      String(e instanceof Error ? e.message : e).slice(0, 160)
    )
    return false
  }
}

export async function creditStarsPayment(
  pool: MaybePool,
  payment: {
    chargeId: string
    telegramId: string
    amount: number
    /**
     * The line the person reads in their own history and the keeper reads in
     * the journal. Absent = a Telegram Stars payment, which is every caller
     * but one: a club month the owner was paid for in cash
     * (agent/club-cash.ts) goes through this same door -- the same charge-id
     * lock, the same ledger -- and must not be recorded as Stars.
     */
    reason?: string
    /**
     * Which token_invoices row this payment settles, when the caller knows it
     * (/api/tokens/verify matched the row itself). Used only to tell the
     * owner who issued the invoice; the credit never depends on it.
     */
    invoiceId?: number
    /**
     * The caller does not know the row but the payment is a token-invoice
     * purchase (`tokens:<n>:<id>` forwarded by the bot to /api/stars/credit):
     * look up the newest open invoice for this person and amount. Never set
     * for club months -- their tokens could match an unrelated invoice.
     */
    matchOpenInvoice?: boolean
  },
  deps: CreditDeps = {}
): Promise<{ credited: boolean; reason: string }> {
  const { chargeId, telegramId: tid, amount } = payment
  if (!(amount > 0) || !tid)
    return { credited: false, reason: 'no amount or recipient' }
  /*
   * NO CHARGE ID, NO CREDIT.
   *
   * The whole guard below -- insert the charge id, credit only if the insert
   * was the first -- used to sit under `if (chargeId)`, so an empty one skipped
   * it entirely and credited unconditionally. The function said so in its own
   * answer ("credited without dedup") and raised an `attention` event, which
   * is an odd way to describe the one behaviour this function exists to
   * prevent: a redelivered webhook, a retried request or a restarted poller
   * would mint the tokens again, and each mint looks exactly like a sale.
   *
   * Refusing is the safe direction and the one already taken upstream: the
   * /api/stars/credit route answers 400 to a body without a chargeId, with
   * the same reasoning. A refusal is visible, retryable, and costs nobody
   * anything -- Telegram keeps the money until the credit lands. It is the
   * `credited: false` a caller must already handle for a redelivery.
   */
  if (!chargeId) return { credited: false, reason: 'no charge id' }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_tokens (
       telegram_id text PRIMARY KEY,
       balance int NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  )
  await pool.query(
    `CREATE TABLE IF NOT EXISTS star_payments (
       charge_id text PRIMARY KEY,
       telegram_id text NOT NULL,
       amount int NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`
  )

  // Credit ONLY when the payment is recorded for the FIRST time. Inserting
  // charge_id is the lock: a redelivery conflicts on the primary key,
  // DO NOTHING yields 0 rows, so nothing is credited.
  //
  // BOTH STATEMENTS, ONE TRANSACTION. See inTransaction above for what the
  // two-statement version cost: a death in the gap made the payment
  // permanently "already credited" with the balance never moved.
  const firstTime = await inTransaction(pool, async q => {
    const ins = await q.query(
      `INSERT INTO star_payments (charge_id, telegram_id, amount)
       VALUES ($1, $2, $3) ON CONFLICT (charge_id) DO NOTHING`,
      [chargeId, tid, amount]
    )
    if ((ins?.rowCount ?? 0) === 0) return false
    // The credit and its ledger row are written by the one function that moves
    // tokens (src/token-ledger.ts), on THIS client, inside THIS transaction.
    const moved = await moveTokens(q, {
      telegramId: tid,
      delta: amount,
      kind: 'purchase',
      reason: payment.reason || 'Telegram Stars',
      ref: chargeId,
      meta: { chargeId },
    })
    if (!moved.ok) throw new Error(`credit refused: ${moved.reason}`)
    return true
  })

  if (!firstTime)
    return {
      credited: false,
      reason: 'redelivery of a payment already credited',
    }

  /*
   * INTO THE HIVE JOURNAL -- HERE, NOT IN THE ROUTES.
   *
   * TWO routes call this credit: `/api/stars/credit` and `/api/star-paid`. An
   * event placed in each of them would drift one day -- one gets fixed, the
   * other is forgotten, and half the money stops being visible. There is one
   * point of credit, so there is one point of event.
   *
   * There is no longer a "without a charge id" variant to name here: such a
   * payment is refused above, before anything is written.
   */
  void record(pool, {
    kind: 'payment',
    who: tid,
    amount,
    what: payment.reason || 'звёзды Telegram', // cyrillic-ok: journal text the keeper reads
    severity: 'normal',
  })

  // The owner who issued the invoice hears about it. Not awaited: a slow or
  // failing Telegram must never hold or fail a credit that has committed.
  if (payment.invoiceId !== undefined || payment.matchOpenInvoice) {
    void notifyOwnerOfPayment(pool, payment, deps)
  }

  return { credited: true, reason: 'first delivery' }
}
