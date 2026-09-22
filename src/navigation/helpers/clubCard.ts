/**
 * THE CLUB CARD: THE ONE SUBSCRIPTION OFFER THE BOT MAKES.
 *
 * Every door that used to sell a subscription lands here: /club and /foundry,
 * `?start=club|foundry|subscribe_*`, the old "💫 Оформить подписку" buttons
 * wherever they still hang, the end of the free portrait, the greeting, and
 * the scene that once listed BASIC / PRO / STUDIO. One card, one price, one
 * cashier (the render's, see services/clubMembership.ts).
 *
 * WHY A CARD AND THEN AN INVOICE, NOT THE INVOICE STRAIGHT AWAY. The funnel
 * has to tell "saw the price" from "decided to pay" from "paid": the study of
 * 2026-09-22 could not say whether the two strangers who got an invoice and
 * vanished had ever seen what it was for. So the card is one event, the press
 * on "Join" mints the invoice and is another, the charge is a third, and an
 * invoice left unpaid is marked by the hourly sweep. Two taps to the Telegram
 * payment sheet, the same as a token top-up.
 *
 * Shown only because a person asked for it -- a command, a button, a link, or
 * a free portrait that ran out. Nothing here is sent unprompted.
 *
 * The handlers are registered BEFORE the scenes (see registerCommands): a
 * wizard step that swallows callbacks must not swallow the press that pays.
 */
