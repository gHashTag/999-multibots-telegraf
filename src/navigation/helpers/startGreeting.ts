/**
 * THE /start GREETING: WHAT THIS IS, AND A DOOR FOR EVERY THING AND EVERY ONE.
 *
 * Owner, 2026-09-09: "improve the greeting on /start, and more buttons about
 * the project, so a person picks right away WHAT and WHOM". Before this the
 * existing-user branch of /start showed the bare main menu -- "two doors" and
 * four buttons -- and said nothing about the project a person had just walked
 * into.
 *
 * WHAT: the hive (the project map, the same one as t27.ai), the club, the
 * profile, the balance. WHOM: the agent, or a person (see SUPPORT_HANDLE).
 * HOW TO PAY: Stars, rubles, crypto -- every method that has a scene, so the
 * choice is made by the person and not by the only button that existed.
 *
 * Two messages, not one: the greeting carries `remove_keyboard` (a stale
 * wizard keyboard must be cleared, and 87 places still send one), and
 * Telegram allows one reply_markup per message, so the buttons ride on the
 * second. Same shape as showMainMenu, for the same reason.
 *
 * Every callback here is a registered action (actionButtons.ts), so a press
 * always lands somewhere; every web_app link is a start_param the mini app
 * maps to a route (TelegramProvider.tsx, guarded by startParamContract.test).
 */
import { Markup } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'
import type { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { buildMiniAppUrl } from '@/navigation/config/miniApp.config'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { actionButton } from '@/navigation/helpers/actionButtons'
import { track } from '@/services/trackEvent'
import { logger } from '@/utils/logger'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The greeting text, HTML parse mode. `name` is the person's first name, if any. */
export function startGreetingText(isRu: boolean, name?: string): string {
  const who = name ? `, ${escapeHtml(name)}` : ''
  if (isRu) {
    return [
      `👋 Привет${who}!`,
      '',
      'Это бот проекта <b>t27 — Trinity</b>: открытая карта разработки, в которой видно, что делается, что проверено и чем это измерено. Я — агент проекта: отвечаю на вопросы и делаю картинки, видео и голос за токены с баланса.',
      '',
      'Что здесь есть:',
      '🐝 <b>Улей</b> — живая карта проекта, та же, что на t27.ai',
      '🤖 <b>Агент</b> — спросить о проекте или попросить сделать',
      '⭐ <b>Клуб</b> — вход по подписке в Stars, часть оплаты возвращается токенами на баланс',
      '👤 <b>Профиль</b> — баланс, история, настройки',
      '',
      'Оплата — как удобно: звёздами Telegram, рублями или криптой.',
    ].join('\n')
  }
  return [
    `👋 Hi${who}!`,
    '',
    'This is the bot of <b>t27 — Trinity</b>: an open development map where you can see what is being done, what is verified, and how it was measured. I am the project agent: I answer questions and make pictures, video and voice for tokens from your balance.',
    '',
    'What is here:',
    '🐝 <b>Hive</b> — the live project map, the same one as on t27.ai',
    '🤖 <b>Agent</b> — ask about the project or ask for something to be made',
    '⭐ <b>Club</b> — entry by a Stars subscription, part of it comes back as tokens on the balance',
    '👤 <b>Profile</b> — balance, history, settings',
    '',
    'Pay the way that suits you: Telegram Stars, rubles or crypto.',
  ].join('\n')
}

/** The prompt above the buttons. */
export function startGreetingPrompt(isRu: boolean): string {
  return isRu
    ? 'С чего начнём? Выберите, что открыть — или кого спросить:'
    : 'Where do we start? Pick what to open — or whom to ask:'
}

export interface StartGreetingOptions {
  /** web_app buttons are legal in private chats only. */
  app: boolean
  /** Whether this bot sells in rubles (shouldShowRubles). */
  rubles: boolean
}

/**
 * The keyboard. Rows read top to bottom as WHAT, WHOM, HOW TO PAY, and the
 * two service buttons. Order inside a row is by how often people need it.
 */
export function startGreetingKeyboard(
  isRu: boolean,
  opts: StartGreetingOptions
) {
  const rows: InlineKeyboardButton[][] = []

  if (opts.app) {
    rows.push([
      Markup.button.webApp(
        isRu ? '🐝 Улей — карта проекта' : '🐝 Hive — the project map',
        buildMiniAppUrl('hive')
      ),
    ])
    rows.push([
      Markup.button.webApp(
        isRu ? '🤖 Спросить агента' : '🤖 Ask the agent',
        buildMiniAppUrl('chat')
      ),
      actionButton('human', isRu),
    ])
    rows.push([
      Markup.button.webApp(
        isRu ? '⭐ Вступить в клуб' : '⭐ Join the club',
        buildMiniAppUrl('club')
      ),
      Markup.button.webApp(
        isRu ? '👤 Профиль' : '👤 Profile',
        buildMiniAppUrl('profile')
      ),
    ])
    /*
     * SIGNING IN ON ANOTHER DEVICE HAD NO HANDLE ON THE ONE SCREEN EVERYONE SEES.
     *
     * The door exists: /app is a registered command with its own line in the
     * Telegram menu, and it opens the mini app at the screen that shows a
     * pairing code. But this greeting is what a person actually looks at, and
     * it offered the hive, the agent, the club, the profile and three ways to
     * pay -- never the way in from a laptop or the native app.
     *
     * Measured 2026-09-18, journal: 44 sign-ins inside Telegram and NOT ONE
     * code minted in 4.2 days. Nobody was refused either, so nobody reached the
     * screen -- which is what a door with no handle looks like from the inside.
     *
     * It goes straight to `pair` rather than to /app: the command's own message
     * exists to explain the button to somebody who typed the command, and a
     * person pressing here has already been told where they are going.
     */
    rows.push([
      Markup.button.webApp(
        isRu ? '🔑 Вход на другом устройстве' : '🔑 Sign in on another device',
        buildMiniAppUrl('pair')
      ),
    ])
  } else {
    // Outside a private chat there is no signed launch, so only the person
    // remains reachable from this row.
    rows.push([actionButton('human', isRu)])
  }

  rows.push([actionButton('topup', isRu)])
  const pay = [actionButton('pay_crypto', isRu)]
  if (opts.rubles) pay.unshift(actionButton('pay_rub', isRu))
  rows.push(pay)
  rows.push([actionButton('balance', isRu), actionButton('can', isRu)])

  return Markup.inlineKeyboard(rows)
}

/** Send the greeting and the buttons. Used by /start for an existing person. */
export async function showStartGreeting(ctx: MyContext): Promise<void> {
  const isRu = isRussianFromState(ctx)
  // /start is where the funnel used to count the main menu; keep that count
  // continuous, since this screen replaces it on exactly that path.
  void track(ctx as any, 'menu_shown')

  await ctx.reply(startGreetingText(isRu, ctx.from?.first_name), {
    parse_mode: 'HTML',
    ...Markup.removeKeyboard(),
  })

  try {
    await ctx.reply(
      startGreetingPrompt(isRu),
      startGreetingKeyboard(isRu, {
        app: ctx.chat?.type === 'private',
        rubles: shouldShowRubles(ctx),
      })
    )
  } catch (error) {
    // A greeting that displayed is not undone by buttons that did not.
    logger.warn('[startGreeting] buttons were not sent', {
      telegramId: ctx.from?.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
