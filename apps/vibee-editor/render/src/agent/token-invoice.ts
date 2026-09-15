/**
 * A STARS INVOICE LINK, MINTED FOR A NAMED PERSON.
 *
 * The one payment primitive this platform has that works from ANY chat: a
 * link created by the bot that opens Telegram's native Stars payment sheet
 * when tapped. A user account cannot issue an invoice -- only a bot can -- so
 * "pay right here in our conversation" means "here is a link", and this is
 * where the link comes from.
 *
 * ── ONE PRICE, ONE PAYLOAD, TWO CALLERS ────────────────────────────────────
 *
 * The mini app's cashier (`/api/tokens/invoice`) and the personal seller
 * (`crm_offer`) both come through here. Price is `ценаТокенов` from
 * token-packs.ts and nothing else; the payload is `tokens:<n>:<telegram_id>`,
 * which is the exact string the bot's payment handler already recognises and
 * credits (`parseTokensPayload` in src/handlers/paymentHandlers). A second
 * cashier with its own price or its own payload would be a second truth about
 * money, and this service has had enough of those.
 *
 * ── WHOSE ID GOES IN THE PAYLOAD ───────────────────────────────────────────
 *
 * The person who will RECEIVE the tokens. For the mini app that is the caller.
 * For a sale in a DM it is the lead -- the owner sends the link, the lead pays,
 * and the credit must land on the lead. Putting the owner's id there would
 * quietly pay the owner for the lead's money.
 */
import {
  ценаТокенов, // cyrillic-ok: pre-existing export name
  названиеСчёта, // cyrillic-ok: pre-existing export name
  // Aliased to English on the way in, the way token-packs.ts does for its own
  // ceiling: the guard that keeps code out of Cyrillic cannot mark an `if`.
  МАКС_ЗВЁЗД_ПОДПИСКА as SUB_MAX_STARS, // cyrillic-ok: pre-existing export name
  ПЕРИОД_ПОДПИСКИ_С as SUB_PERIOD_S, // cyrillic-ok: pre-existing export name
} from './token-packs'
import { record } from '../hive/journal'

export interface MintedInvoice {
  url: string
  payload: string
  tokens: number
  stars: number
  title: string
  /**
   * The pending row's id, when one was written. Absent when there was no
   * pool, or the write failed (journaled below), or the database answered
   * without RETURNING. A draft carries it so a cancel can mark the row.
   */
  invoiceId?: number
}

export interface MintInput {
  /** Who the tokens are for. Numeric telegram_id, as a string. */
  forTelegramId: string
  tokens: number
  pool?: { query: (sql: string, params?: unknown[]) => Promise<unknown> }
  /** Injected so the mint can be tested without reaching api.telegram.org. */
  fetchImpl?: typeof fetch
  botToken?: string
  /**
   * Charge this every thirty days instead of once.
   *
   * Thirty days is not a default but the ONLY period Telegram accepts, and
   * the ceiling drops from 100000 stars to 10000 -- see token-packs.ts, where
   * both numbers were measured against the live API rather than guessed.
   */
  subscription?: boolean
}

/**
 * Does this person already hold a subscription invoice we minted?
 *
 * Telegram is explicit that it will not stop us: "any number of subscriptions
 * can be active for a given bot at the same time, including multiple
 * concurrent subscriptions from the same user". So two cards approved a week
 * apart would bill one person twice every month, and neither the owner nor
 * the seller would see it anywhere.
 *
 * The second INVOICE is what creates the second subscription, so that is what
 * this refuses. A cancelled draft (cancelled_at) no longer counts -- killing
 * the card is exactly how the owner says "not that one, this one".
 *
 * Unknown answers do NOT block a sale: on a database error this says no and
 * the mint goes ahead. The guard is an extra pair of eyes, not the only one
 * -- the owner still reads the card, and Telegram shows every person their
 * own subscriptions.
 */
export async function hasOpenSubscription(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  forTelegramId: string
): Promise<boolean> {
  try {
    await ensureInvoiceColumns(pool)
    const r = (await pool.query(
      `SELECT 1 FROM token_invoices
        WHERE telegram_id = $1 AND subscription = TRUE AND cancelled_at IS NULL
        LIMIT 1`,
      [String(forTelegramId)]
    )) as { rows?: unknown[] } | undefined
    return Boolean(r?.rows?.length)
  } catch {
    return false
  }
}

/**
 * MARK THE SALE PAID WHERE THE MONEY ACTUALLY LANDS.
 *
 * `redeemed` was written in exactly one place: the /api/tokens/verify route,
 * which matches a payment by asking getStarTransactions on the DEFAULT
 * cashier's token. But the personal seller mints with the person's OWN bot
 * (tokenForBot), and the table has no column saying which bot minted what --
 * so that payment is never in the default cashier's transactions and the row
 * stayed `redeemed = FALSE` forever.
 *
 * The tokens were credited normally the whole time, by another path that does
 * not touch this table at all. Nobody lost money; the daily summary lost the
 * truth. It reads these rows and prints "paid: 0, waiting: N" with the advice
 * "no purchases yet -- remind them", so the owner goes off to chase people who
 * have already paid.
 *
 * So the row is redeemed here instead, from the credit that really happened,
 * with the same charge id verify would have matched. Newest matching invoice
 * first: a person can hold several, and the one they just paid is the last
 * one they were given.
 */
