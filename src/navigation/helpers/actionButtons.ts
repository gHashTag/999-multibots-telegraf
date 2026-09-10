/**
 * BUTTONS UNDER EVERY ANSWER, SO A PERSON NEVER HAS TO TYPE.
 *
 * Owner: "the bot must proactively offer to pay, right after /start, so it is
 * clear what to do", and "always send buttons with the answers so the user can
 * react without writing text".
 *
 * Two rules shape everything here.
 *
 * 1. INLINE, NEVER A REPLY KEYBOARD. The reply keyboard was removed on
 *    purpose: a Mini App launched from a reply button receives neither the
 *    signature nor the user, so it looked like the main door and led to a
 *    "Log in" wall inside Telegram. An INLINE web_app button carries the
 *    signed launch, so the door works again.
 *
 * 2. A BUTTON NOBODY HANDLES IS ANOTHER LIE. This module renders only actions
 *    that are registered here AND wired to a handler. That matters most for
 *    the agent: a model asked to "offer buttons" will happily invent
 *    `act:make_me_a_movie`, the press would reach nothing, and the person
 *    would tap a dead control -- the same broken promise as offering a service
 *    with no provider key, one interaction later.
 */
import { Markup } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'
import { MINI_APP_URL } from '../config/miniApp.config'

/** Prefix for every callback this module owns, so presses route unambiguously. */
export const ACTION_PREFIX = 'act:'

export interface Action {
  id: string
  ru: string
  en: string
}

/**
 * The actions a button may carry.
 *
 * Kept small on purpose. Every entry needs a handler, and a menu of twelve
 * choices is how the eight-category keyboard became a branch to navigate
 * rather than a thing to do.
 */
export const ACTIONS: Action[] = [
  { id: 'topup', ru: '⭐ Пополнить баланс', en: '⭐ Top up' },
  /*
   * The other two doors to the same balance. Owner, 2026-09-09: "add payment
   * in rubles, by choice, or in crypto -- find every payment type and wire
   * it". Stars, rubles (Robokassa) and crypto (TON USDT, TON, USDC on Base
   * when settlement can be credited) all existed as scenes; only Stars was
   * reachable from a button. `topup` now opens the chooser with all of them,
   * and these two jump straight to one method for the person who already knows.
   */
  { id: 'pay_rub', ru: '💳 Рублями', en: '💳 In rubles' },
  { id: 'pay_crypto', ru: '💎 Криптой', en: '💎 In crypto' },
  { id: 'balance', ru: '💰 Мой баланс', en: '💰 My balance' },
  { id: 'can', ru: '✨ Что ты умеешь', en: '✨ What can you do' },
  // A person, always reachable: the one button that matters when the model
  // is wrong, down, or simply not what somebody needs.
  { id: 'human', ru: '🙋 Позвать человека', en: '🙋 Talk to a person' },
]

/**
 * The top-up label, so a keyboard built elsewhere cannot drift from the one the
 * menu shows. Callers pair it with `${ACTION_PREFIX}topup`.
 */
export const topupButtonLabel = (isRu: boolean): string => {
  const a = ACTIONS.find(x => x.id === 'topup')
  if (!a) throw new Error('the topup action is missing from ACTIONS')
  return isRu ? a.ru : a.en
}

export const isKnownAction = (id: string): boolean =>
  ACTIONS.some(a => a.id === id)

const label = (a: Action, isRu: boolean) => (isRu ? a.ru : a.en)

/** One registered action as an inline button; throws on an id nobody handles. */
export function actionButton(id: string, isRu: boolean): InlineKeyboardButton {
  const a = ACTIONS.find(x => x.id === id)
  if (!a) throw new Error(`unknown action button: ${id}`)
  return Markup.button.callback(label(a, isRu), `${ACTION_PREFIX}${id}`)
}

/** The app button: inline web_app, which is the launch that carries a signature. */
function appButton(isRu: boolean): InlineKeyboardButton {
  return Markup.button.webApp(
    isRu ? '🎬 Открыть приложение' : '🎬 Open the app',
    MINI_APP_URL
  )
}

