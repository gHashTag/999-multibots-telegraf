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

export async function creditStarsPayment(
  pool: { query: (sql: string, params?: unknown[]) => Promise<any> },
  payment: { chargeId: string; telegramId: string; amount: number }
): Promise<{ credited: boolean; reason: string }> {
  const { chargeId, telegramId: tid, amount } = payment
  if (!(amount > 0) || !tid)
    return { credited: false, reason: 'no amount or recipient' }

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
  let firstTime = true
  if (chargeId) {
    const ins = await pool.query(
      `INSERT INTO star_payments (charge_id, telegram_id, amount)
       VALUES ($1, $2, $3) ON CONFLICT (charge_id) DO NOTHING`,
      [chargeId, tid, amount]
    )
    firstTime = (ins?.rowCount ?? 0) > 0
  }

  if (!firstTime)
    return {
      credited: false,
      reason: 'redelivery of a payment already credited',
    }

  await pool.query(
    `INSERT INTO user_tokens (telegram_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (telegram_id)
     DO UPDATE SET balance = user_tokens.balance + $2, updated_at = now()`,
    [tid, amount]
  )

  /*
   * INTO THE HIVE JOURNAL -- HERE, NOT IN THE ROUTES.
   *
   * TWO routes call this credit: `/api/stars/credit` and `/api/star-paid`. An
   * event placed in each of them would drift one day -- one gets fixed, the
   * other is forgotten, and half the money stops being visible. There is one
   * point of credit, so there is one point of event.
   *
   * A missing `chargeId` is named out loud: such a credit runs WITHOUT
   * deduplication, and a redelivery would double it. The keeper needs to see
   * that in the feed, not in a code comment.
   */
  void record(pool, {
    kind: 'payment',
    who: tid,
    amount,
    what: chargeId ? 'звёзды Telegram' : 'звёзды без идентификатора платежа',
    severity: chargeId ? 'normal' : 'attention',
  })

  return {
    credited: true,
    reason: chargeId
      ? 'first delivery'
      : 'no charge id — credited without dedup',
  }
}
