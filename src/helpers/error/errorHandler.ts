import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
// Убираем импорт отсутствующей функции supportRequest
// import { supportRequest } from '@/core/bot'

// Создаем заглушку для функции supportRequest
const supportRequest = (message: string, data: any) => {
  logger.warn('⚠️ Вызов заглушки supportRequest:', { message, data })
  // Здесь можно добавить функционал отправки сообщения в специальный канал поддержки
}

// Интерфейс для типизации ошибки Telegram API
interface TelegramError {
  message?: string
  on?: {
    method?: string
    payload?: any
  }
  code?: number
  response?: {
    ok?: boolean
    error_code?: number
    description?: string
  }
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

    // Проверяем различные типы ошибок
    const isAuthError = error.message?.includes('401: Unauthorized')
    const isBlockedError = error.message?.includes(
      '403: Forbidden: bot was blocked by the user'
    )
    const isForbiddenError =
      error.message?.includes('403: Forbidden') && !isBlockedError
    const error_code = error.response?.error_code

    // Получаем информацию о пользователе для логирования
    const userId = ctx?.from?.id
    const username = ctx?.from?.username
    const chatId = ctx?.chat?.id

    if (isBlockedError) {
      // Обрабатываем случай заблокированного пользователя
      logger.warn('🚫 Пользователь заблокировал бота:', {
        description: 'User blocked the bot',
        bot_name: ctx?.botInfo?.username || 'unknown',
        user_id: userId,
        username: username,
        chat_id: chatId,
        error: error.message,
        method: error.on?.method || 'unknown',
        update_id: ctx?.update?.update_id,
      })
      // Для заблокированных пользователей не отправляем уведомление в поддержку
      // так как это нормальная ситуация
    } else if (isAuthError) {
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
    } else if (isForbiddenError) {
      logger.warn('🔒 Ошибка доступа Telegram API:', {
        description: 'Telegram API Forbidden Error',
        bot_name: ctx?.botInfo?.username || 'unknown',
        user_id: userId,
        username: username,
        chat_id: chatId,
        error: error.message,
        method: error.on?.method || 'unknown',
        update_id: ctx?.update?.update_id,
      })
    } else {
      logger.error('❌ Ошибка Telegram API:', {
        description: 'Telegram API Error',
        bot_name: ctx?.botInfo?.username || 'unknown',
        error_code: error_code,
        error: error.message,
        method: error.on?.method || 'unknown',
        user_id: userId,
        username: username,
        chat_id: chatId,
        update_id: ctx?.update?.update_id,
      })
    }

    // Возвращаем Promise<void> вместо boolean
    return Promise.resolve()
  })
}
