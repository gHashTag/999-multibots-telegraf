/**
 * THE HALF THAT MAKES "SEND A MESSAGE" REAL.
 *
 * `tg_send` on the render server never sends. It returns a proposal, which is
 * the right design -- a model must not write to another human being on its own
 * decision. What did not exist was anything able to ACCEPT one: measured
 * 2026-09-07, `grep -rn proposal` across the player and the bot found not a
 * single reader, so the tool could not reach anybody, ever.
 *
 * The queue now lives on the server (`src/agent/tg-proposals.ts`) with three
 * routes. This module is the bot's side of it: after an agent answer that
 * called an acting tool, fetch what is waiting, show it in full, and let a
 * button press -- and nothing else -- carry it out.
 *
 * ── WHY THE CONFIRMATION IS HERE AND NOT IN THE MINI APP ───────────────────
 *
 * This is where the person and the agent are already talking. Asking them to
 * open an app to approve a sentence they just discussed adds a door between
 * the decision and the act, and doors are where things get abandoned.
 *
 * ── WHY THE WHOLE TEXT, NOT A SUMMARY ─────────────────────────────────────
 *
 * A confirmation that says "send the message to Ivan?" asks somebody to
 * approve words they have not read. The recipient and the full text go into
 * the message; if it is long enough to be cut, the cut is stated rather than
 * hidden, because silent truncation is how a person approves a paragraph they
 * never saw.
 */
import { Markup } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'
import { logger } from '@/utils/logger'

const BASE = 'https://vibee-render-production.up.railway.app'

/** Callback prefixes. Kept short: Telegram allows 64 bytes of callback data. */
export const PROPOSAL_OK = 'tgp:ok:'
export const PROPOSAL_NO = 'tgp:no:'

/**
 * How much of the draft is shown.
 *
 * Telegram refuses a message over 4096 characters outright, and the draft
 * shares that message with a heading and a recipient. 3000 leaves room and is
 * far above any real message written in a chat.
 */
const SHOWN_CHARS = 3000
/** A photo caption is capped at 1024 by Telegram; the head and price line need room. */
const PHOTO_CHARS = 700

export interface Proposal {
  id: string
  action: string
  target: string
  what?: string
  /** The recipient in words, from the server; shown beside the id only. */
  display?: string
  /** A photo that IS the service; the card shows it before anything leaves. */
  media?: { kind: 'photo'; url: string }
  /** Who is charged at the press, and how much. */
  charge?: { telegramId: string; op: string; tokens: number }
  /** The person in the base this draft is for, when the server knew one. */
  lead?: string
  /**
   * Why this person, in one line, composed by the server.
   *
   * Measured 16.09.2026: five cards have ever left the seller, four of them
   * in the last week, against 316 people waiting -- and the limiter is this
   * press. What stands in front of it is having to open the chat to remember
   * who this is and what they said. The card said WHO and WHAT WILL BE SENT;
   * this is the third thing, and it carries THEIR words, so it is trimmed the
   * way `display` is.
   */
  because?: string
}

const NUMERIC_LEAD = /^\d{5,15}$/

/** The numeric person behind a draft: the server's lead, or a numeric target. */
export function cardLeadOf(p: {
  lead?: string
  target: string
}): string | null {
  if (NUMERIC_LEAD.test(String(p.lead ?? ''))) return String(p.lead)
  if (NUMERIC_LEAD.test(String(p.target ?? ''))) return String(p.target)
  return null
}

/*
 * THE CARD REMEMBERS WHO IT WAS FOR.
 *
 * The press carries an id and a secret, nothing else -- so the follow-up
 * ("✅ Отправлено") could not offer the person's history or chat. A small
 * bounded map, id -> lead, filled when a card is drawn and read once at the
 * press. Fifteen minutes, two hundred entries; a restart in between simply
 * means a follow-up without the person's buttons, never a wrong person.
 */
