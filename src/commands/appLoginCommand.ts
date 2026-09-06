import { Composer, Markup } from 'telegraf'
import type { MyContext } from '../interfaces'
import { isRussianFromState } from '../helpers/centralizedLanguage'
import {
  buildMiniAppUrl,
  canShowMiniAppButton,
} from '../navigation/config/miniApp.config'

/**
 * /app — the button the iOS app's sign-in screen has been telling people to press.
 *
 * WHAT WAS BROKEN. `/api/auth/pair/start` and `/api/auth/pair/claim` were both
 * written, tested and deployed; the app's code screen works. But nothing
 * anywhere ever called `start`, so no code could be minted. The app said "open
 * the bot and press Sign in" and no such button existed. An instruction that
 * leads nowhere is worse than a missing feature: it makes the user believe they
 * are the one doing it wrong.
 *
 * WHY THIS OPENS THE MINI APP INSTEAD OF CALLING THE ROUTE.
 *
 * `pair/start` mints a code only for a caller carrying a Telegram signature —
 * `initData`, which exists inside a Mini App and nowhere else. A bot handler has
 * the sender's id from the update, but an id is not a signature.
 *
 * The tempting shortcut is an internal minting path the bot reaches with its API
 * key. That would be a SECOND way to prove who you are, for one route, and the
 * codebase already carries a scar from exactly that: `pair/start` originally
 * read `init_data` from the body while the whole mini-app sent it as a header,
 * so the route worked only for whoever remembered its private exception.
 *
 * Opening the Mini App keeps one identity path. The signature is produced where
 * Telegram produces it, the existing route verifies it the way it verifies
 * everything else, and no new trust is invented for the sake of one button.
 */
export const appLoginCommand = new Composer<MyContext>()

/** Where the mini-app should land: the screen that shows the pairing code. */
const СТАРТОВЫЙ_ПАРАМЕТР = 'pair'

appLoginCommand.command('app', async ctx => {
  const isRu = await isRussianFromState(ctx)

  /**
   * Telegram rejects web_app buttons outside private chats, and a rejected
   * button is not a silent no-op: the whole message fails to send, so the user
   * gets nothing at all. Saying why is the difference between "the bot is
   * broken" and "write to me directly".
   */
  if (!canShowMiniAppButton(ctx.chat?.type)) {
    await ctx.reply(
      isRu
        ? 'Вход открывается только в личной переписке со мной — напишите мне напрямую.'
        : 'Sign-in only opens in a direct chat with me — message me directly.'
    )
    return
  }

  await ctx.reply(
    isRu
      ? // Длина кода намеренно НЕ названа числом: она задана на сервере
        // (PAIRING.DIGITS) и уже менялась. Текст, повторяющий число
        // руками, разошёлся бы с настоящим кодом молча.
        'Нажмите кнопку — откроется окно с кодом. Введите его в приложении на вкладке «Профиль».\n\nКод живёт несколько минут и работает один раз.'
      : // Длина НЕ названа и здесь: русский текст выше её не называет по
        // той же причине, а английский называл — и разошёлся, как только
        // сервер поднял длину с шести цифр до восьми.
        'Press the button — a window opens with your code. Enter it in the app under “Profile”.\n\nThe code lasts a few minutes and works once.',
    Markup.inlineKeyboard([
      [
        Markup.button.webApp(
          isRu ? '🔑 Войти в приложение' : '🔑 Sign in to the app',
          buildMiniAppUrl(СТАРТОВЫЙ_ПАРАМЕТР)
        ),
      ],
    ])
  )
})

export default appLoginCommand
