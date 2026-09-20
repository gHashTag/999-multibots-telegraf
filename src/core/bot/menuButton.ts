/**
 * THE BLUE BUTTON NEXT TO THE INPUT FIELD, ON EVERY BOT OF THE FARM.
 *
 * Measured 2026-09-20, asking Telegram itself (`getChatMenuButton`) for all
 * eleven bots: exactly ONE -- @t27ai_bot -- had a `web_app` button that opens
 * the mini app. The other ten answered `commands`, the default list. So for
 * every partner bot the most prominent control in the chat opened a list of
 * slash commands instead of the product, and the owner's report ("the main
 * button does not work in partner bots") was exactly right.
 *
 * Nothing in this repository had ever set it: the button is per-bot state held
 * by Telegram, normally typed into BotFather by hand, and ten bots had simply
 * never been typed into.
 *
 * ── WHY AT STARTUP AND NOT ONCE BY HAND ────────────────────────────────────
 *
 * A one-off call fixes today and says nothing about the next bot somebody
 * adds. Setting it on every launch makes the button a property of the code:
 * a new bot arrives with it, and a hand-edit in BotFather that breaks it is
 * undone by the next deploy.
 *
 * ── WHY ONE URL FOR EVERY BOT ──────────────────────────────────────────────
 *
 * There is one mini app, and it identifies the person from the launch's
 * initData. The render verifies that signature against EVERY farm token --
 * auth.ts botTokens() walks the whole numbered list -- so a partner
 * bot's launch authenticates exactly like the main one. That was checked
 * before this was written: the tokens are there, which is why the fix is the
 * button and not the signature.
 *
 * ── IT NEVER FAILS A LAUNCH ────────────────────────────────────────────────
 *
 * A bot that could not have its button set is still a bot that works. The
 * failure is logged with the bot's name and swallowed: a menu button is worth
 * a warning, never a dead bot.
 */
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { MINI_APP_URL } from '@/navigation/config/miniApp.config'
import { logger } from '@/utils/logger'

/** What the button says. Short: Telegram truncates it next to the field. */
/**
 * WHAT THE BLUE BUTTON SAYS, AND IN WHICH LANGUAGE.
 *
 * Owner, 2026-09-20: "the main button is written in Russian -- what about the
 * other languages? our audience will mostly be English-speaking."
 *
 * Telegram's menu button has ONE text per bot, not one per language: the bot
 * sets it, every person sees the same word. So the DEFAULT is English, which
 * is the language of most people who will meet these bots and also what the
 * app itself falls back to (`getInitialLanguage` returns 'en' unless the
 * browser asks for Russian).
 *
 * A Russian speaker is not left with the English word, because the API also
 * takes a `chat_id`: the button can be set for ONE person's chat, overriding
 * the default for them alone. That is `pointThisChatsButtonAtTheApp`, called
 * when we know who they are -- which is the only moment their language is
 * known at all.
 */
export const MENU_BUTTON_TEXT = 'Open app'
export const MENU_BUTTON_TEXT_RU = 'Приложение' // cyrillic-ok: UI text

/**
 * Point this bot's menu button at the mini app.
 *
 * Returns what happened, so a caller can log it without guessing -- and so a
 * test can assert the refusal path without reading logs.
 */
export async function pointMenuButtonAtTheApp(
  bot: Telegraf<MyContext>,
  botName: string
): Promise<'set' | 'failed'> {
  try {
    await bot.telegram.setChatMenuButton({
      menuButton: {
        type: 'web_app',
        text: MENU_BUTTON_TEXT,
        web_app: { url: MINI_APP_URL },
      },
    })
    return 'set'
  } catch (error) {
    logger.warn('[menu-button] could not be set', {
      bot: botName,
      error: error instanceof Error ? error.message : String(error),
    })
    return 'failed'
  }
}

/**
 * The button for ONE person's chat, in their language.
 *
 * WHY THIS EXISTS AT ALL. The default above is one word for everybody, and a
 * Russian speaker meeting an English button is the mirror of the fault the
 * owner reported. Telegram's `chat_id` form is the only per-person handle
 * there is, so the choice is made where the person is known and nowhere else.
 *
 * ONLY WHEN IT DIFFERS. An English speaker already has the default; calling
 * this for them would spend a request to write the word that is there. So the
 * caller passes `isRu` and a `false` returns 'default' without a request.
 *
 * NEVER THROWS. A button is worth a warning; it is not worth a lost /start.
 */
export async function pointThisChatsButtonAtTheApp(
  telegram: Pick<Telegraf<MyContext>['telegram'], 'setChatMenuButton'>,
  chatId: number | undefined,
  isRu: boolean
): Promise<'set' | 'default' | 'failed'> {
  if (!isRu || !chatId) return 'default'
  try {
    await telegram.setChatMenuButton({
      chatId,
      menuButton: {
        type: 'web_app',
        text: MENU_BUTTON_TEXT_RU,
        web_app: { url: MINI_APP_URL },
      },
    })
    return 'set'
  } catch (error) {
    logger.warn('[menu-button] this chat kept the default', {
      error: error instanceof Error ? error.message : String(error),
    })
    return 'failed'
  }
}
