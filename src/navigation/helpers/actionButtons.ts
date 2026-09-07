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
  { id: 'balance', ru: '💰 Мой баланс', en: '💰 My balance' },
  { id: 'can', ru: '✨ Что ты умеешь', en: '✨ What can you do' },
]

export const isKnownAction = (id: string): boolean =>
  ACTIONS.some(a => a.id === id)

const label = (a: Action, isRu: boolean) => (isRu ? a.ru : a.en)

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
export function buttonsForAnswer(text: string, isRu: boolean) {
  const { text: cleaned, buttons } = parseAgentButtons(text, isRu)
  const standard = standardButtons(isRu).reply_markup.inline_keyboard
  return {
    text: cleaned,
    markup: Markup.inlineKeyboard([...buttons, ...standard]),
  }
}
