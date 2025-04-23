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
  response?: any
  description?: string
  stack?: string
}

// Типы ошибок для классификации
enum ErrorType {
  AUTH = 'AUTH',
  RATE_LIMIT = 'RATE_LIMIT',
  BLOCKED = 'BLOCKED',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  NETWORK = 'NETWORK',
  API = 'API',
  UNKNOWN = 'UNKNOWN',
}

// Функция для классификации ошибок Telegram API
function classifyTelegramError(error: TelegramError): ErrorType {
  const message = error.message?.toLowerCase() || ''
  const description = error.description?.toLowerCase() || ''

  if (message.includes('401: unauthorized') || message.includes('not found')) {
    return ErrorType.AUTH
  }

  if (
    message.includes('429: too many requests') ||
    description.includes('retry after')
  ) {
    return ErrorType.RATE_LIMIT
  }

  if (
    message.includes('403: forbidden') ||
    description.includes('blocked') ||
    description.includes('deactivated') ||
    description.includes('not enough rights') ||
    description.includes('bot was kicked')
  ) {
    return ErrorType.BLOCKED
  }

  if (
    message.includes('400: bad request') &&
    (description.includes('message to edit not found') ||
      description.includes('message is not modified') ||
      description.includes('message text is empty'))
  ) {
    return ErrorType.INVALID_MESSAGE
  }

  if (
    message.includes('network error') ||
    message.includes('socket') ||
    message.includes('timedout') ||
    message.includes('connection')
  ) {
    return ErrorType.NETWORK
  }

  if (message.includes('telegram')) {
    return ErrorType.API
  }

  return ErrorType.UNKNOWN
}

// Функция для подсчета ошибок
const errorCounts: Record<ErrorType, number> = {
  [ErrorType.AUTH]: 0,
  [ErrorType.RATE_LIMIT]: 0,
  [ErrorType.BLOCKED]: 0,
  [ErrorType.INVALID_MESSAGE]: 0,
  [ErrorType.NETWORK]: 0,
  [ErrorType.API]: 0,
  [ErrorType.UNKNOWN]: 0,
}

// Хранение таймера для возможности его очистки в тестах
let errorCountResetTimer: NodeJS.Timeout | null = null

// Периодически сбрасываем счетчики ошибок (каждый час)
errorCountResetTimer = setInterval(() => {
  Object.keys(errorCounts).forEach(key => {
    const type = key as ErrorType
    if (errorCounts[type] > 0) {
      logger.info(
        `🔄 Сброс счетчика ошибок ${type}. Было: ${errorCounts[type]}`
      )
      errorCounts[type] = 0
    }
  })
}, 3600000) // 1 час в миллисекундах

/**
 * Обработчик ошибок Telegram API для защиты от отказа всего приложения при проблемах с токенами
 * @param bot Экземпляр бота Telegraf
 */
export const setupErrorHandler = (bot: Telegraf<MyContext>): void => {
  bot.catch((err, ctx) => {
    // Типизируем ошибку
    const error = err as TelegramError

    // Классифицируем ошибку
    const errorType = classifyTelegramError(error)

    // Увеличиваем счетчик ошибок определенного типа
    errorCounts[errorType]++

    // Общая информация об ошибке для логирования
    const errorInfo = {
      error_type: errorType,
      description: error.description || error.message,
      bot_name: ctx?.botInfo?.username || 'unknown',
      error_message: error.message,
      error_code: error.code,
      method: error.on?.method || 'unknown',
      payload: error.on?.payload || {},
      update_id: ctx?.update?.update_id,
      user_id: ctx?.from?.id,
      chat_id: ctx?.chat?.id,
      timestamp: new Date().toISOString(),
      count: errorCounts[errorType],
    }

    // Логируем ошибку с разным уровнем в зависимости от типа
    switch (errorType) {
      case ErrorType.AUTH:
        logger.error('🔐 Ошибка авторизации Telegram API:', errorInfo)
        // Отправляем уведомление в канал поддержки о проблемах с авторизацией
        supportRequest('🚨 Ошибка авторизации Telegram API', errorInfo)
        break

      case ErrorType.RATE_LIMIT:
        logger.warn('⏱️ Превышен лимит запросов Telegram API:', errorInfo)
        // Если превышена квота много раз подряд - оповещаем поддержку
        if (errorCounts[ErrorType.RATE_LIMIT] > 10) {
          supportRequest('🚨 Превышен лимит запросов Telegram API', errorInfo)
        }
        break

      case ErrorType.BLOCKED:
        logger.warn('🚫 Бот заблокирован пользователем:', errorInfo)
        break

      case ErrorType.INVALID_MESSAGE:
        logger.debug('📝 Невозможно изменить сообщение:', errorInfo)
        break

      case ErrorType.NETWORK:
        logger.warn(
          '🌐 Сетевая ошибка при взаимодействии с Telegram API:',
          errorInfo
        )
        // При большом количестве сетевых ошибок оповещаем поддержку
        if (errorCounts[ErrorType.NETWORK] > 20) {
          supportRequest('🚨 Серия сетевых ошибок Telegram API', errorInfo)
        }
        break

      case ErrorType.API:
        logger.error('🔄 Ошибка API Telegram:', errorInfo)
        break

      default: // UNKNOWN
        logger.error('❓ Неизвестная ошибка Telegram API:', {
          ...errorInfo,
          stack: error.stack,
        })
        // Неизвестные ошибки всегда отправляем в поддержку
        if (errorCounts[ErrorType.UNKNOWN] > 3) {
          supportRequest('🚨 Серия неизвестных ошибок Telegram API', errorInfo)
        }
        break
    }

    // Пытаемся отправить пользователю сообщение об ошибке, если это критическая ошибка
    // и если у нас есть контекст с пользователем
    if (
      [ErrorType.AUTH, ErrorType.API, ErrorType.UNKNOWN].includes(errorType) &&
      ctx &&
      ctx.from &&
      ctx.chat &&
      ctx.telegram
    ) {
      try {
        // Сообщение для пользователя, максимально дружелюбное
        const errorMessage =
          '😔 Извините, произошла техническая ошибка. Мы уже работаем над её устранением. Пожалуйста, попробуйте позже или обратитесь в поддержку командой /support'

        // Отправляем сообщение пользователю только если это не ошибка отправки сообщения
        if (error.on?.method !== 'sendMessage') {
          ctx.telegram.sendMessage(ctx.chat.id, errorMessage).catch(e =>
            logger.error(
              'Не удалось отправить сообщение об ошибке пользователю:',
              {
                user_id: ctx.from?.id,
                error: e.message,
              }
            )
          )
        }
      } catch (e) {
        logger.error('Ошибка при попытке уведомить пользователя:', {
          original_error: errorInfo,
          notification_error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    // Возвращаем Promise<void>
    return Promise.resolve()
  })
}

/**
 * Очистка таймера сброса счетчиков ошибок - используется в тестах
 * для предотвращения открытых хэндлеров
 */
export const clearErrorHandlerTimers = (): void => {
  if (errorCountResetTimer) {
    clearInterval(errorCountResetTimer)
    errorCountResetTimer = null
  }
}
