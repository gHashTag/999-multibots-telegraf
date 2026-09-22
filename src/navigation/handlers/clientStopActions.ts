/**
 * THE OWNER'S TWO PRESSES UNDER "THIS CLIENT ASKED THE ASSISTANT TO STOP".
 *
 * Turning the assistant back on is the owner's action and nobody else's: the
 * client cannot do it (no words of theirs are read as "switch it back on"),
 * the agent cannot do it (no tool writes the row), and a press here changes
 * only the PRESSER's own row -- the owner id comes from `ctx.from`, never from
 * the button. Handled inside the business middleware, so every bot of the farm that
 * can carry a business connection answers these presses.
 */
import {
  CLIENT_STOP_RE,
  clientStopMenu,
} from '@/navigation/helpers/clientStopMenu'
import { resumeAssistant } from '@/services/assistantOptOut'
import { logger } from '@/utils/logger'

/** Is this update one of the two presses? Read from the raw update. */
export function isClientStopPress(update: any): boolean {
  const data = update?.callback_query?.data
  return typeof data === 'string' && CLIENT_STOP_RE.test(data)
}

/**
 * The press itself. Called from the business middleware (which already sees
 * every update before the rest of the bot) rather than through `bot.action`,
 * so it lives and dies with the business path it belongs to.
 */
export async function handleClientStopPress(ctx: any): Promise<void> {
  await ctx.answerCbQuery().catch(() => undefined)
  if (ctx.chat?.type !== 'private') return
  const data = String(ctx.callbackQuery?.data ?? '')
  const [, verb, client] = CLIENT_STOP_RE.exec(data) ?? []
  if (!verb || !client) return
  const owner = String(ctx.from?.id ?? '')
  if (!owner) return

  if (verb === 'keep') {
    // Nothing to write: off is already the state. The press is answered by
    // leaving only the way back under the notice.
    await ctx
      .editMessageReplyMarkup(
        clientStopMenu(client, { kept: true }).reply_markup
      )
      .catch(() => undefined)
    return
  }

  try {
    const wasOff = await resumeAssistant(owner, client)
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined)
    await ctx.reply(
      wasOff
        ? `🔔 Ассистент снова отвечает в этом чате (id ${client}). Попросит клиент выключить ещё раз — выключу и скажу тебе.`
        : `🔔 Ассистент в этом чате и так включён (id ${client}).`
    )
    logger.info('[Business] owner turned the assistant back on', {
      owner,
      client,
      wasOff,
    })
  } catch (error) {
    logger.error('[Business] could not turn the assistant back on', {
      owner,
      client,
      error: error instanceof Error ? error.message : String(error),
    })
    await ctx
      .reply(
        '⚠️ Не получилось включить: база не ответила. В этом чате ассистент пока молчит — нажми ещё раз через минуту.',
        clientStopMenu(client, { kept: true })
      )
      .catch(() => undefined)
  }
}
