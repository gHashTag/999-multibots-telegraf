import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * THE PERSON CAN END THE TURN THEY ARE WATCHING.
 *
 * A turn ran up to three minutes and nothing but the timer could end it --
 * not the person, who often knows within seconds that the answer is going
 * somewhere useless, and not the agent, which kept calling tools long after
 * the bot had stopped listening.
 *
 * Bot API 10.3 (24 Aug 2026) puts a stop button on the streamed draft
 * (`can_stop` in sendMessageDraft) and sends `stopped_message_generation`
 * when it is pressed. Pressing it aborts the request the bot is holding
 * open, which closes the response from the render, which is how the agent
 * itself learns to stop -- the whole chain ends on one press.
 */
export function registerStopTurn(bot: Telegraf<MyContext>): void {
  // Telegraf 4.16.3 has no type for the update; Composer.on is a plain
  // `filter in update` check, so the key is enough.
  const onStopped = async (ctx: MyContext) => {
    const upd = (ctx.update as Record<string, any>)?.stopped_message_generation
    const chatId = String(upd?.chat?.id ?? '')
    if (!chatId) return
    const { stopTurn } = await import('@/services/trinityAgent')
    const stopped = stopTurn(chatId)
    logger.info('[stop] turn stopped by the person', { chatId, stopped })
    if (!stopped) return
    await ctx.telegram
      .sendMessage(chatId, 'Остановил. Спрашивайте по-другому.')
      .catch(() => undefined)
  }
  bot.on('stopped_message_generation' as never, onStopped as never)
}
