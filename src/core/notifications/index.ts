import { Context } from 'telegraf'
import { logger } from '../../utils/logger'

export async function sendNotification(
  ctx: Context,
  message: string
): Promise<void> {
  try {
    logger.info('🔔 Отправка уведомления', {
      description: 'Sending notification',
      userId: ctx.from?.id,
      username: ctx.from?.username,
    })

    await ctx.reply(message, { parse_mode: 'Markdown' })
  } catch (error) {
    logger.error('❌ Ошибка при отправке уведомления', {
      description: 'Error sending notification',
      error,
      userId: ctx.from?.id,
      username: ctx.from?.username,
    })
  }
}
