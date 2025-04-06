import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'

export class NotificationService {
  /**
   * Отправляет уведомление об ошибке тренировки модели
   */
  async sendTrainingError(
    telegramId: string,
    botName: string,
    errorMessage: string
  ): Promise<boolean> {
    try {
      const { bot } = getBotByName(botName)
      if (!bot) {
        logger.error({
          message: '❌ Бот не найден при отправке уведомления об ошибке',
          botName,
          telegramId,
        })
        return false
      }

      await bot.telegram.sendMessage(
        telegramId,
        `❌ <b>Ошибка при тренировке модели:</b>\n\n${errorMessage}`,
        { parse_mode: 'HTML' }
      )

      logger.info({
        message: '✅ Отправлено уведомление об ошибке тренировки',
        telegramId,
        botName,
      })

      return true
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при отправке уведомления об ошибке',
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId,
        botName,
      })
      return false
    }
  }

  /**
   * Отправляет уведомление об успешном завершении тренировки модели
   */
  async sendSuccessNotification(
    telegramId: string,
    botName: string,
    isRussian: boolean
  ): Promise<boolean> {
    try {
      const { bot } = getBotByName(botName)
      if (!bot) {
        logger.error({
          message: '❌ Бот не найден при отправке уведомления об успехе',
          botName,
          telegramId,
        })
        return false
      }

      const message = isRussian
        ? '🎉 <b>Тренировка модели успешно завершена!</b>\n\nТеперь вы можете использовать вашу модель.'
        : '🎉 <b>Model training completed successfully!</b>\n\nNow you can use your model.'

      await bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'HTML',
      })

      logger.info({
        message: '✅ Отправлено уведомление об успешной тренировке',
        telegramId,
        botName,
      })

      return true
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при отправке уведомления об успехе',
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId,
        botName,
      })
      return false
    }
  }
}