export async function redeemInvoiceFor(
  pool: {
    query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number }>
  },
  paid: {
    telegramId: string
    tokens: number
    chargeId?: string
    /**
     * Did the money actually move?
     *
     * The rule lives here rather than at the call site so that it can be
     * tested at all: render-server.ts cannot be imported from a test, and a
     * guard nothing can exercise is a guard that quietly stops working. A
     * redelivered charge credits nothing and must close no sale.
     */
    credited: boolean
  }
): Promise<'redeemed' | 'no matching invoice'> {
  try {
    if (paid?.credited !== true) return 'no matching invoice'
    const tid = String(paid?.telegramId ?? '').trim()
    const tokens = Number(paid?.tokens)
    if (!tid || !Number.isFinite(tokens) || tokens <= 0) {
      return 'no matching invoice'
    }
    await ensureInvoiceColumns(pool as never)
    const r = await pool.query(
      `UPDATE token_invoices SET redeemed = TRUE, star_tx_id = COALESCE($2, star_tx_id)
        WHERE id = (
          SELECT id FROM token_invoices
           WHERE telegram_id = $1 AND tokens = $3 AND redeemed = FALSE
             AND cancelled_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
        )`,
      [tid, paid.chargeId ? String(paid.chargeId) : null, Math.floor(tokens)]
    )
    return (r?.rowCount ?? 0) > 0 ? 'redeemed' : 'no matching invoice'
  } catch {
    // The money is already credited. A bookkeeping row that would not update
    // must never turn a successful payment into an error for the caller.
    return 'no matching invoice'
  }
}

export function paymentBotToken(): string {
  return process.env.TOKENS_PAYMENT_BOT_TOKEN || ''
}

/**
 * Mint the link.
 *
 * Throws on a refusal with a sentence a person can act on; never returns a
 * link that is not real. The pending row is best-effort and its failure is
 * journaled rather than fatal -- refusing to sell because a bookkeeping row did
 * not write would block payments the bot's handler processes perfectly well.
 */
let invoiceColumnsReady = false

/**
 * The columns the code uses beyond the original CREATE TABLE, added ONCE per
 * process.
 *
 * `star_tx_id` WAS MISSING FROM THIS LIST AND FROM EVERY OTHER DDL IN THE
 * REPOSITORY. /api/tokens/verify both reads it (render-server.ts, the
 * `usedTxIds` query) and writes it (the UPDATE that marks a row redeemed),
 * and nothing anywhere created it -- verified by grep across every file and
 * by a read-only query against production on 2026-09-09, where
 * token_invoices carried id, telegram_id, tokens, stars, created_at,
 * redeemed, cancelled_at, cancel_reason and no star_tx_id (control: the same
 * query finds cancel_reason).
 *
 * The consequence is not cosmetic. `verify` is the mini-app's answer to "did
 * my payment arrive?", and its FIRST query names that column, so the whole
 * route threw for anybody with an unredeemed invoice. That is every one of
 * the five invoices this product has ever minted -- all still
 * `redeemed = false`, which is exactly what a route that cannot run leaves
 * behind. The path was going to fail on the first real sale.
 *
 * `ADD COLUMN IF NOT EXISTS` is a no-op on the data but not on the lock: it
 * takes ACCESS EXCLUSIVE on token_invoices every time it runs, and the
 * first version ran it on every /api/tokens/verify -- which the mini-app
 * calls on every open. Never throws: an older grant leaves the columns
 * missing and the caller's own statement says so in its own words.
 */
export async function ensureInvoiceColumns(pool: {
  query: (sql: string, params?: unknown[]) => Promise<unknown>
}): Promise<boolean> {
  if (invoiceColumnsReady) return true
  try {
    await pool.query(
      `ALTER TABLE token_invoices
         ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
         ADD COLUMN IF NOT EXISTS cancel_reason text,
         ADD COLUMN IF NOT EXISTS star_tx_id text,
         ADD COLUMN IF NOT EXISTS subscription boolean NOT NULL DEFAULT false`
    )
    invoiceColumnsReady = true
    return true
  } catch {
    return false
  }
}

/** For tests: the next call runs the ALTER again. */
export function forgetInvoiceColumnsForTests(): void {
  invoiceColumnsReady = false
}

