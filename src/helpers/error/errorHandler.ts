import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { supportRequest } from '@/core/bot'

// Интерфейс для типизации ошибки Telegram API
interface TelegramError {
  message?: string
  on?: {
    method?: string
  }
  code?: number
  response?: any
  description?: string
}

/**
 * Обработчик ошибок Telegram API для защиты от отказа всего приложения при проблемах с токенами
 * @param bot Экземпляр бота Telegraf
 */
export const setupErrorHandler = (bot: Telegraf<MyContext>): void => {
  bot.catch((err, ctx) => {
    // Типизируем ошибку
    const error = err as TelegramError

    // Проверяем, является ли ошибка ошибкой авторизации
    const isAuthError = error.message?.includes('401: Unauthorized')

    // Логируем ошибку с разным уровнем в зависимости от типа
    if (isAuthError) {
      logger.error('🔐 Ошибка авторизации Telegram API:', {
        description: 'Telegram API Authorization Error',
        bot_name: ctx?.botInfo?.username || 'unknown',
        error: error.message,
        token_prefix: ctx?.telegram?.token
          ? ctx.telegram.token.substring(0, 10) + '...'
          : 'unknown',
        method: error.on?.method || 'unknown',
        update_id: ctx?.update?.update_id,
      })

      // Отправляем уведомление в канал поддержки
      supportRequest('🚨 Ошибка авторизации Telegram API', {
        bot_name: ctx?.botInfo?.username || 'unknown',
        error: error.message,
        token_prefix: ctx?.telegram?.token
          ? ctx.telegram.token.substring(0, 10) + '...'
          : 'unknown',
        method: error.on?.method || 'unknown',
        time: new Date().toISOString(),
      })
    } else {
      logger.error('❌ Ошибка Telegram API:', {
        description: 'Telegram API Error',
        bot_name: ctx?.botInfo?.username || 'unknown',
        error: error.message,
        method: error.on?.method || 'unknown',
        update_id: ctx?.update?.update_id,
      })
    }

    // Возвращаем Promise<void> вместо boolean
    return Promise.resolve()
  })
}
