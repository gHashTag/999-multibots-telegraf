import { Context } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * Sends a completion notification to the user with sound
 * Uses a simple text message with notification sound enabled
 *
 * @param ctx - Telegram context
 * @param isRu - Is Russian language
 * @param taskType - Type of completed task (optional, for logging)
 */
export async function sendCompletionNotification(
  ctx: Context | MyContext,
  isRu: boolean,
  taskType?: string
): Promise<void> {
  try {
    const message = isRu ? '✅ Готово!' : '✅ Done!'

    // Send message with sound notification enabled (disable_notification: false)
    await ctx.reply(message, {
      disable_notification: false, // This ensures sound plays
    })

    logger.info('[CompletionNotification] Notification sent', {
      telegram_id: ctx.from?.id,
      taskType,
      language: isRu ? 'ru' : 'en',
    })
  } catch (error) {
    logger.error('[CompletionNotification] Error sending notification', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: ctx.from?.id,
      taskType,
    })
    // Don't throw - notification failure shouldn't break the flow
  }
}

/**
 * Sends an enhanced completion notification with custom emoji and message
 *
 * @param ctx - Telegram context
 * @param isRu - Is Russian language
 * @param options - Custom options
 */
export async function sendEnhancedCompletionNotification(
  ctx: Context | MyContext,
  isRu: boolean,
  options?: {
    emoji?: string
    message?: string
    taskType?: string
  }
): Promise<void> {
  try {
    const emoji = options?.emoji || '✅'
    const defaultMessage = isRu ? 'Готово!' : 'Done!'
    const message = `${emoji} ${options?.message || defaultMessage}`

    await ctx.reply(message, {
      disable_notification: false,
    })

    logger.info('[CompletionNotification] Enhanced notification sent', {
      telegram_id: ctx.from?.id,
      taskType: options?.taskType,
      language: isRu ? 'ru' : 'en',
    })
  } catch (error) {
    logger.error(
      '[CompletionNotification] Error sending enhanced notification',
      {
        error: error instanceof Error ? error.message : String(error),
        telegram_id: ctx.from?.id,
        taskType: options?.taskType,
      }
    )
  }
}

/**
 * Sends a completion notification with audio file (for special cases)
 * Uses Telegram's voice message feature
 *
 * @param ctx - Telegram context
 * @param isRu - Is Russian language
 * @param audioUrl - URL or file_id of audio completion sound
 */
export async function sendAudioCompletionNotification(
  ctx: Context | MyContext,
  isRu: boolean,
  audioUrl?: string
): Promise<void> {
  try {
    // First send text notification with sound
    await sendCompletionNotification(ctx, isRu, 'audio_completion')

    // If audio URL provided, send it as well
    if (audioUrl) {
      await ctx.replyWithAudio(audioUrl, {
        disable_notification: false,
      })
    }

    logger.info('[CompletionNotification] Audio notification sent', {
      telegram_id: ctx.from?.id,
      hasAudio: !!audioUrl,
    })
  } catch (error) {
    logger.error('[CompletionNotification] Error sending audio notification', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: ctx.from?.id,
    })
  }
}
