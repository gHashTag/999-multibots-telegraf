/**
 * THE DOOR FROM THE BOT TO THE PERSON'S OWN BROWSER.
 *
 * Until this existed the browser was reachable only by opening the mini app
 * and finding a tab: the bot said nothing about it, and `grep` for it across
 * the bot's own source returned nothing at all. A feature nobody is told
 * about is a feature nobody has.
 *
 * ── WHAT IT PROMISES, AND WHAT IT MUST NOT ────────────────────────────────
 *
 * It promises a real browser with the person's own logins, that an agent can
 * drive while they watch. It must NOT promise, or invite, a password in this
 * chat: the whole design rests on the person typing it inside the stream,
 * where only video travels back. So the text says who signs in, before the
 * button rather than after it.
 *
 * ── WHY A web_app BUTTON AND NOT A LINK ───────────────────────────────────
 *
 * The viewer needs the mini app's own origin for its cookie (SameSite=Lax;
 * docs/architecture/remote-browser-per-user.md). A plain url button opens a
 * browser tab outside Telegram, where the person is not signed in to the app
 * at all. Telegram allows web_app buttons in private chats only, which is
 * why `app` is an argument and not an assumption.
 */
import { Markup } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'
import { buildMiniAppUrl } from '@/navigation/config/miniApp.config'
import { appLinkFor } from '@/navigation/helpers/appLinks'

/** The start_param the mini app maps to /browser (TelegramProvider.tsx). */
export const BROWSER_START_PARAM = 'browser'

export function browserInviteText(isRu: boolean): string {
  return isRu
    ? [
        '🌍 <b>Ваш браузер</b>',
        '',
        'Настоящий браузер на сервере — с вашими входами и вашими вкладками.',
        'Агент работает в нём, а вы смотрите и в любой момент берёте руль.',
        '',
        '🔒 В аккаунты вы входите <b>сами</b>, прямо в окне браузера.',
        'Пароль идёт туда напрямую — мимо нас и мимо агента.',
      ].join('\n') // cyrillic-ok: what the person reads
    : [
        '🌍 <b>Your browser</b>',
        '',
        'A real browser on our server — your logins, your tabs.',
        'An agent works in it while you watch, and you can take the wheel.',
        '',
        '🔒 You sign in <b>yourself</b>, inside the browser window.',
        'The password goes straight there — past us and past the agent.',
      ].join('\n')
}

/**
 * A web_app button in a private chat; elsewhere a url button to the t.me link
 * of this bot, and nothing at all when the bot's name is unknown.
 *
 * Never a url button to the app's own host: that would open the app outside
 * Telegram, where the person is not signed in, and they would meet a sign-in
 * wall instead of their browser. The t.me link opens the private chat, where
 * /start app_browser answers with the web_app button (helpers/appLinks.ts).
 */
export function browserInviteKeyboard(
  isRu: boolean,
  opts: { app: boolean; botUsername?: string | null }
): InlineKeyboardButton[][] {
  if (!opts.app) {
    const link = appLinkFor(opts.botUsername, BROWSER_START_PARAM)
    return link
      ? [
          [
            Markup.button.url(
              isRu ? '🌍 Открыть браузер' : '🌍 Open the browser', // cyrillic-ok
              link
            ),
          ],
        ]
      : []
  }
  return [
    [
      Markup.button.webApp(
        isRu ? '🌍 Открыть браузер' : '🌍 Open the browser', // cyrillic-ok
        buildMiniAppUrl(BROWSER_START_PARAM)
      ),
    ],
  ]
}

/** What to say where a web_app button is not allowed. */
export function browserElsewhereText(isRu: boolean): string {
  return isRu
    ? 'Браузер открывается в приложении, а приложение — только в личном чате с ботом.' // cyrillic-ok
    : 'The browser opens in the app, and the app opens in a private chat with the bot.'
}
