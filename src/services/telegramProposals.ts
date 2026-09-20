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
 * THE IRREVERSIBLE SIX.
 *
 * A deliberate mirror of the render side's IRREVERSIBLE set: the two
 * projects share no imports, so each side spells the list out and a test on
 * each side pins it. The card is the last place a person can still choose
 * not to -- these six must say so before the press, not after.
 */
export const IRREVERSIBLE_SOCIAL: ReadonlySet<string> = new Set([
  'block',
  'delete',
  'delete_chat',
  'kick',
  'leave',
  'profile_photo_delete',
])

/*
 * THE VOCABULARY OF THE SOCIAL CARDS.
 *
 * Twenty acts reached the queue in 2026-09-14, and until these tables the
 * ask fell back to quoting the act's own identifier -- a string no person
 * can read, on the one screen where they decide. Each act asks its own
 * question, labels the thing it is about (a block is about a USER, a pin
 * is about a CHAT), and carries its own verb on the green button, so the
 * muscle memory built on the send verb never executes a deletion. An
 * action outside the tables still names itself rather than borrowing a
 * verb it did not earn.
 */
const ASKS: Record<string, [string, string]> = {
  contact_add: [
    'Добавить контакт в Telegram?',
    'Add this contact on Telegram?',
  ],
  contact_delete: [
    'Удалить контакт в Telegram?',
    'Delete this contact on Telegram?',
  ],
  block: ['Заблокировать пользователя?', 'Block this user?'],
  unblock: ['Разблокировать пользователя?', 'Unblock this user?'],
  profile_update: ['Изменить профиль аккаунта?', 'Update the account profile?'],
  profile_photo: ['Поставить новое фото профиля?', 'Set a new profile photo?'],
  profile_photo_delete: ['Удалить фото профиля?', 'Delete the profile photo?'],
  online: ['Показать статус «в сети»?', 'Show the online status?'],
  pin: ['Закрепить сообщение в чате?', 'Pin this message in the chat?'],
  unpin: ['Открепить сообщение в чате?', 'Unpin this message in the chat?'],
  react: ['Поставить реакцию в Telegram?', 'Add this reaction on Telegram?'],
  vote: ['Проголосовать в опросе?', 'Vote in this poll?'],
  archive: ['Убрать диалог в архив?', 'Archive this chat?'],
  unarchive: ['Вернуть диалог из архива?', 'Unarchive this chat?'],
  mark_unread: ['Пометить диалог непрочитанным?', 'Mark this chat unread?'],
  join: ['Вступить в канал или группу?', 'Join this channel or group?'],
  leave: ['Покинуть чат?', 'Leave this chat?'],
  kick: [
    'Исключить участника из группы?',
    'Remove this member from the group?',
  ],
  delete: [
    'Удалить сообщения в Telegram?',
    'Delete these messages on Telegram?',
  ],
  delete_chat: ['Удалить чат в Telegram?', 'Delete this chat on Telegram?'],
}

/** What the "about" row calls the thing the act is aimed at. */
const LABELS: Record<string, [string, string]> = {
  contact_add: ['Контакт', 'Contact'],
  contact_delete: ['Контакт', 'Contact'],
  block: ['Пользователь', 'User'],
  unblock: ['Пользователь', 'User'],
  profile_update: ['Аккаунт', 'Account'],
  profile_photo: ['Аккаунт', 'Account'],
  profile_photo_delete: ['Аккаунт', 'Account'],
  online: ['Аккаунт', 'Account'],
  pin: ['Чат', 'Chat'],
  unpin: ['Чат', 'Chat'],
  react: ['Чат', 'Chat'],
  vote: ['Чат', 'Chat'],
  archive: ['Чат', 'Chat'],
  unarchive: ['Чат', 'Chat'],
  mark_unread: ['Чат', 'Chat'],
  leave: ['Чат', 'Chat'],
  kick: ['Чат', 'Chat'],
  delete: ['Чат', 'Chat'],
  delete_chat: ['Чат', 'Chat'],
  join: ['Канал', 'Channel'],
}

