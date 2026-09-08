import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { telegramLogService } from '@/services/telegram-log.service'

// Заглушка для supportRequest (заменена на telegramLogService)
const supportRequest = (message: string, data: any) => {
  // Отправляем в группу НейроМентор
  telegramLogService
    .logError({
      error: message,
      context: data.method || 'supportRequest',
      botName: data.bot_name,
    })
    .catch(err => logger.warn('Failed to send error to log group:', err))
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
  /*
   * THE SUBSCRIBER AND ITS CHANNEL COME UP IN ONE MOVE.
   *
   * Everything `bot.catch` below catches is sent through telegramLogService --
   * and NOBODY called its `initialize()`, not one line in the repository. The
   * service returned from `log()` silently, so the owner received not a single
   * incident in all that time, and nothing said so: the calls are in place,
   * nothing throws, and the Telegram group is empty.
   *
   * The wiring sits here rather than at a startup point for exactly that
   * reason: a startup point can be forgotten, but installing the error catcher
   * without raising its delivery channel is now impossible -- it is one
   * function.
   */
  telegramLogService.initializeOnce(bot)

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

      // Логируем в группу НейроМентор
      telegramLogService
        .logError({
          telegramId: userId?.toString(),
          username: username,
          error: error.message || 'Forbidden Error',
          context: `403 Forbidden: ${error.on?.method || 'unknown'}`,
          botName: ctx?.botInfo?.username,
        })
        .catch(() => {})
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

      // Логируем критические ошибки в группу НейроМентор
      telegramLogService
        .logError({
          telegramId: userId?.toString(),
          username: username,
          error: error.message || 'Unknown Telegram API Error',
          context: `${error.on?.method || 'unknown'} (code: ${error_code || 'N/A'})`,
          botName: ctx?.botInfo?.username,
        })
        .catch(() => {})
    }

    // Возвращаем Promise<void> вместо boolean
    return Promise.resolve()
  })
}

/**
 * Register process-level handlers for rejections and exceptions that escape the
 * bot's update loop — fire-and-forget promises, interval callbacks, the
 * monitors, the API server. setupErrorHandler only wires bot.catch, and on Node
 * the default for an unhandled rejection is to terminate the process. In one
 * process that serves many bots, a single stray rejection would drop them all.
 *
 * These handlers exist in core/foundation/Foundation.ts, but Foundation is
 * never initialised in production (nothing imports it outside examples), so the
 * safety net was never armed. This wires up the minimal version.
 *
 * A rejected promise leaves synchronous state intact, so it is logged and the
 * process keeps serving. An uncaught exception can leave state undefined, so it
 * is logged and the process exits for a clean restart instead of continuing.
 *
 * Idempotent: index.ts starts once, but the guard keeps a second call — a test,
 * a re-import — from stacking listeners.
 */
let globalHandlersRegistered = false
export const setupGlobalErrorHandlers = (): void => {
  if (globalHandlersRegistered) return
  globalHandlersRegistered = true

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.stack : String(reason),
      promise: String(promise),
    })
  })

  process.on('uncaughtException', error => {
    logger.error('Uncaught exception — exiting for a clean restart', {
      error: error.message,
      stack: error.stack,
    })
    process.exit(1)
  })
}
