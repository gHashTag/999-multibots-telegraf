import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { standardButtons } from '@/navigation/helpers/actionButtons'
import { logger } from '@/utils/logger'

/**
 * NO MESSAGE MAY BE MET WITH SILENCE.
 *
 * Owner, 06.09.2026: several of his messages got no reply AT ALL. One cause is
 * already covered inside the agent middleware (no model provider answered).
 * This module is the other one: messages that never reach the agent at all.
 *
 * Registration order, read from registerCommands.ts: the logger, the stage,
 * the global navigation middleware and `initializeNavigation` -- which
 * registers every `bot.command` and every `bot.hears` label -- all go in
 * BEFORE the agent middleware. The agent middleware is therefore the LAST
 * handler that answers text: after it the bootstraps add only
 * `setupStatsCommand` and the two payment handlers, and
 * `bot.on(message('text'), handleTextMessage)` is commented out.
 *
 * So every `return next()` inside the agent middleware hands the message to a
 * chain with nothing left in it. Its emoji guard is the sharpest example:
 * `hears` already ran and already declined that text, so the guard's entire
 * population is "emoji-prefixed text nobody handled" -- somebody pressing a
 * button from an older keyboard layout gets nothing back. The same holds for a
 * contact, a location, a poll, and for anyone standing inside a scene that
 * ignores what they typed.
 *
 * A sticker is deliberately NOT part of this story: measured 07.09.2026 by
 * calling `attachmentFromMessage` directly, a sticker IS picked up as an image
 * and does reach the agent. The hole is narrower than it first looked, which
 * is exactly why the size of it is now measured in production rather than
 * guessed at here.
 */

/**
 * Every way a handler can speak to the person through the context.
 *
 * A handler that writes through `ctx.telegram.sendMessage` directly is not
 * seen here -- and does not need to be: such a handler does not call `next()`
 * afterwards, so the net never runs for it. The two signals guard each other,
 * which is why the net requires BOTH: the end of the chain was reached, and no
 * reply was witnessed.
 */
export const REPLY_METHODS = [
  'reply',
  'replyWithHTML',
  'replyWithMarkdown',
  'replyWithMarkdownV2',
  'replyWithPhoto',
  'replyWithVideo',
  'replyWithVideoNote',
  'replyWithDocument',
  'replyWithAudio',
  'replyWithVoice',
  'replyWithAnimation',
  'replyWithMediaGroup',
  'replyWithSticker',
  'replyWithInvoice',
  'replyWithLocation',
  'replyWithContact',
  'replyWithDice',
]

/**
 * Message fields that mean "Telegram is telling the bot something", not
 * "a person is asking the bot something". The net stays quiet for these: a
 * successful payment is answered by the payment handler registered after
 * registerCommands, and nobody wants a puzzled reply to a pinned message.
 */
export const SERVICE_MESSAGE_FIELDS = [
  'successful_payment',
  'new_chat_members',
  'left_chat_member',
  'new_chat_title',
  'new_chat_photo',
  'delete_chat_photo',
  'group_chat_created',
  'supergroup_chat_created',
  'channel_chat_created',
  'message_auto_delete_timer_changed',
  'migrate_to_chat_id',
  'migrate_from_chat_id',
  'pinned_message',
  'web_app_data',
  'proximity_alert_triggered',
  'video_chat_started',
  'video_chat_ended',
  'video_chat_participants_invited',
]

/**
 * Part one: the witness. Registered FIRST, so it wraps the reply methods
 * before any handler can call them.
 */
export const replyWitness = (ctx: any, next: any) => {
  ctx.state = ctx.state || {}
  ctx.state.answered = false
  for (const name of REPLY_METHODS) {
    const original = ctx[name]
    if (typeof original !== 'function') continue
    ctx[name] = (...args: any[]) => {
      ctx.state.answered = true
      return original.apply(ctx, args)
    }
  }
  return next()
}

/**
 * Part two: the net. Registered LAST. Reaching it means every middleware
 * before it called `next()` -- Telegraf's way of saying "not mine".
 *
 * The log line matters as much as the reply. Nobody knows today how often this
 * happens or to which shapes of message, because until now the outcome was
 * indistinguishable from a bot that is down. From here on production answers
 * that question itself, naming the update type and the scene the person was
 * standing in.
 *
 * Private chats only: in a group the bot sees every message from everyone, and
 * a net that answered them all would be a nuisance rather than a fix.
 */
export const silenceNet = async (ctx: any, next: any) => {
  const message = ctx.message
  if (!message) return next()
  if (ctx.chat?.type !== 'private') return next()
  if (ctx.state?.answered) return next()
  if (SERVICE_MESSAGE_FIELDS.some(field => field in message)) return next()

  const shape = Object.keys(message).filter(
    key => !['message_id', 'date', 'chat', 'from', 'entities'].includes(key)
  )
  logger.warn('🔇 [no-reply] a message crossed the whole chain unanswered', {
    telegram_id: ctx.from?.id,
    updateType: ctx.updateType,
    scene: ctx.scene?.current?.id || 'none',
    shape,
  })

  const isRu = isRussianFromState(ctx)
  await ctx
    .reply(
      isRu
        ? 'Я получил сообщение, но не понял, что с ним сделать. ' + // cyrillic-ok: user-facing copy
            'Напиши словами, что нужно, — или нажми кнопку ниже.' // cyrillic-ok: user-facing copy
        : 'I got your message but could not tell what to do with it. ' +
            'Tell me in words what you need, or press a button below.',
      standardButtons(isRu)
    )
    .catch(() => {
      // If even this cannot be sent, there is nowhere left to write.
    })

  return next()
}