const CARD_LEAD_TTL_MS = 15 * 60_000
const CARD_LEAD_MAX = 200
// owner-scope: keyed by card id; the press it answers is already owner-checked
const cardLeads = new Map<string, { lead: string; at: number }>()

export function rememberCard(p: {
  id: string
  lead?: string
  target: string
}): void {
  const lead = cardLeadOf(p)
  if (!lead) return
  const now = Date.now()
  for (const [id, v] of cardLeads)
    if (now - v.at > CARD_LEAD_TTL_MS) cardLeads.delete(id)
  while (cardLeads.size >= CARD_LEAD_MAX) {
    const oldest = cardLeads.keys().next().value
    if (oldest === undefined) break
    cardLeads.delete(oldest)
  }
  cardLeads.set(p.id, { lead, at: now })
}

export function takeCardLead(id: string): string | null {
  const v = cardLeads.get(id)
  if (!v) return null
  cardLeads.delete(id)
  return Date.now() - v.at > CARD_LEAD_TTL_MS ? null : v.lead
}

export function forgetCardLeadsForTests(): void {
  cardLeads.clear()
}

function apiKey(): string {
  return process.env.RENDER_API_KEY || ''
}

/**
 * Confirm: the server claims the draft and carries it out.
 *
 * Three outcomes, not two. `unknown` is the one that matters: the request left
 * and the connection died before an answer came back, so the message may well
 * have gone out. Reproduced against a server that sends and then drops the
 * socket -- the recipient got the message and the owner was shown a flat
 * "not sent".
 *
 * That is a lie about a state we do not know, and it is the expensive kind:
 * the person writes the message again, and it arrives twice.
 */
export async function confirmProposal(
  telegramId: string,
  id: string,
  secret: string
): Promise<{ ok: boolean; unknown?: boolean; error?: string }> {
  return post('/api/tg/proposal/confirm', telegramId, id, secret)
}

/** Cancel: the same claim, so a cancelled draft can no longer be sent. */
export async function cancelProposal(
  telegramId: string,
  id: string,
  secret: string
): Promise<{ ok: boolean; error?: string }> {
  return post('/api/tg/proposal/cancel', telegramId, id, secret)
}

