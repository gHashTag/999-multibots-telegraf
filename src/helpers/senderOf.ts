/**
 * Who sent this update, and which language code to decide on.
 *
 * DEPENDENCY-FREE ON PURPOSE. This is imported by languageMiddleware, which is
 * registered at bot bootstrap, and by helpers/language, which every scene
 * imports. The first attempt put these two functions in helpers/language and
 * had the middleware import that -- which dragged `@/store` into the
 * middleware's module graph, and `@/store` transitively loads the scenes
 * (measured: importing `@/store` alone pulls `@/services/aiChatService` in via
 * aiChatWizard, which reads AI_CHAT_MODELS at module load). So this file takes
 * no repository imports at all and types its input structurally.
 *
 * ---------------------------------------------------------------------------
 * 1. THE SENDER
 *
 * Production, 2026-09-16, two lines four and eight seconds either side of a
 * business DM from chat 435572800:
 *   09:30:22 [WARN]: [LanguageMiddleware] No telegram ID, using fallback {"fallbackLanguage":"en"}
 *   09:30:26 [WARN]: [Business] agent unreachable, falling back {"chatId":"435572800"}
 *   09:30:34 [WARN]: [LanguageMiddleware] No telegram ID, using fallback {"fallbackLanguage":"en"}
 *
 * telegraf 4.16.3 resolves `ctx.from` in getUserFromAnySource
 * (node_modules/telegraf/lib/context.js:1183) over callback_query, then
 * ctx.msg -- and getMessageFromAnySource (context.js:1177) builds ctx.msg from
 * only message / edited_message / callback_query.message / channel_post /
 * edited_channel_post -- then inline_query, shipping_query, pre_checkout_query,
 * chosen_inline_result, chat_member, my_chat_member, chat_join_request,
 * message_reaction, poll_answer and chat_boost. No business update kind appears
 * anywhere in that chain. Measured on a real Context: business_message,
 * business_connection and edited_business_message all yield `ctx.from ===
 * undefined` AND `ctx.chat === undefined`, while a plain `message` control
 * resolves both. That is the same gap createBusinessMiddleware already works
 * around by hand -- "Telegraf 4.16.3 doesn't support business events natively"
 * (services/businessBotService.ts).
 *
 * ---------------------------------------------------------------------------
 * 2. THE LANGUAGE CODE
 *
 * Telegram omits `language_code` freely, and the chat-id fallback below never
 * carries one at all. Read literally, `isRussianLanguageCode(undefined)` is
 * false, so EVERY update with no code resolved to English -- choosing the wrong
 * answer by default for a Russian-speaking audience. This repo had already
 * ruled on that: video-completion-language-not-hardcoded.test.ts states the
 * language "defaults to Russian when the language is unknown", and
 * helpers/isRussianLanguageCode.ts calls an English answer to this audience the
 * defect it exists to fix.
 *
 * So a MISSING signal means Russian. A PRESENT signal naming a non-Russian
 * language still means English -- that is a real answer and is untouched.
 */

/** The only two fields of a Telegram user that a language decision reads. */
export interface LanguageSender {
  id?: number
  language_code?: string
}

/** Structural shape of the bits of a Context this reads. */
interface SenderBearingContext {
  from?: LanguageSender
  update?: Record<string, any>
}

export const senderOf = (
  ctx: SenderBearingContext | null | undefined
): LanguageSender | undefined => {
  const from = ctx?.from
  if (from) return from

  const update = ctx?.update
  if (!update) return undefined

  const businessMessage =
    update.business_message ?? update.edited_business_message
  if (businessMessage?.from) return businessMessage.from

  // A business_connection names the OWNER who linked the bot, not a customer:
  // handleBusinessMessage compares `msg.from?.id === conn.userId` precisely to
  // tell "the owner typed here himself" apart from a customer. He is still the
  // only human this update identifies, and his is the language to answer in.
  if (update.business_connection?.user) return update.business_connection.user

  // Last resort, for the ID ALONE. A business DM is a private chat, so chat.id
  // is the customer's own user id. Note there is no language_code out here --
  // which is exactly why an absent code must not be read as "English".
  const chat = businessMessage?.chat
  if (chat?.type === 'private' && typeof chat.id === 'number') {
    return { id: chat.id }
  }

  return undefined
}

/** An absent Telegram language code is not evidence of English. See above. */
export const RUSSIAN_WHEN_UNSTATED = 'ru'

export const statedLanguageCode = (sender?: LanguageSender): string =>
  sender?.language_code ?? RUSSIAN_WHEN_UNSTATED