/** The green button's verb. The send verb stays the default -- and only that. */
const CONFIRM: Record<string, [string, string]> = {
  forward: ['✅ Переслать', '✅ Forward'],
  read: ['✅ Отметить', '✅ Mark read'],
  contact_add: ['✅ Добавить', '✅ Add'],
  contact_delete: ['✅ Удалить', '✅ Delete'],
  block: ['✅ Заблокировать', '✅ Block'],
  unblock: ['✅ Разблокировать', '✅ Unblock'],
  profile_update: ['✅ Изменить', '✅ Update'],
  profile_photo: ['✅ Поставить фото', '✅ Set photo'],
  profile_photo_delete: ['✅ Удалить', '✅ Delete'],
  online: ['✅ В сеть', '✅ Go online'],
  pin: ['✅ Закрепить', '✅ Pin'],
  unpin: ['✅ Открепить', '✅ Unpin'],
  react: ['✅ Реакция', '✅ React'],
  vote: ['✅ Проголосовать', '✅ Vote'],
  archive: ['✅ В архив', '✅ Archive'],
  unarchive: ['✅ Из архива', '✅ Unarchive'],
  mark_unread: ['✅ Непрочитанным', '✅ Mark unread'],
  join: ['✅ Вступить', '✅ Join'],
  leave: ['✅ Покинуть', '✅ Leave'],
  kick: ['✅ Исключить', '✅ Remove'],
  delete: ['✅ Удалить', '✅ Delete'],
  delete_chat: ['✅ Удалить', '✅ Delete'],
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
  if (p.action !== 'send') {
    // A removal is asked as a removal: an empty emoticon takes the
    // reaction off, which is a different question than putting one on.
    if (p.action === 'react' && !String(p.args?.emoticon ?? '').trim())
      return isRu
        ? 'Снять реакцию в Telegram?'
        : 'Remove the reaction on Telegram?'
    // Clearing the history keeps the chat (and the membership); deleting
    // the chat does not. The person is asked which of the two it is.
    if (p.action === 'delete_chat' && p.args?.mode === 'clear')
      return isRu ? 'Очистить историю чата?' : "Clear this chat's history?"
    const row = ASKS[p.action]
    if (row) return isRu ? row[0] : row[1]
    return isRu
      ? `Подтвердить «${p.action}» в Telegram?`
      : `Confirm «${p.action}» on Telegram?`
  }
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
 * The green button's verb. The send verb was born for a send and stayed the
 * only verb for a year; a delete pressed through it would be a deletion
 * wearing a stamp of approval. The wire under the verb -- id and secret --
 * is the same for every act.
 */
function confirmOf(p: Proposal, isRu: boolean): string {
  if (p.action === 'delete_chat' && p.args?.mode === 'clear')
    return isRu ? '✅ Очистить' : '✅ Clear'
  const row = CONFIRM[p.action]
  if (row) return isRu ? row[0] : row[1]
  return isRu ? '✅ Отправить' : '✅ Send'
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
  /*
   * The irreversible warning is the one line that cannot wait for the
   * follow-up: after the press there is nothing to warn about.
   */
  const warnIrrev = IRREVERSIBLE_SOCIAL.has(p.action)
    ? isRu
      ? '\n⚠️ НЕОБРАТИМО — после нажатия вернуть будет нельзя'
      : '\n⚠️ IRREVERSIBLE — this cannot be undone after the press'
    : ''
  /*
   * Profile acts aim at "me": a "To: me" row would be noise under an ask
   * that already names the account. Everything else names its subject -- a
   * contact, a user, a chat, a channel -- instead of a generic "to whom".
   */
  const isSelf = p.target === 'me'
  const labelRow = LABELS[p.action]
  const label = labelRow
    ? isRu
      ? labelRow[0]
      : labelRow[1]
    : p.action === 'read'
      ? isRu
        ? 'Чат'
        : 'Chat'
      : isRu
        ? 'Кому'
        : 'To'
  const head = (
    isSelf
      ? [ask, fromLine, warn, warnIrrev, price, when]
      : [`${ask}\n\n${label}: ${to}`, fromLine, warn, warnIrrev, price, when]
  )
    .filter(s => s !== '')
    .join('')
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
          confirmOf(p, isRu),
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
