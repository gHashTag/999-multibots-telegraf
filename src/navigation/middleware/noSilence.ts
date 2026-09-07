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
  ctx.state.pressAnswered = false
  /*
   * A press is answered by `answerCbQuery`, not by a message. Telegram spins a
   * clock on the button until that call arrives and gives up after about half a
   * minute, so a handler that replies but forgets to answer still leaves the
   * button visibly stuck.
   */
  const answerCb = ctx.answerCbQuery
  if (typeof answerCb === 'function') {
    ctx.answerCbQuery = (...args: any[]) => {
      ctx.state.pressAnswered = true
      return answerCb.apply(ctx, args)
    }
  }
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
  /*
   * POST position: everything downstream runs FIRST, and only then does this
   * ask whether anybody spoke.
   *
   * The first version decided BEFORE calling next(), which was wrong in a way
   * its own test showed and I did not read: `setupStatsCommand` is registered
   * after registerCommands in both bootstraps, so `/admin_sub` reached this net
   * before its real handler. An admin typing it got the puzzled sentence and
   * then the actual answer, one after the other.
   *
   * `finally`, not a plain await: when a downstream handler THROWS, the error
   * goes to bot.catch and the person would otherwise get nothing at all --
   * which is the case this net exists for.
   */
  try {
    await next()
  } finally {
    await answerIfNobodyDid(ctx)
  }
}

async function answerIfNobodyDid(ctx: any): Promise<void> {
  const message = ctx.message
  if (!message) return
  if (ctx.chat?.type !== 'private') return
  if (ctx.state?.answered) return
  if (SERVICE_MESSAGE_FIELDS.some(field => field in message)) return

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
}

/**
 * THE SAME PROPERTY, ONE INTERACTION LATER: A PRESS THAT REACHES NOTHING.
 *
 * A callback button whose id no handler catches produces no error and no
 * message -- just a clock on the button that spins for about thirty seconds
 * and then stops. To the person that is indistinguishable from a dead bot,
 * which is exactly what the message net was built to end.
 *
 * A census of this repository found 211 rendered callback ids against 45
 * caught by `bot.action`, 103 by a scene handler and the rest by hand. Chasing
 * each orphan is worth doing and is a different job; this catches the ones
 * nobody has found yet, and the ones that will break later.
 *
 * Two outcomes, deliberately different:
 *   - somebody handled the press but forgot to answer it: answer quietly, so
 *     the clock stops and nothing else changes;
 *   - nobody handled it at all: say so, in a toast rather than an alert, and
 *     leave the standard buttons underneath so there is a live thing to press.
 *
 * `buttonErrorMiddleware.ts` holds 260 lines aimed at this and is registered
 * nowhere -- it was written and never wired. This is deliberately smaller: it
 * answers the press and says one true sentence.
 */
export const deadPressNet = async (ctx: any, next: any) => {
  try {
    await next()
  } finally {
    if (ctx.callbackQuery && !ctx.state?.pressAnswered) {
      const data =
        typeof ctx.callbackQuery.data === 'string' ? ctx.callbackQuery.data : ''
      const handled = Boolean(ctx.state?.answered)

      if (!handled) {
        logger.warn('🔇 [no-press] a button press reached no handler', {
          telegram_id: ctx.from?.id,
          data,
          scene: ctx.scene?.current?.id || 'none',
        })
      }

      const isRu = isRussianFromState(ctx)
      await ctx
        .answerCbQuery(
          handled
            ? undefined
            : isRu
              ? 'Эта кнопка больше не работает — вот что можно сделать сейчас' // cyrillic-ok: user-facing copy
              : 'That button is no longer active -- here is what works now'
        )
        .catch(() => {
          // The press is already lost; nothing is gained by throwing here.
        })

      if (!handled && ctx.chat?.type === 'private') {
        await ctx
          .reply(
            isRu
              ? 'Эта кнопка устарела. Напишите, что нужно, — или нажмите ниже.' // cyrillic-ok: user-facing copy
              : 'That button is out of date. Tell me what you need, or press below.',
            standardButtons(isRu)
          )
          .catch(() => {
            // Nowhere left to write.
          })
      }
    }
  }
}
