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
import { insideTelegram, rememberBotInfo } from './appLinks'

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
  /*
   * A SECOND PASS FOR THE MARKERS THE MODEL GOT WRONG (CRM audit 2026-09-12,
   * P2 #14). `[[Оплатить|act:Topup]]`, `[[Пополнить|act:topup2]]` and
   * `[[Подпись|tg_send]]` did not match the strict shape above and reached
   * the person as bracket soup, although the prompt promises they are
   * dropped in silence. Anything that still looks like a marker goes.
   */
  const cleaned = text
    .replace(marker, '')
    .replace(/\[\[[^\]\n]{1,60}\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  void isRu
  return { text: cleaned, buttons: chosen }
}

/**
 * What to attach to an agent answer: what it proposed, and the standard set
 * underneath, so there is always something to press.
 *
 * `bot` is the bot this conversation is with (Telegraf's `ctx.botInfo`). With
 * it, any raw app URL the model wrote becomes that bot's in-Telegram link
 * (helpers/appLinks.ts): outside Telegram the app has no signature and does
 * not open, so a raw app URL in an answer is a dead link.
 */
export function buttonsForAnswer(
  text: string,
  isRu: boolean,
  opts: {
    tail?: InlineKeyboardButton[][]
    app?: boolean
    bot?: { username?: string; has_main_web_app?: boolean } | null
  } = {}
) {
  const parsed = parseAgentButtons(text, isRu)
  const buttons = parsed.buttons
  rememberBotInfo(opts.bot)
  /* Never a raw app link, whether or not the caller named the bot. */
  const cleaned = insideTelegram(parsed.text, opts.bot?.username)
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
  const amount = invoiceAmount(text, m.index)
  return [
    Markup.button.url(amount ? `Оплатить ${amount} ⭐` : 'Оплатить ⭐', m[0]),
  ]
}

/*
 * A star amount as an answer writes it: the star sign, or the word.
 *
 * A price written with thousands apart counts as one number. The club is
 * "10 000" (spacedNumber in the render, toLocaleString('ru-RU') in the bot,
 * which puts a no-break space there; an English answer puts a comma), and
 * `(\d+)\s*⭐` read only the last group: the button under the club invoice
 * asked to pay 000 stars. A match starts at the first digit of a number,
 * never inside one: "2026 250" before the star is 250, not "026 250".
 *
 * The word counts as much as the sign: clubOfferLine() -- the sentence the
 * club_invoice tool tells the model to say -- writes the price in words, and
 * an amount the button cannot see is an amount it cannot check.
 */
const STAR_AMOUNT =
  /(?<!\d)(\d{1,3}(?:[ ,\u00a0\u202f]\d{3})+|\d+)\s*(?:⭐|зв[её]зд|stars?\b)/gi // cyrillic-ok: the Russian word for stars

/**
 * THE AMOUNT ON THE BUTTON IS THIS INVOICE'S, OR NONE.
 *
 * Asked for the price, the creator prompt tells the model to name both
 * paths: the packs ("10 tokens -> 15 stars, 50 -> 65, ...") and the club
 * (10 000 stars a month), with the club link after both. Reading the FIRST
 * amount put the club's link under "pay 15": a subscription understated
 * about 667 times on the very button that sells it.
 *
 * So the button names an amount only when the answer holds exactly ONE --
 * written any number of times, in any spelling. Two different amounts and
 * the text cannot say which one the link charges; the plain "pay" is honest,
 * and Telegram's own sheet shows the real price before anyone confirms. The
 * spelling shown is the one nearest before the link, where the model puts
 * the offer it is handing over.
 */
function invoiceAmount(text: string, linkAt: number): string | null {
  const found = [...text.matchAll(STAR_AMOUNT)].map(a => ({
    at: a.index ?? 0,
    written: a[1].replace(/[,\u00a0\u202f]/g, ' '),
    value: a[1].replace(/\D/g, ''),
  }))
  if (found.length === 0) return null
  if (new Set(found.map(f => f.value)).size > 1) return null
  const before = found.filter(f => f.at < linkAt)
  return (before.length > 0 ? before[before.length - 1] : found[0]).written
}

/**
 * A CHOICE THE CLIENT CAN TAP, WHOSE LABEL IS THE CHOICE.
 *
 * Owner, 2026-09-24: "offer her different looks right in the chat", and
 * "think through the most comfortable work right in the chat so the client
 * gets the full service".
 *
 * The `act:` vocabulary is CLOSED -- a fixed list of ids with a handler each
 * -- which is right for "top up" and "call a human" and useless for "which of
 * these three portraits do you want". So the assistant may number up to four
 * options and mark them; what it wrote is what the person taps.
 *
 * In a client's DM the bot answers as the owner, and there ONLY url buttons
 * work (business-dm-buttons: callback buttons are a plan, not a thing). So the
 * tap is a deep link into the bot -- `t.me/<bot>?start=look_<n>` -- which
 * opens INSIDE Telegram, the one shape the owner accepts, and lands the person
 * where the full service lives.
 *
 * The number, not the label, travels: a look description does not fit in a
 * 64-character start payload, and the offer is already written in the
 * conversation, which is the source of truth anyway. What look 2 WAS is read
 * from the history by the side that wrote it.
 */
export const LOOK_MARKER = /\[\[([^\]|]{1,40})\|look:([1-4])\]\]/g

/** The most options an offer may carry. Four fits a phone without scrolling. */
export const MAX_LOOKS = 4

export interface LookOption {
  n: number
  label: string
}

/**
 * The numbered options an answer offers, in the order the person reads them.
 *
 * A repeated number is dropped rather than shown twice: two buttons leading to
 * the same choice is a person picking one and getting the other.
 */
export function parseLookOffers(text: string): LookOption[] {
  const seen = new Set<number>()
  const out: LookOption[] = []
  for (const m of String(text ?? '').matchAll(LOOK_MARKER)) {
    const n = Number(m[2])
    const label = m[1].trim()
    if (!label || seen.has(n) || out.length >= MAX_LOOKS) continue
    seen.add(n)
    out.push({ n, label })
  }
  return out
}

/** The visible text without any button markers, wherever the answer goes. */
export function stripAgentMarkers(text: string): string {
  return (
    text
      .replace(/\[\[([^\]|]{1,40})\|act:([a-z_]{1,24})\]\]/g, '')
      /*
       * The look markers go the same way, and they must: the skill's own list of
       * complaints starts with "the person sees literal [[…|act:…]] text", and a
       * new marker form that only the keyboard builder knew about would put the
       * brackets straight into a client's chat.
       */
      .replace(LOOK_MARKER, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
