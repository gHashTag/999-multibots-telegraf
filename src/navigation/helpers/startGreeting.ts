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

/**
 * The greeting text, HTML parse mode. `name` is the person's first name, if any.
 *
 * ── WHAT THIS SCREEN IS FOR (owner, 2026-09-20) ────────────────────────────
 *
 * It says what the product IS: an AGI game built by digital twins of real
 * people and their avatars. The previous text described the repository -- an
 * open development map -- which is true and is not a reason for a stranger to
 * stay. A person arrives knowing nothing; the first screen has to answer "what
 * is this and what is in it for me", and only then list the doors.
 *
 * The twin is the offer, and it is concrete: the person's own face and voice
 * become a character that acts. That is worth saying in one line, because it
 * is the one thing here nobody else is doing.
 *
 * ── THE PAYMENT LINE IS PER PERSON ─────────────────────────────────────────
 *
 * It used to promise "Stars, roubles or crypto" to everybody, including people
 * who can use none of the last two: Robokassa is a Russian page wanting a
 * Russian card. Promising a door that opens onto a wall costs more than saying
 * nothing, so the line now follows the same rule as the buttons
 * (`shouldShowRubles`) and names only what this person can actually use.
 */
export function startGreetingText(
  isRu: boolean,
  name?: string,
  options: { rubles?: boolean } = {}
): string {
  const who = name ? `, ${escapeHtml(name)}` : ''
  const rubles = options.rubles ?? false
  if (isRu) {
    return [
      `👋 Привет${who}!`,
      '',
      'Это <b>AGI-игра</b>, которую строят <b>цифровые двойники реальных людей</b> и их аватары. Двойник — это вы: ваше лицо, ваш голос, ваша манера говорить. Он делает картинки, видео и речь, отвечает за вас и остаётся вами, когда вас нет рядом.',
      '',
      'Игра идёт открыто: на t27.ai видно, что делается, что проверено и чем измерено. Ход — это сделанное дело, а не обещание.',
      '',
      'Что здесь есть:',
      '🐝 <b>Улей</b> — живая карта игры, та же, что на t27.ai',
      '🤖 <b>Агент</b> — ваш двойник: спросить или попросить сделать',
      '⭐ <b>Клуб</b> — вход по подписке в Stars, часть оплаты возвращается токенами на баланс',
      '👤 <b>Профиль</b> — баланс, история, настройки',
      '',
      rubles
        ? 'Оплата — как удобно: звёздами Telegram, рублями или криптой.'
        : 'Оплата — звёздами Telegram или криптой.',
    ].join('\n')
  }
  return [
    `👋 Hi${who}!`,
    '',
    'This is an <b>AGI game</b> built by <b>digital twins of real people</b> and their avatars. The twin is you: your face, your voice, the way you put things. It makes pictures, video and speech, answers for you, and stays you when you are not around.',
    '',
    'The game is played in the open: on t27.ai you can see what is being done, what is verified and how it was measured. A move is a thing done, not a thing promised.',
    '',
    'What is here:',
    '🐝 <b>Hive</b> — the live map of the game, the same one as on t27.ai',
    '🤖 <b>Agent</b> — your twin: ask it, or ask it to make something',
    '⭐ <b>Club</b> — entry by a Stars subscription, part of it comes back as tokens on the balance',
    '👤 <b>Profile</b> — balance, history, settings',
    '',
    rubles
      ? 'Pay the way that suits you: Telegram Stars, roubles or crypto.'
      : 'Pay with Telegram Stars or crypto.',
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

  /*
   * One answer for the text and the buttons. Asking `shouldShowRubles` twice
   * would let the sentence and the row disagree -- and the sentence is the
   * promise a person remembers.
   */
  const rubles = shouldShowRubles(ctx)

  await ctx.reply(startGreetingText(isRu, ctx.from?.first_name, { rubles }), {
    parse_mode: 'HTML',
    ...Markup.removeKeyboard(),
  })

  try {
    await ctx.reply(
      startGreetingPrompt(isRu),
      startGreetingKeyboard(isRu, {
        app: ctx.chat?.type === 'private',
        rubles,
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