async function post(
  path: string,
  telegramId: string,
  id: string,
  secret: string
): Promise<{ ok: boolean; unknown?: boolean; error?: string }> {
  if (!apiKey()) return { ok: false, error: 'сервис не настроен' }
  try {
    const r = await fetch(
      `${BASE}${path}?telegram_id=${encodeURIComponent(telegramId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey() },
        body: JSON.stringify({ id, secret }),
      }
    )
    const d = (await r.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
    }
    if (!r.ok || d.ok === false) {
      // The server ANSWERED. This one really did not send.
      return { ok: false, error: d.error || `сервер ответил ${r.status}` }
    }
    return { ok: true }
  } catch (e) {
    /*
     * NOT AN ANSWER -- AN ABSENCE OF ONE.
     *
     * The route deletes the draft and only then sends, and its own contract
     * forbids putting a failed draft back. So by the time the connection
     * broke, the message may already be in somebody's chat. Saying "not sent"
     * here would be asserting a fact about a state nobody knows, and the
     * person would rewrite the message and send it twice.
     *
     * Logged, because there is otherwise no breadcrumb to reconcile against.
     */
    const error = (e as Error)?.message || 'связь потеряна'
    logger.warn('proposal confirm outcome unknown', {
      telegram_id: telegramId,
      proposal: id,
      path,
      error,
    })
    return { ok: false, unknown: true, error }
  }
}

/**
 * The card a person confirms.
 *
 * The recipient and the text are quoted verbatim. `escape` is deliberately not
 * applied and no parse mode is used: a draft containing `*` or `_` would
 * otherwise either break the message or be silently reformatted, and the words
 * shown must be exactly the words sent.
 */
export function proposalCard(
  p: Proposal & { secret: string },
  isRu: boolean,
  opts: { extraRows?: InlineKeyboardButton[][] } = {}
): {
  text: string
  markup: ReturnType<typeof Markup.inlineKeyboard>
  photo?: string
} {
  const photo = p.media?.kind === 'photo' ? p.media.url : undefined
  const limit = photo ? PHOTO_CHARS : SHOWN_CHARS
  const body = p.what ?? ''
  const cut = body.length > limit
  const shown = cut ? body.slice(0, limit) : body

  /*
   * A BARE ID IS NOT AN ADDRESS A PERSON CAN CHECK.
   *
   * `tg_dialogs` hands the model `id` and no username, so the common case --
   * "reply to this dialog" -- reaches here as digits. "Кому: 900000002" asks
   * somebody to approve a recipient they cannot recognise, and the send path
   * was deliberately made to work for exactly that shape.
   *
   * Naming it as unverified does not make it verifiable; it stops the card
   * from implying that it is. Resolving the id to a name belongs in the
   * proposal itself and is filed separately.
   */
  const opaque = /^-?\d+$/.test(p.target)
  /*
   * THE TRUSTED PART FIRST. `target` is where the message actually goes --
   * an id or a @username the server resolved. `display` is third-party
   * text: whatever the person typed into Telegram as their name, cut to
   * one line on the server and again here. Printing the target first and
   * the name after a dash means a name like "Оля, id 111" cannot put a
   * false id in front of the real one, and a @username draft is not
   * labelled "id @pilot_client".
   */
  const name = String(p.display ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
  const sameAsTarget = new RegExp(
    '\\(?' + p.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\)?',
    'i'
  )
  const rest = name
    .replace(sameAsTarget, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim()
  const to = rest
    ? `${p.target} — ${rest}`
    : opaque
      ? isRu
        ? `${p.target} (числовой id — не могу показать имя)`
        : `${p.target} (numeric id — no name to show)`
      : p.target
  const ask = photo
    ? isRu
      ? 'Отправить это фото в Telegram?'
      : 'Send this photo on Telegram?'
    : isRu
      ? 'Отправить сообщение в Telegram?'
      : 'Send this Telegram message?'
  // The price is on the card because the press is what charges it.
  const price = p.charge
    ? isRu
      ? `\nСпишется у получателя: ${p.charge.tokens} токенов`
      : `\nThe recipient will be charged: ${p.charge.tokens} tokens`
    : ''
  /*
   * Their own words, and the queue's opinion, as the server composed them.
   * Third-party text: flattened to one line and cut, exactly like `display`
   * two lines above. The card is plain text, so nothing here can render.
   */
  const reason = String(p.because ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  const why = reason ? `\n${isRu ? 'Почему он' : 'Why them'}: ${reason}` : ''
  const head = `${ask}\n\n${isRu ? 'Кому' : 'To'}: ${to}${why}${price}`
  const tail = cut
    ? isRu
      ? `\n\n(показано ${limit} из ${body.length} символов — отправится целиком)`
      : `\n\n(showing ${limit} of ${body.length} characters — all of it will be sent)`
    : ''

  return {
    ...(photo ? { photo } : {}),
    text: shown ? `${head}\n\n${shown}${tail}` : head,
    markup: Markup.inlineKeyboard([
      [
        /*
         * The secret rides in the button, not in our memory.
         *
         * Telegram stores callback data and hands it back on the press, so the
         * bot holds no state between showing the card and the tap -- a restart
         * between the two does not strand a draft. Budget is 64 bytes:
         * "tgp:ok:" (7) + a 12-char id + ":" + a 32-char secret = 52.
         */
        Markup.button.callback(
          isRu ? '✅ Отправить' : '✅ Send',
          `${PROPOSAL_OK}${p.id}:${p.secret}`
        ),
        Markup.button.callback(
          isRu ? '✖️ Отмена' : '✖️ Cancel',
          `${PROPOSAL_NO}${p.id}:${p.secret}`
        ),
      ],
      ...(opts.extraRows ?? []),
    ]),
  }
}
