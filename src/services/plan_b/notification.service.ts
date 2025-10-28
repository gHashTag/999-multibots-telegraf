import { getBotByName } from '@/core/bot'
import type { Telegraf } from 'telegraf'
import { BotName } from '@/interfaces'
import { toBotName } from '@/helpers/botName.helper'
import logger from '@/utils/enhancedLogger'

interface NotificationOptions {
  truncateError?: boolean
  maxLength?: number
}

export class NotificationService {
  private async getBotInstance(botName: string): Promise<Telegraf> {
    try {
      const validBotName = toBotName(botName)
      const result = await getBotByName(validBotName)
      if (!result || !result.bot) {
        logger.error(`❌ Бот не найден: ${validBotName}`, {
          description: `Bot not found: ${validBotName}`,
        })
        throw new Error(`Bot not found: ${validBotName}`)
      }
      return result.bot
    } catch (error) {
      logger.error('Error in getBotInstance:', error)
      throw error
    }
  }

  async sendTrainingError(
    telegramId: string | undefined,
    botName: BotName,
    error: string,
    options: NotificationOptions = {}
  ): Promise<void> {
    if (!telegramId) {
      logger.warn('⚠️ Не указан Telegram ID для отправки ошибки')
      return
    }

    try {
      const bot = await this.getBotInstance(botName)
      const maxLength = options.maxLength || 2000
      const message = options.truncateError
        ? `❌ Ошибка обучения:\n${error.substring(0, maxLength)}...`
        : error

      await bot.telegram.sendMessage(
        telegramId,
        `🚨 *Ошибка обучения модели*\n\n\`\`\`\n${message}\n\`\`\``,
        { parse_mode: 'MarkdownV2' }
      )

      logger.debug(`📩 Уведомление отправлено пользователю ${telegramId}`)
    } catch (error) {
      logger.error('💥 Ошибка отправки уведомления:', {
        telegramId,
        error: error.message,
      })
      // Здесь можно добавить fallback-логику (email, SMS и т.д.)
    }
  }

  // Дополнительные методы сервиса
  async sendSuccessNotification(
    telegramId: string,
    botName: BotName,
    is_ru: boolean
  ): Promise<void> {
    try {
      const bot = await this.getBotInstance(botName)
      const message = is_ru
        ? '🎉 Обучение завершено! 🎉\n\nМодель готова к использованию!\n\nНажмите 📸 Нейрофото в главном меню, чтобы использовать модель.'
        : '🎉 Training completed! 🎉\n\nModel is ready to use!\n\nClick 📸 Neurophoto in the main menu to use the model.'
      await bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'MarkdownV2',
      })
    } catch (error) {
      logger.error('Ошибка отправки успешного уведомления:', error)
    }
  }
}