export async function mintTokenInvoice(
  input: MintInput
): Promise<MintedInvoice> {
  const token = input.botToken ?? paymentBotToken()
  if (!token) {
    throw new Error('касса не настроена: TOKENS_PAYMENT_BOT_TOKEN не задан')
  }
  const forId = String(input.forTelegramId ?? '').trim()
  if (/^-/.test(forId)) {
    // Bot-API style: negative is a group or a channel. Tokens are credited to
    // a PERSON, and stripping the sign would credit a random positive id.
    throw new Error(
      'это чат или канал, а не человек — токены зачисляются человеку'
    )
  }
  if (!/^\d{5,15}$/.test(forId)) {
    throw new Error('нужен числовой telegram_id получателя, а не имя')
  }
  // The price scale's field names are pre-existing and Cyrillic; aliased once
  // here so the rest of this file reads in one language.
  const { токенов: tokens, звёзд: stars } = ценаТокенов(Number(input.tokens)) // cyrillic-ok
  const monthly = input.subscription === true
  if (monthly && input.pool && (await hasOpenSubscription(input.pool, forId))) {
    throw new Error(
      'у этого человека уже есть наша подписка — второй счёт спишет с него ' +
        'дважды в месяц; отмените прежнюю карточку, если нужна другая сумма'
    )
  }
  if (monthly && stars > SUB_MAX_STARS) {
    // cyrillic-ok: pre-existing name
    // A different ceiling from the one-off one, and lower. Refusing here with
    // the real number beats SUBSCRIPTION_AMOUNT_INVALID from Telegram.
    throw new Error(
      `подписка на ${tokens} токенов — это ${stars} звёзд в месяц, ` +
        `а Telegram не берёт больше ${SUB_MAX_STARS} за период; ` +
        `возьмите пакет поменьше или выпишите разовый счёт`
    )
  }
  const title = monthly
    ? `${tokens} токенов Trinity каждый месяц` // cyrillic-ok: invoice title
    : названиеСчёта(tokens) // cyrillic-ok: pre-existing helper name
  /*
   * A SUBSCRIPTION SAYS SO IN ITS PAYLOAD.
   *
   * Telegram hands the payload back twice: on every renewal payment, and on
   * BotSubscriptionUpdated when the person cancels or a charge fails. Both
   * need to know this was a subscription, and the payload is the only thing
   * we are given in the second case. parseTokensPayload in the bot reads both
   * prefixes -- a renewal that did not credit would be money taken for
   * nothing.
   */
  const payload = `${monthly ? 'subtokens' : 'tokens'}:${tokens}:${forId}`

  const doFetch = input.fetchImpl ?? fetch
  const r = await doFetch(
    `https://api.telegram.org/bot${token}/createInvoiceLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: 'Токены для генераций в Trinity S³AI',
        payload,
        currency: 'XTR',
        prices: [{ label: title, amount: stars }],
        ...(monthly ? { subscription_period: SUB_PERIOD_S } : {}),
      }),
    }
  )
  const d = (await r.json()) as {
    ok?: boolean
    result?: unknown
    description?: string
  }
  const url = typeof d.result === 'string' ? d.result : ''
  if (!d.ok || !url) {
    throw new Error(
      'Telegram не выдал инвойс: ' + String(d.description ?? '').slice(0, 120)
    )
  }

  let invoiceId: number | undefined
  if (input.pool) {
    try {
      await input.pool.query(
        `CREATE TABLE IF NOT EXISTS token_invoices (
           id serial PRIMARY KEY,
           telegram_id text NOT NULL,
           tokens int NOT NULL,
           stars int NOT NULL,
           created_at timestamptz NOT NULL DEFAULT now(),
           redeemed boolean NOT NULL DEFAULT false
         )`
      )
      // The columns a cancelled draft stamps. Their absence must not cost
      // the pending row below: the row is what the reconcile needs.
      await ensureInvoiceColumns(input.pool)
      const inserted = (await input.pool.query(
        `INSERT INTO token_invoices (telegram_id, tokens, stars, subscription)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [forId, tokens, stars, monthly]
      )) as { rows?: Array<{ id?: unknown }> } | undefined
      const rawId = inserted?.rows?.[0]?.id
      if (
        rawId !== undefined &&
        rawId !== null &&
        Number.isFinite(Number(rawId))
      ) {
        invoiceId = Number(rawId)
      }
    } catch (e) {
      // The console line stays: the journal lives in the same database that
      // just failed, so when it matters most this may be the only trace.
      console.warn(
        '[STARS] pending-чек не записался:', // cyrillic-ok: pre-existing log text
        String(e).slice(0, 120)
      )
      try {
        void record(input.pool as never, {
          kind: 'payment',
          who: forId,
          amount: stars,
          what: 'счёт выдан без pending-строки: сверка по звёздам его не найдёт', // cyrillic-ok: journal text
          severity: 'attention',
        })
      } catch {
        // The journal is the last net; if it is down too there is nowhere
        // left to write, and the link is still a real link.
      }
    }
  }

  return {
    url,
    payload,
    tokens,
    stars,
    title,
    ...(invoiceId !== undefined ? { invoiceId } : {}),
  }
}