import { Markup, type Telegraf } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'
import type { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { actionButton } from './actionButtons'
import { buildMiniAppUrl } from '../config/miniApp.config'
import {
  fetchClubStatus,
  requestClubInvoice,
  logClubFailure,
  type ClubCallOptions,
  type ClubGrant,
  type ClubStatus,
} from '@/services/clubMembership'
import { track } from '@/services/trackEvent'

/** Show the card. Registered at bot level; callback ids stay `[a-z_]` only. */
export const CLUB_CARD = 'club_card'
/** Mint the invoice. */
export const CLUB_JOIN = 'club_join'

/**
 * Callbacks of offers that no longer exist, still pressable on old messages
 * in people's chats: the three retired tiers of the old subscription scene and
 * the three Foundry tiers. A press lands on the club instead of on nothing.
 */
export const RETIRED_OFFER_CALLBACK =
  /^(basic|pro|studio|club_buy_(?:apprentice|master|founder))$/

const num = (n: number, isRu: boolean) =>
  n.toLocaleString(isRu ? 'ru-RU' : 'en-US')

const day = (iso: string | null, isRu: boolean): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleDateString(isRu ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function whyFree(g: ClubGrant, isRu: boolean): string {
  switch (g) {
    case 'owner':
      return isRu
        ? 'Клуб открыт вам без оплаты — как владельцу бота.'
        : 'The club is open to you free of charge, as a bot owner.'
    case 'keeper':
      return isRu
        ? 'Клуб открыт вам без оплаты — как хранителю.'
        : 'The club is open to you free of charge, as a keeper.'
    case 'guest':
      return isRu
        ? 'Вы в клубе по приглашению.'
        : 'You are in the club by invitation.'
    default:
      return ''
  }
}

/** The card for somebody who is already in: no price, nothing to buy. */
export function clubMemberText(
  isRu: boolean,
  m: {
    granted: ClubGrant
    until: string | null
    daysLeft: number
    tokensPerPeriod?: number
    periodDays?: number
  }
): string {
  const until = day(m.until, isRu)
  const lines = [
    isRu ? '⭐ <b>Вы в клубе</b>' : '⭐ <b>You are in the club</b>',
    '',
  ]
  if (until) {
    lines.push(
      isRu
        ? `До ${until} (осталось дней: ${m.daysLeft}).`
        : `Until ${until} (${m.daysLeft} days left).`
    )
  }
  const why = whyFree(m.granted, isRu)
  if (why) lines.push(why)
  // A guest is let in, not paid: no monthly tokens (club-guests.ts).
  if (m.granted !== 'guest' && m.tokensPerPeriod && m.periodDays) {
    lines.push(
      isRu
        ? `Каждые ${m.periodDays} дней на баланс приходят ${num(m.tokensPerPeriod, isRu)} токенов.`
        : `Every ${m.periodDays} days ${num(m.tokensPerPeriod, isRu)} tokens arrive on your balance.`
    )
  }
  lines.push(
    '',
    isRu
      ? 'Двойник настраивается в приложении — кнопка ниже.'
      : 'Your twin is set up in the app — button below.'
  )
  return lines.join('\n')
}

/** The offer. Every number on it came from the cashier a moment ago. */
export function clubCardText(isRu: boolean, s: ClubStatus): string {
  if (s.active) return clubMemberText(isRu, s)
  return isRu
    ? [
        '⭐ <b>Клуб — ваш цифровой двойник</b>',
        '',
        'Двойник отвечает в личке и в группах вашим голосом, делает рилсы в вашем стиле и ведёт контент-план.',
        '',
        `• <b>${num(s.stars, isRu)} ⭐ за ${s.periodDays} дней</b> — подписка Telegram Stars`,
        `• <b>${num(s.tokensPerPeriod, isRu)} токенов</b> возвращаются на баланс с каждого платежа`,
        `• продление само каждые ${s.periodDays} дней, отмена — в настройках Telegram`,
        '',
        'Всё остальное — токены: их можно докупить в «Пополнить баланс».',
      ].join('\n')
    : [
        '⭐ <b>The club — your digital twin</b>',
        '',
        'Your twin answers in DMs and groups in your voice, makes reels in your style and keeps your content plan.',
        '',
        `• <b>${num(s.stars, isRu)} ⭐ for ${s.periodDays} days</b> — a Telegram Stars subscription`,
        `• <b>${num(s.tokensPerPeriod, isRu)} tokens</b> back on your balance from every payment`,
        `• renews by itself every ${s.periodDays} days, cancel in Telegram settings`,
        '',
        'Everything else runs on tokens — top them up under "Top up".',
      ].join('\n')
}

function appRow(isRu: boolean): InlineKeyboardButton[] {
  return [
    Markup.button.webApp(
      isRu ? '🎬 Открыть приложение' : '🎬 Open the app',
      buildMiniAppUrl('club')
    ),
  ]
}

/**
 * The button that leads to the card, for any keyboard that wants one. `join`
 * keeps the label the greeting always had, so a door people learned does not
 * change its name; it opens the card (price first), never an invoice.
 */
export function clubButton(
  isRu: boolean,
  opts: { join?: boolean } = {}
): InlineKeyboardButton {
  const label = opts.join
    ? isRu
      ? '⭐ Вступить в клуб'
      : '⭐ Join the club'
    : isRu
      ? '⭐ Клуб'
      : '⭐ Club'
  return Markup.button.callback(label, CLUB_CARD)
}

export function clubCardKeyboard(
  isRu: boolean,
  s: ClubStatus,
  opts: { app: boolean }
) {
  const rows: InlineKeyboardButton[][] = []
  if (!s.active) {
    rows.push([
      Markup.button.callback(
        isRu
          ? `⭐ Вступить за ${num(s.stars, isRu)} ⭐`
          : `⭐ Join for ${num(s.stars, isRu)} ⭐`,
        CLUB_JOIN
      ),
    ])
  }
  // web_app buttons are legal in private chats only.
  if (opts.app) rows.push(appRow(isRu))
  rows.push([actionButton('topup', isRu)])
  rows.push([actionButton('balance', isRu), actionButton('human', isRu)])
  return Markup.inlineKeyboard(rows)
}

/** When the cashier cannot answer: say so, and offer the retry and a person. */
export function clubUnavailableText(isRu: boolean): string {
  return isRu
    ? '⭐ Касса клуба сейчас не ответила. Попробуйте ещё раз через минуту — или позовите человека.'
    : '⭐ The club cashier did not answer just now. Try again in a minute — or talk to a person.'
}

function retryKeyboard(isRu: boolean, retry: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isRu ? '🔄 Попробовать снова' : '🔄 Try again',
        retry
      ),
    ],
    [actionButton('human', isRu)],
  ])
}

