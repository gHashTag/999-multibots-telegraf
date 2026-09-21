/**
 * DOES THIS TELEGRAM STARS TRANSACTION PAY THIS TOKEN INVOICE?
 *
 * The question `/api/tokens/verify` asks when the bot's successful_payment
 * handler did not credit (it is the FALLBACK path). It used to be answered by
 * the star AMOUNT and the payer alone -- and `getStarTransactions` returns
 * every sale of the cashier bot, not only token invoices.
 *
 * So a Golden Foundry club payment of 3999 stars matched a pending token
 * invoice priced at 3999 (3427 tokens), and the person got the membership AND
 * the tokens for one payment; the same with 12499 stars and 10713 tokens. The
 * club branch writes only payments_v2, never star_payments, so the charge-id
 * lock that prevents a double credit elsewhere never saw it. Found by a money
 * trace on 2026-09-21 and not refuted by three independent skeptics.
 *
 * ── THE INVOICE, NOT THE AMOUNT ────────────────────────────────────────────
 *
 * A token invoice is minted with payload `tokens:<n>:<forId>`, and its row is
 * inserted with telegram_id = forId. The verify loop loads rows for the
 * caller, so for any row it holds the exact payload that paid it is known --
 * and required.
 *
 * ── A MISSING PAYLOAD IS A REFUSAL ─────────────────────────────────────────
 *
 * This is the fallback; the primary credit is the bot's successful_payment
 * handler. An unverifiable match here costs nothing -- the primary path still
 * credits -- while a wrong match costs real provider spend. So when Telegram
 * omits the payload, this says no.
 *
 * Pure on purpose: the route lives inside render-server.ts, which cannot be
 * imported by a test without booting the server, and a rule tested by reading
 * its source is a rule nobody has actually run.
 */
export interface StarTx {
  id?: unknown
  amount?: unknown
  /** Unix SECONDS, as the Bot API sends it. */
  date?: unknown
  source?: {
    user?: { id?: unknown }
    invoice_payload?: unknown
    subscription_period?: unknown
  }
}

export interface PendingTokenInvoice {
  tokens: number
  stars: number
  /** When the invoice was minted. */
  createdAt: Date
}

/** How far before the invoice a payment may be dated and still count. */
export const CLOCK_SKEW_MS = 60_000

export function txPaysInvoice(
  tx: StarTx,
  invoice: PendingTokenInvoice,
  payerId: string,
  alreadyUsed: ReadonlySet<string>
): boolean {
  if (alreadyUsed.has(String(tx.id))) return false
  // A subscription charge belongs to club-membership.ts, never to a token row.
  if (tx.source?.subscription_period) return false
  if (
    String(tx.source?.invoice_payload ?? '') !==
    `tokens:${invoice.tokens}:${payerId}`
  ) {
    return false
  }
  if (Number(tx.amount) !== invoice.stars) return false
  if (tx.source?.user?.id !== Number(payerId)) return false
  /*
   * Seconds times a thousand, compared as NUMBERS. This once went through
   * Date.parse(t.date * 1000), which takes a string and returned NaN, and
   * `NaN > x` is always false -- so the fallback never credited anything.
   */
  const txMs = Number(tx.date) * 1000
  return txMs > invoice.createdAt.getTime() - CLOCK_SKEW_MS
}
