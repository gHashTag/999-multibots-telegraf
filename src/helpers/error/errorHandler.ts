import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { telegramLogService } from '@/services/telegram-log.service'

// supportRequest is gone with its only call site: it existed to reach the
// owner, and winston's transport now does that for every logger.error, once.

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

      /*
       * The second delivery is gone here too. `logger.error` above already
       * carries this to the owner, and the duplicate restated the same four
       * fields with a timestamp appended -- one event, two pushes.
       */
    } else if (isForbiddenError) {
      /*
       * ONE LINE, AT THE LEVEL THAT MATCHES WHERE IT GOES.
       *
       * This branch wrote a `warn` for the file and then called the service
       * directly for the owner -- two statements for one event, and the direct
       * call is the one path that bypasses the transport's throttle, so a 403
       * storm arrived unthrottled. The information in both was identical.
       *
       * `error` rather than `warn`, because the level is now a routing decision
       * and this DOES reach the owner: a 403 that is not "the user blocked the
       * bot" (handled above, deliberately unreported) means the bot cannot act
       * for somebody, which is worth knowing once.
       */
      logger.error('🔒 Ошибка доступа Telegram API:', {
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

      /*
       * The direct call that used to sit here is gone: `logger.error` above
       * already reaches the owner through winston's transport, so this was a
       * SECOND copy of one event -- and the copy skipped the throttle, which is
       * why a broken dependency in a shared handler produced two pushes per
       * failing update instead of one per window.
       */
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
// owner-scope: per process: the node handlers are registered once
let globalHandlersRegistered = false
export const setupGlobalErrorHandlers = (): void => {
  if (globalHandlersRegistered) return
  globalHandlersRegistered = true

  process.on('unhandledRejection', (reason, promise) => {
    /*
     * THE DISCRIMINATOR BELONGS IN THE MESSAGE, NOT ONLY IN THE META.
     *
     * Alerts are deduplicated by their message text, and this one was the same
     * constant string for every rejection in the process -- so two DIFFERENT
     * failures would have been reported as one incident and the second would
     * never be seen. The first line of the reason is enough to tell them apart
     * and short enough not to turn every repeat into a new incident.
     */
    const why = (
      reason instanceof Error ? reason.message : String(reason)
    ).split('\n')[0]
    logger.error(`Unhandled promise rejection: ${why.slice(0, 120)}`, {
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