/** Where the card was asked for, for the funnel. A closed list, like the steps. */
export type ClubCardSource =
  | 'command'
  | 'deeplink'
  | 'greeting'
  | 'price'
  | 'portrait_limit'
  | 'retired_offer'
  | 'button'

/** Show the card to whoever is asking. Never throws to the caller. */
export async function showClubCard(
  ctx: MyContext,
  source: ClubCardSource,
  opts: ClubCallOptions = {}
): Promise<void> {
  const isRu = isRussianFromState(ctx)
  const who = String(ctx.from?.id ?? '')
  const app = ctx.chat?.type === 'private'
  let status: ClubStatus
  try {
    status = await fetchClubStatus(who, opts)
  } catch (e) {
    logClubFailure('status', who, e)
    await ctx.reply(clubUnavailableText(isRu), retryKeyboard(isRu, CLUB_CARD))
    return
  }
  void track(ctx as any, 'club_card_shown', {
    source,
    member: status.active,
  })
  await ctx.reply(clubCardText(isRu, status), {
    parse_mode: 'HTML',
    ...clubCardKeyboard(isRu, status, { app }),
  })
}

/** The press on "Join": the invoice from the render's cashier, as a pay button. */
export async function joinClub(
  ctx: MyContext,
  opts: ClubCallOptions = {}
): Promise<void> {
  const isRu = isRussianFromState(ctx)
  const who = String(ctx.from?.id ?? '')
  const app = ctx.chat?.type === 'private'
  let invoice
  try {
    invoice = await requestClubInvoice(who, opts)
  } catch (e) {
    logClubFailure('invoice', who, e)
    await ctx.reply(clubUnavailableText(isRu), retryKeyboard(isRu, CLUB_JOIN))
    return
  }
  if (invoice.kind === 'member') {
    await ctx.reply(clubMemberText(isRu, invoice), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        ...(app ? [appRow(isRu)] : []),
        [actionButton('balance', isRu), actionButton('human', isRu)],
      ]),
    })
    return
  }
  void track(ctx as any, 'club_invoice_created', { stars: invoice.stars })
  const stars = num(invoice.stars, isRu)
  await ctx.reply(
    isRu
      ? `Счёт готов: ${stars} ⭐ за ${invoice.periodDays} дней.\n\n` +
          'Нажмите «Оплатить» — откроется окно Telegram. Клуб откроется сам, как только оплата пройдёт, ' +
          `и ${num(invoice.tokens, isRu)} токенов придут на баланс.`
      : `Your invoice is ready: ${stars} ⭐ for ${invoice.periodDays} days.\n\n` +
          'Press "Pay" and Telegram opens the payment window. The club opens by itself once it goes through, ' +
          `and ${num(invoice.tokens, isRu)} tokens arrive on your balance.`,
    Markup.inlineKeyboard([
      [
        Markup.button.url(
          isRu ? `💳 Оплатить ${stars} ⭐` : `💳 Pay ${stars} ⭐`,
          invoice.link
        ),
      ],
      [actionButton('human', isRu)],
    ])
  )
}

/**
 * The club's buttons, at bot level and before the scenes. `answerCbQuery`
 * first, always: the invoice call can take seconds and Telegram gives ten.
 */
export function registerClubButtons(bot: Telegraf<MyContext>): void {
  bot.action(CLUB_CARD, async ctx => {
    await ctx.answerCbQuery().catch(() => {})
    await showClubCard(ctx, 'button')
  })
  bot.action(CLUB_JOIN, async ctx => {
    await ctx.answerCbQuery().catch(() => {})
    await joinClub(ctx)
  })
  bot.action(RETIRED_OFFER_CALLBACK, async ctx => {
    await ctx.answerCbQuery().catch(() => {})
    await showClubCard(ctx, 'retired_offer')
  })
}
