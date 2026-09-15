/**
 * "NOT LIKE THAT" NEEDED A BUTTON.
 *
 * A prepared draft had exactly two answers: send it, or cancel it. Cancelling
 * is what a person presses when the words are nearly right but too long, too
 * pushy, or missing the price -- and then the draft is gone and the only way
 * back is to type a new instruction to the agent by hand, in the middle of a
 * chat where every other action is a tap.
 *
 * Owner: more CRM control buttons, and buttons for rewriting the replies.
 * This is the second half: six ways to say what was wrong with the draft, each
 * one press, each turning into one line of brief for the next attempt.
 *
 * ── WHY THE STYLES HIDE BEHIND ONE BUTTON ─────────────────────────────────
 *
 * Eight buttons under a card is worse than four, not better. Telegram gives a
 * row's width to its buttons (hence MAX_BUTTONS_PER_ROW = 2), and a card that
 * opens with eight choices makes the two that matter -- send, cancel -- just
 * two more things to read. So the card keeps its shape, gains ONE button, and
 * the styles appear in place of nothing only after it is pressed: the same
 * progressive disclosure the refusal confirmation already uses. The back
 * button puts the card exactly as it was, so opening the list costs nothing.
 *
 * ── THE GRAMMAR ───────────────────────────────────────────────────────────
 *
 *   tgp:rw:<id>:<secret>            open the styles
 *   tgp:rb:<id>:<secret>            back to the card
 *   tgp:re:<style>:<id>:<secret>    rewrite it this way
 *
 * The secret rides along for the same reason it does on `tgp:ok:` -- the press
 * has to be able to CANCEL the old draft, and cancelling is authorised by the
 * secret, not by the id. Which is also why `scrubCallbackSecrets` has to know
 * these three prefixes: without that, every rewrite press would print a live
 * secret into the logs in full.
 *
 * Budget, worst case: "tgp:re:" (7) + "price" (5) + ":" + a 12-char id + ":" +
 * a 32-char secret = 58 of the 64 bytes Telegram allows.
 */

import { Markup } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'

export const REWRITE_OPEN = 'tgp:rw:'
export const REWRITE_BACK = 'tgp:rb:'
export const REWRITE_STYLE = 'tgp:re:'

export const REWRITE_OPEN_RE = /^tgp:rw:([^:]+):(.+)$/
export const REWRITE_BACK_RE = /^tgp:rb:([^:]+):(.+)$/
export const REWRITE_STYLE_RE = /^tgp:re:([a-z]{3,6}):([^:]+):(.+)$/

export interface RewriteStyle {
  /** ASCII, three to six letters -- it is spent out of a 64-byte budget. */
  id: string
  label: string
  labelEn: string
  /** The one line handed to the agent, in its own language. */
  note: string
}

/*
 * SIX, AND THEY ARE THE SIX A SELLER ACTUALLY ASKS FOR.
 *
 * Read off the owner's own corrections in the transcript: too long, too hard,
 * too vague about what happens next, no price, no question to answer, and
 * "just write it differently". A seventh would be a row of its own.
 */
export const REWRITE_STYLES: readonly RewriteStyle[] = [
  {
    id: 'short',
    label: '✂️ Короче',
    labelEn: '✂️ Shorter',
    note: 'короче: тот же смысл в двух предложениях, без вступления и без повторов.',
  },
  {
    id: 'soft',
    label: '🤝 Мягче',
    labelEn: '🤝 Softer',
    note: 'мягче и теплее: без давления, без требований, по-человечески.',
  },
  {
    id: 'firm',
    label: '💪 Твёрже',
    labelEn: '💪 Firmer',
    note: 'определённее: прямо предложи один конкретный следующий шаг.',
  },
  {
    id: 'price',
    label: '💰 С ценой',
    labelEn: '💰 With price',
    note: 'с ценой: назови стоимость и что в неё входит, без скидок от себя.',
  },
  {
    id: 'ask',
    label: '❓ Вопросом',
    labelEn: '❓ As a question',
    note: 'закончи одним простым вопросом, на который легко ответить.',
  },
  {
    id: 'other',
    label: '🔁 Другой вариант',
    labelEn: '🔁 Another take',
    note: 'другими словами: тот же смысл, другая формулировка.',
  },
] as const

export function rewriteStyleById(id: string): RewriteStyle | null {
  return REWRITE_STYLES.find(s => s.id === id) ?? null
}

/** How much of the rejected draft is quoted back to the agent. */
const PREVIOUS_CHARS = 300

/**
 * The brief for the next attempt: what to change, and what not to repeat.
 *
 * The previous draft has to be quoted, because the agent cannot read it
 * anywhere else -- it was never sent, so it is not in the correspondence the
 * agent re-reads. Without it "короче" has nothing to be shorter than.
 */
export function rewriteNote(
  style: RewriteStyle,
  previous?: string | null
): string {
  const was = String(previous ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PREVIOUS_CHARS)
  const quoted = was
    ? 'Прошлый вариант был такой: «' + was + '». Не повторяй его дословно. '
    : ''
  return (
    'Владелец не принял черновик и просит написать ' + style.note + ' ' + quoted
  )
}

/**
 * FAIL SOFT, NOT LOUD.
 *
 * `crmCallback` throws on anything it cannot build, because its arguments come
 * from this repository. These arguments come from the render server: an id
 * longer than expected would, if this threw, take down the whole card --
 * including the "Отправить" button. Losing a rewrite button costs a tap;
 * losing the card costs the message.
 */
function fits(data: string): string | null {
  return Buffer.byteLength(data) <= 64 ? data : null
}

export function rewriteOpenCallback(id: string, secret: string): string | null {
  return fits(`${REWRITE_OPEN}${id}:${secret}`)
}

export function rewriteBackCallback(id: string, secret: string): string | null {
  return fits(`${REWRITE_BACK}${id}:${secret}`)
}

export function rewriteStyleCallback(
  styleId: string,
  id: string,
  secret: string
): string | null {
  if (!rewriteStyleById(styleId)) return null
  return fits(`${REWRITE_STYLE}${styleId}:${id}:${secret}`)
}

const btn = (text: string, data: string): InlineKeyboardButton =>
  Markup.button.callback(text, data)

/** The one button the card gains: a row, or nothing at all. */
export function rewriteRow(
  id: string,
  secret: string,
  isRu: boolean
): InlineKeyboardButton[][] {
  const data = rewriteOpenCallback(id, secret)
  if (!data) return []
  return [[btn(isRu ? '✍️ Переписать' : '✍️ Rewrite', data)]]
}

/**
 * What the card shows instead, once that button is pressed: the six styles,
 * two per row, and the way back. The send and cancel buttons stay above --
 * opening the list must not take away the answer the person already had.
 */
export function rewriteStyleRows(
  id: string,
  secret: string,
  isRu: boolean
): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = []
  let pair: InlineKeyboardButton[] = []
  for (const style of REWRITE_STYLES) {
    const data = rewriteStyleCallback(style.id, id, secret)
    if (!data) continue
    pair.push(btn(isRu ? style.label : style.labelEn, data))
    if (pair.length === 2) {
      rows.push(pair)
      pair = []
    }
  }
  if (pair.length) rows.push(pair)
  if (!rows.length) return []
  const back = rewriteBackCallback(id, secret)
  if (back) rows.push([btn(isRu ? '↩️ Назад' : '↩️ Back', back)])
  return rows
}
