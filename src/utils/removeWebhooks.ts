import { Telegraf } from 'telegraf'
import { type MyContext } from '@/interfaces'
import { logger } from './logger'

/**
 * Удаляет все вебхуки для бота с обработкой ошибок.
 * @param bot Экземпляр бота Telegraf
 * @returns Promise<boolean> Успешно ли выполнено удаление
 */
export async function removeWebhooks(
  bot: Telegraf<MyContext>
): Promise<boolean> {
  try {
    // Проверяем валидность токена и доступность бота
    await bot.telegram.getMe()

    // Получаем информацию о текущем вебхуке
    const webhookInfo = await bot.telegram.getWebhookInfo()

    // Если вебхук установлен, удаляем его
    if (webhookInfo.url) {
      await bot.telegram.deleteWebhook({
        drop_pending_updates: true,
      })

      logger.info('✅ Вебхук удален:', {
        description: 'Webhook deleted',
        bot_name: bot.botInfo?.username,
        old_url: webhookInfo.url,
      })
    } else {
      logger.info('ℹ️ Вебхук не был установлен:', {
        description: 'No webhook was set',
        bot_name: bot.botInfo?.username,
      })
    }

    return true
  } catch (error) {
    const botName = bot.botInfo?.username || 'unknown'
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('❌ Ошибка при удалении вебхука:', {
      description: 'Webhook deletion error',
      bot_name: botName,
      error: errorMessage,
    })

    // Если ошибка связана с авторизацией, возвращаем false
    if (errorMessage.includes('401: Unauthorized')) {
      return false
    }

    // Для других ошибок пробуем еще раз с базовыми параметрами
    try {
      await bot.telegram.deleteWebhook()
      logger.info('✅ Вебхук удален после повторной попытки:', {
        description: 'Webhook deleted after retry',
        bot_name: botName,
      })
      return true
    } catch (retryError) {
      logger.error('❌ Ошибка при повторной попытке удаления вебхука:', {
        description: 'Webhook deletion retry error',
        bot_name: botName,
        error:
          retryError instanceof Error ? retryError.message : String(retryError),
      })
      return false
    }
  }
}

export default removeWebhooks
