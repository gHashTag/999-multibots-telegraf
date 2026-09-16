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
import { rewriteRow, rewriteStyleRows } from '@/navigation/helpers/rewriteMenu'

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
/**
 * One media caption -- photo, voice, video, round video, document -- is
 * capped at 1024 by Telegram; the head and price line need room. Applies to
 * every single-media kind since 2026-09-14, not only photos.
 */
const PHOTO_CHARS = 700
/** An album's body is several captions joined; 1500 keeps the join readable. */
const ALBUM_CHARS = 1500

/**
 * What a draft carries besides words. Mirrors the render side's media union:
 * the server downloads and re-uploads voice, video and round videos itself,
 * so the bot only ever needs the words -- never the bytes. Fetching a
 * stranger's url to "preview" it would be the bot downloading foreign files.
 */
export type BotMedia =
  | { kind: 'photo'; url: string }
  | { kind: 'voice'; url: string; duration?: number }
  | { kind: 'video'; url: string }
  | { kind: 'video_note'; url: string; duration?: number }
  | { kind: 'document'; url: string; fileName?: string }
  | { kind: 'album'; urls: string[]; captions?: string[] }

export interface Proposal {
  id: string
  action: string
  target: string
  what?: string
  /** The recipient in words, from the server; shown beside the id only. */
  display?: string
  /** The thing itself when the draft is media; the card describes it in words. */
  media?: BotMedia
  /** Epoch ms: the press schedules the send for then, instead of now. */
  scheduleAt?: number
  /** Raw tool arguments the card may quote -- forward's source, message ids. */
  args?: Record<string, unknown>
  /** Who is charged at the press, and how much. */
  charge?: { telegramId: string; op: string; tokens: number }
  /** The person in the base this draft is for, when the server knew one. */
  lead?: string
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
/**
 * The words are kept beside the person for one reason: a rewrite press.
 *
 * "Write it shorter" has to be shorter than something, and the rejected draft
 * is nowhere else -- it was never sent, so it is not in the correspondence the
 * agent re-reads on the next turn. Three hundred characters of it are quoted
 * into that turn's brief; the rest would only pad the prompt.
 */
const CARD_WHAT_CHARS = 300
const cardLeads = new Map<string, { lead: string; what: string; at: number }>()

const draftWords = (p: { what?: string; media?: BotMedia }): string => {
  const body =
    p.what ??
    (p.media?.kind === 'album' ? (p.media.captions ?? []).join(' / ') : '')
  return String(body ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CARD_WHAT_CHARS)
}

export function rememberCard(p: {
  id: string
  lead?: string
  target: string
  what?: string
  media?: BotMedia
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
  cardLeads.set(p.id, { lead, what: draftWords(p), at: now })
}

export function takeCardLead(id: string): string | null {
  return takeCardDraft(id)?.lead ?? null
}

/** The person AND the words, for a press that has to write them again. */
export function takeCardDraft(
  id: string
): { lead: string; what: string } | null {
  const v = cardLeads.get(id)
  if (!v) return null
  cardLeads.delete(id)
  if (Date.now() - v.at > CARD_LEAD_TTL_MS) return null
  return { lead: v.lead, what: v.what }
}

/**
 * The person, without consuming the entry.
 *
 * Opening and closing the rewrite list only redraws the same card's buttons;
 * it decides nothing. Consuming the entry there would mean the send that came
 * after it lost the person's history button, for no reason.
 */
export function peekCardLead(id: string): string | null {
  const v = cardLeads.get(id)
  if (!v) return null
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

const two = (n: number): string => String(n).padStart(2, '0')

/*
 * Wall-clock words for a scheduled send. Same-day is HH:MM; another day
 * gains DD.MM, because "18:00" written about next week is a lie by
 * omission. Server-local time, like every other clock the person sees.
 */
function clockOf(at: number): string {
  const d = new Date(at)
  const clock = `${two(d.getHours())}:${two(d.getMinutes())}`
  const now = new Date()
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  return sameDay
    ? clock
    : `${two(d.getDate())}.${two(d.getMonth() + 1)} ${clock}`
}

/*
 * THE ASK NAMES THE ACT.
 *
 * "Отправить сообщение?" was for a while the only question the card knew,
 * which for a round voice note or a five-photo album described neither the
 * thing nor its shape. One verb per action and kind; an unknown action falls
 * back to naming itself rather than pretending to be a message.
 */
function askOf(p: Proposal, isRu: boolean): string {
  const media = p.media
  if (p.action === 'forward')
    return isRu
      ? 'Переслать сообщения в Telegram?'
      : 'Forward these messages on Telegram?'
  if (p.action === 'read')
    return isRu ? 'Отметить чат прочитанным?' : 'Mark this chat as read?'
  if (p.action !== 'send')
    return isRu
      ? `Подтвердить «${p.action}» в Telegram?`
      : `Confirm «${p.action}» on Telegram?`
  switch (media?.kind) {
    case 'photo':
      return isRu
        ? 'Отправить это фото в Telegram?'
        : 'Send this photo on Telegram?'
    case 'voice': {
      const d = media.duration
      const secs = d ? (isRu ? ` (~${d} сек)` : ` (~${d}s)`) : ''
      return isRu
        ? `Отправить это голосовое${secs} в Telegram?`
        : `Send this voice message${secs} on Telegram?`
    }
    case 'video':
      return isRu
        ? 'Отправить это видео в Telegram?'
        : 'Send this video on Telegram?'
    case 'video_note':
      return isRu
        ? 'Отправить этот кружок (видеосообщение) в Telegram?'
        : 'Send this round video message on Telegram?'
    case 'document': {
      const n = String(media.fileName ?? '').trim()
      const name = n ? (isRu ? ` «${n}»` : ` "${n}"`) : ''
      return isRu
        ? `Отправить файл${name} в Telegram?`
        : `Send this file${name} on Telegram?`
    }
    case 'album': {
      const n = media.urls.length
      return isRu
        ? `Отправить альбом из ${n} фото в Telegram?`
        : `Send an album of ${n} photos on Telegram?`
    }
    default:
      return isRu
        ? 'Отправить сообщение в Telegram?'
        : 'Send this Telegram message?'
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
export interface CardOpts {
  extraRows?: InlineKeyboardButton[][]
  /**
   * Offer the rewrite button. Owner-only, like `extraRows`: the press runs a
   * CRM turn on the owner's own correspondence, so a card shown to anybody
   * else must not carry it.
   */
  rewrite?: boolean
  /** Draw the style list in place of the rewrite button. */
  expanded?: boolean
  /**
   * WHY THIS PERSON, IN ONE LINE, UNDER THE RECIPIENT.
   *
   * Measured 16.09.2026: 56 cards in four and a half days, at most five of
   * them pressed. What stands between the owner and the button is not the
   * button -- it is having to open the chat to remember who this is and what
   * they last said. The card named the recipient and showed the words, and
   * answered that question nowhere.
   *
   * Passed as an OPTION rather than carried on the proposal: the line comes
   * from the sweep's own answer, which the brief already demands, so nothing
   * new crosses the wire and the compact tool kit -- which has under a
   * hundred characters of room before it stops fitting a small model's
   * window -- pays nothing for it.
   */
  because?: string
}

/**
 * The buttons under a card, in both of its states.
 *
 * Built apart from the text so that opening and closing the rewrite list can
 * redraw exactly the card's own keyboard rather than a second, drifting copy
 * of it -- the press that opens the list edits the markup and nothing else.
 */
export function cardKeyboard(
  p: { id: string; secret: string },
  isRu: boolean,
  opts: CardOpts = {}
): ReturnType<typeof Markup.inlineKeyboard> {
  const decide = [
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
  ]
  if (!opts.rewrite)
    return Markup.inlineKeyboard([decide, ...(opts.extraRows ?? [])])
  // Send and cancel stay above the styles: opening the list must not take
  // away the answer the person already had.
  return Markup.inlineKeyboard(
    opts.expanded
      ? [decide, ...rewriteStyleRows(p.id, p.secret, isRu)]
      : [decide, ...rewriteRow(p.id, p.secret, isRu), ...(opts.extraRows ?? [])]
  )
}

export function proposalCard(
  p: Proposal & { secret: string },
  isRu: boolean,
  opts: CardOpts = {}
): {
  text: string
  markup: ReturnType<typeof Markup.inlineKeyboard>
  photo?: string
} {
  const media = p.media
  const photo = media?.kind === 'photo' ? media.url : undefined
  const limit = !media
    ? SHOWN_CHARS
    : media.kind === 'album'
      ? ALBUM_CHARS
      : PHOTO_CHARS
  // An album's words are its captions, joined; a text draft's words are `what`.
  const body =
    p.what ??
    (media?.kind === 'album' ? (media.captions ?? []).join(' / ') : '')
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
  const ask = askOf(p, isRu)
  // The price is on the card because the press is what charges it.
  const price = p.charge
    ? isRu
      ? `\nСпишется у получателя: ${p.charge.tokens} токенов`
      : `\nThe recipient will be charged: ${p.charge.tokens} tokens`
    : ''
  // A forward's card names both ends: where from, where to.
  const fromPeer =
    p.action === 'forward' ? String(p.args?.fromPeer ?? '').trim() : ''
  const fromLine = fromPeer
    ? `\n${isRu ? 'Из' : 'From'}: ${fromPeer.slice(0, 64)}`
    : ''
  // Reading is visible to the other side -- the card must say so.
  const warn =
    p.action === 'read'
      ? isRu
        ? '\n⚠️ Собеседник увидит прочтение'
        : '\n⚠️ The other person will see the read receipt'
      : ''
  const when = p.scheduleAt
    ? isRu
      ? `\nУйдёт в ${clockOf(p.scheduleAt)} (можно отменить до)`
      : `\nWill be sent at ${clockOf(p.scheduleAt)} (cancellable until then)`
    : ''
  const label =
    p.action === 'read' ? (isRu ? 'Чат' : 'Chat') : isRu ? 'Кому' : 'To'
  /*
   * WHY THIS PERSON, ON THE CARD.
   *
   * Right under the recipient, before the words, because it answers the
   * question the owner asks first and the words answer second. One line, cut
   * hard: the moment it takes two lines it competes with the draft itself.
   *
   * Third-party text never reaches here -- the render composes this line from
   * facts it already holds about the queue, not from anything the person
   * wrote -- but it is cut and flattened all the same, on the principle that
   * a card must not be able to grow a second message inside itself.
   */
  const whyLine = String(opts.because ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  const why = whyLine ? `\n${isRu ? 'Почему' : 'Why'}: ${whyLine}` : ''
  const head = `${ask}\n\n${label}: ${to}${why}${fromLine}${warn}${price}${when}`
  const tail = cut
    ? isRu
      ? `\n\n(показано ${limit} из ${body.length} символов — отправится целиком)`
      : `\n\n(showing ${limit} of ${body.length} characters — all of it will be sent)`
    : ''

  return {
    ...(photo ? { photo } : {}),
    text: shown ? `${head}\n\n${shown}${tail}` : head,
    // A rewrite has to have something to rewrite FOR: the turn it starts
    // prepares for one numeric person, so a card without one offers no styles.
    markup: cardKeyboard(p, isRu, {
      ...opts,
      rewrite: Boolean(opts.rewrite) && Boolean(cardLeadOf(p)),
    }),
  }
}
