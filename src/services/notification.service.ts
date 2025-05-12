import { getBotByName } from '../core/bot' // Предполагаемый путь
import type { Telegraf } from 'telegraf'
import { logger } from '../utils/logger' // Предполагаемый путь к логгеру

interface NotificationOptions {
  truncateError?: boolean
  maxLength?: number
}

export class NotificationService {
  private async getBotInstance(botName: string): Promise<Telegraf> {
    // Оставляем try-catch, так как getBotByName может вернуть { error: ... }
    try {
      const botData = getBotByName(botName) // getBotByName не асинхронная по текущей реализации
      if (botData.error || !botData.bot) {
        // Проверяем наличие ошибки или отсутствие бота
        logger.error({
          message: `Бот ${botName} не найден или произошла ошибка при получении.`,
          error: botData.error,
        })
        throw new Error(`Бот ${botName} не найден или ошибка: ${botData.error}`)
      }
      return botData.bot
    } catch (error: any) {
      logger.error({
        message: '🤖 Ошибка получения экземпляра бота',
        botName,
        error: error.message,
      })
      throw error // Пробрасываем ошибку дальше
    }
  }

  async sendTrainingError(
    telegramId: string | undefined,
    botName: string,
    error: string,
    options: NotificationOptions = {}
  ): Promise<void> {
    if (!telegramId) {
      logger.warn(
        '⚠️ Не указан Telegram ID для отправки сообщения об ошибке обучения'
      )
      return
    }

    try {
      const bot = await this.getBotInstance(botName)
      const maxLength = options.maxLength || 2000 // Максимальная длина сообщения, чтобы избежать проблем с Telegram API
      let message = error
      if (options.truncateError && error.length > maxLength) {
        message = `❌ Ошибка обучения (сообщение слишком длинное, показана часть):\n${error.substring(0, maxLength)}...`
      } else {
        message = `🚨 *Ошибка обучения модели*\n\n\`\`\`\n${error}\n\`\`\``
      }

      await bot.telegram.sendMessage(
        telegramId,
        message,
        { parse_mode: 'Markdown' } // parse_mode нужен для форматирования ```
      )

      logger.info({
        message: `📩 Уведомление об ошибке обучения отправлено пользователю ${telegramId}`,
        botName,
      })
    } catch (e: any) {
      logger.error({
        message: '💥 Ошибка отправки уведомления об ошибке обучения',
        telegramId,
        botName,
        error: e.message,
        stack: e.stack,
      })
      // Здесь можно добавить fallback-логику (email, SMS и т.д.)
    }
  }

  // Дополнительные методы сервиса
  async sendSuccessNotification(
    telegramId: string,
    botName: string,
    is_ru: boolean
  ): Promise<void> {
    if (!telegramId) {
      logger.warn(
        '⚠️ Не указан Telegram ID для отправки сообщения об успехе обучения'
      )
      return
    }
    try {
      const bot = await this.getBotInstance(botName)
      const message = is_ru
        ? '🎉 Обучение завершено! 🎉\n\nМодель готова к использованию!\n\nНажмите 📸 Нейрофото в главном меню, чтобы использовать модель.'
        : '🎉 Training completed! 🎉\n\nModel is ready to use!\n\nClick 📸 Neurophoto in the main menu to use the model.'
      await bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'Markdown', // Markdown для эмодзи и форматирования, если нужно
      })
      logger.info({
        message: `📩 Уведомление об успехе обучения отправлено пользователю ${telegramId}`,
        botName,
      })
    } catch (error: any) {
      logger.error({
        message: '💥 Ошибка отправки уведомления об успехе обучения',
        telegramId,
        botName,
        error: error.message,
        stack: error.stack,
      })
    }
  }
}
