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
import { ценаТокенов, названиеСчёта } from './token-packs' // cyrillic-ok: pre-existing export names
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
  const title = названиеСчёта(tokens) // cyrillic-ok: pre-existing helper name
  const payload = `tokens:${tokens}:${forId}`

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
      try {
        // The columns a cancelled draft stamps. Their absence must not cost
        // the pending row below: the row is what the reconcile needs.
        await input.pool.query(
          `ALTER TABLE token_invoices
             ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
             ADD COLUMN IF NOT EXISTS cancel_reason text`
        )
      } catch {
        // Older grant, older Postgres: the row still gets written.
      }
      const inserted = (await input.pool.query(
        `INSERT INTO token_invoices (telegram_id, tokens, stars) VALUES ($1, $2, $3) RETURNING id`,
        [forId, tokens, stars]
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
