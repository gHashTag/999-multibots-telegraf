import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import express from 'express'

// Глобальные переменные для настройки сервера
const app = express()
const PORT = process.env.PORT || 2999
const BOT_SERVER_URL =
  process.env.ORIGIN || 'https://999-multibots-u14194.vm.elestio.app'
const SECRET_TOKEN_BASE =
  process.env.WEBHOOK_SECRET || 'multibots_webhook_secret'

/**
 * Запускает сервер Express для обработки вебхуков
 * @returns {Promise<boolean>} - Успешно ли запущен сервер
 */
export const startServer = async (): Promise<boolean> => {
  return new Promise<boolean>(resolve => {
    try {
      // Добавляем базовый маршрут для проверки работоспособности
      app.get('/', (req, res) => {
        res.send({
          status: 'ok',
          message: 'Multibots webhook server is running',
          timestamp: new Date().toISOString(),
        })
      })

      // Запускаем сервер на указанном порту
      const server = app.listen(PORT, () => {
        logger.info(`🚀 Webhook сервер запущен на порту ${PORT}`)
        resolve(true)
      })

      // Настраиваем обработку ошибок сервера
      server.on('error', error => {
        logger.error(
          `❌ Ошибка запуска сервера: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        resolve(false)
      })
    } catch (error) {
      logger.error(
        `❌ Непредвиденная ошибка при запуске сервера: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      resolve(false)
    }
  })
}

/**
 * Функции для запуска ботов в разных режимах
 */
export const launch = {
  /**
   * Запускает бота в режиме development через longpolling
   * @param bot Экземпляр бота Telegraf
   * @param botId Идентификатор бота для логов
   * @returns Promise<boolean> Успешность запуска
   */
  development: async (
    bot: Telegraf<MyContext>,
    botId: string
  ): Promise<boolean> => {
    try {
      logger.info(
        `🚀 [${botId}] Запуск бота в режиме long polling (development)`
      )

      // Проверяем соединение с API Telegram перед запуском
      try {
        const me = await bot.telegram.getMe()
        logger.info(
          `✅ [${botId}] Соединение с Telegram API успешно установлено`,
          {
            bot_username: me.username,
            bot_id: me.id,
          }
        )
      } catch (apiError) {
        logger.error(
          `❌ [${botId}] Ошибка при подключении к Telegram API: ${
            apiError instanceof Error ? apiError.message : String(apiError)
          }`
        )
        return false
      }

      // Запускаем бота в режиме long polling с дополнительными опциями
      await bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: [
          'message',
          'callback_query',
          'inline_query',
          'my_chat_member',
          'chat_member',
        ],
      })

      logger.info(`✅ [${botId}] Бот успешно запущен в режиме long polling`)

      // Регистрируем обработчик для корректного завершения работы
      process.once('SIGINT', () => {
        logger.info(`⏹️ [${botId}] Остановка бота по SIGINT`)
        bot.stop('SIGINT')
      })
      process.once('SIGTERM', () => {
        logger.info(`⏹️ [${botId}] Остановка бота по SIGTERM`)
        bot.stop('SIGTERM')
      })

      return true
    } catch (error) {
      logger.error(
        `❌ [${botId}] Ошибка запуска бота в режиме long polling: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      return false
    }
  },

  /**
   * Запускает бота в режиме production через webhook
   * @param bot Экземпляр бота Telegraf
   * @param botId Идентификатор бота для логов
   * @returns Promise<boolean> Успешность запуска
   */
  production: async (
    bot: Telegraf<MyContext>,
    botId: string
  ): Promise<boolean> => {
    try {
      // Создаем уникальный секретный токен для каждого бота на основе базового секрета
      const secretToken = `${SECRET_TOKEN_BASE}_${botId}`

      // Создаем уникальный путь для каждого бота
      const path = `/webhook/${botId}`
      const webhookUrl = `${BOT_SERVER_URL}${path}`

      logger.info(`🔒 [${botId}] Настройка webhook с защитой`, {
        webhook_url: webhookUrl,
        has_secret: !!secretToken,
      })

      // Сбрасываем предыдущий webhook если есть
      try {
        await bot.telegram.deleteWebhook()
        logger.info(`🧹 [${botId}] Предыдущий webhook удален`)
      } catch (deleteError) {
        logger.warn(
          `⚠️ [${botId}] Не удалось удалить предыдущий webhook: ${
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError)
          }`
        )
      }

      // Устанавливаем новый webhook с секретным токеном
      await bot.telegram.setWebhook(webhookUrl, {
        secret_token: secretToken,
      })

      // Проверяем информацию о webhook для подтверждения
      const webhookInfo = await bot.telegram.getWebhookInfo()

      logger.info(`ℹ️ [${botId}] Информация о webhook:`, {
        url: webhookInfo.url,
        has_custom_certificate: webhookInfo.has_custom_certificate,
        pending_update_count: webhookInfo.pending_update_count,
        last_error_message: webhookInfo.last_error_message || 'No errors',
        last_synchronization_error_date:
          webhookInfo.last_synchronization_error_date || 'N/A',
      })

      // Логируем только последние символы секретного токена для безопасности
      const secretLastChars = secretToken.substring(secretToken.length - 4)

      // Настройка express middleware для обработки webhook запросов конкретного бота
      app.use(
        bot.webhookCallback(path, {
          secretToken,
        })
      )

      logger.info(
        `✅ [${botId}] Webhook успешно настроен: ${webhookUrl} (секрет: ...${secretLastChars})`
      )
      return true
    } catch (error) {
      logger.error(
        `❌ [${botId}] Ошибка настройки webhook: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      return false
    }
  },
}

// Экспортируем express app для использования в других модулях
export { app }