/**
 * The standard set: pay first, because that is the thing the owner wants
 * offered without being asked, and it is the step a paying person is looking
 * for.
 */
export function standardButtons(isRu: boolean, opts?: { app?: boolean }) {
  const byId = (id: string) => ACTIONS.find(a => a.id === id)!
  const rows: InlineKeyboardButton[][] = [
    [
      Markup.button.callback(
        label(byId('topup'), isRu),
        `${ACTION_PREFIX}topup`
      ),
    ],
    [
      Markup.button.callback(
        label(byId('balance'), isRu),
        `${ACTION_PREFIX}balance`
      ),
      Markup.button.callback(label(byId('can'), isRu), `${ACTION_PREFIX}can`),
    ],
    [
      Markup.button.callback(
        label(byId('human'), isRu),
        `${ACTION_PREFIX}human`
      ),
    ],
  ]
  // The app button only in private chats, and only when asked for: Telegram
  // rejects web_app buttons elsewhere.
  if (opts?.app !== false) rows.push([appButton(isRu)])
  return Markup.inlineKeyboard(rows)
}

/**
 * Buttons the agent proposed, taken out of its text.
 *
 * The agent ends a reply with markers of the form `[[Label|act:id]]`. Anything
 * whose id is not registered is DROPPED rather than rendered: a dead button is
 * worse than no button, and the model has no way of knowing what is wired up.
 *
 * The markers are always stripped from the visible text, including the dropped
 * ones -- otherwise a rejected button would appear to the person as literal
 * bracket soup at the end of the answer.
 */
export function parseAgentButtons(
  text: string,
  isRu: boolean
): { text: string; buttons: InlineKeyboardButton[][] } {
  const marker = /\[\[([^\]|]{1,40})\|act:([a-z_]{1,24})\]\]/g
  const chosen: InlineKeyboardButton[][] = []
  let m: RegExpExecArray | null
  while ((m = marker.exec(text)) !== null) {
    const [, proposed, id] = m
    if (!isKnownAction(id)) continue
    if (chosen.length >= 4) continue
    chosen.push([
      Markup.button.callback(proposed.trim(), `${ACTION_PREFIX}${id}`),
    ])
  }
  const cleaned = text
    .replace(marker, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  void isRu
  return { text: cleaned, buttons: chosen }
}

/**
 * What to attach to an agent answer: what it proposed, and the standard set
 * underneath, so there is always something to press.
 */
export function buttonsForAnswer(
  text: string,
  isRu: boolean,
  opts: { tail?: InlineKeyboardButton[][]; app?: boolean } = {}
) {
  const { text: cleaned, buttons } = parseAgentButtons(text, isRu)
  const standard = standardButtons(isRu, { app: opts.app }).reply_markup
    .inline_keyboard
  const pay = payRow(cleaned)
  return {
    text: cleaned,
    // A pay row first when the answer carries an invoice link; then what the
    // agent proposed; the standard set; the owner's hub row last, so the
    // seller is one tap away from any answer.
    markup: Markup.inlineKeyboard([
      ...(pay ? [pay] : []),
      ...buttons,
      ...standard,
      ...(opts.tail ?? []),
    ]),
  }
}

/**
 * A Stars invoice link in an answer becomes the first row: one tap to pay.
 * Only when the answer already carries the link -- the agent writes one only
 * after the person asked to pay, so the button never offers payment first.
 */
export function payRow(text: string): InlineKeyboardButton[] | null {
  const m = /https:\/\/t\.me\/\$[A-Za-z0-9_-]+/.exec(text)
  if (!m) return null
  const stars = /(\d+)\s*⭐/.exec(text)
  return [
    Markup.button.url(stars ? `Оплатить ${stars[1]} ⭐` : 'Оплатить ⭐', m[0]),
  ]
}

/** The visible text without any button markers, wherever the answer goes. */
export function stripAgentMarkers(text: string): string {
  return text
    .replace(/\[\[([^\]|]{1,40})\|act:([a-z_]{1,24})\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
