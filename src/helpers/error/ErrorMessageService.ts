/**
 * ErrorMessageService - унифицированная система отправки сообщений об ошибках
 *
 * Консолидирует дублированную логику из:
 * - sendGenericErrorMessage.ts
 * - sendGenerationErrorMessage.ts
 * - sendServiceErrorToUser.ts
 *
 * Цель: устранить ~94 строки дублированного кода и унифицировать обработку ошибок
 */

import { MyContext } from '@/interfaces'
import { logger } from '@/utils/enhancedLogger'

/**
 * Типы ошибок для пользовательских сообщений
 */
export enum ErrorType {
  GENERIC = 'generic', // Общая ошибка
  GENERATION = 'generation', // Ошибка генерации контента
  INSUFFICIENT_FUNDS = 'insufficient_funds', // Недостаточно средств
  NETWORK = 'network', // Сетевая ошибка
  VALIDATION = 'validation', // Ошибка валидации
  SERVICE = 'service', // Ошибка сервиса
}

/**
 * Параметры для отправки сообщения об ошибке
 */
export interface ErrorMessageParams {
  ctx?: MyContext
  telegram_id?: string | number
  isRu: boolean
  errorType?: ErrorType
  error?: Error
  customMessage?: string
  showDetails?: boolean
}

/**
 * Шаблоны сообщений об ошибках
 */
const ERROR_MESSAGES: Record<
  ErrorType,
  { ru: string; en: string; emoji?: string }
> = {
  [ErrorType.GENERIC]: {
    ru: 'Произошла ошибка. Пожалуйста, попробуйте позже.',
    en: 'An error occurred. Please try again later.',
    emoji: '❌',
  },
  [ErrorType.GENERATION]: {
    ru: 'Произошла ошибка при генерации. Пожалуйста, попробуйте позже.',
    en: 'An error occurred while generating. Please try again later.',
    emoji: '❌',
  },
  [ErrorType.INSUFFICIENT_FUNDS]: {
    ru: 'Недостаточно средств на балансе. Пополните баланс в главном меню.',
    en: 'Insufficient funds. Top up your balance in the main menu.',
    emoji: '💰',
  },
  [ErrorType.NETWORK]: {
    ru: 'Ошибка сети. Пожалуйста, проверьте соединение и попробуйте снова.',
    en: 'Network error. Please check your connection and try again.',
    emoji: '🌐',
  },
  [ErrorType.VALIDATION]: {
    ru: 'Неверные данные. Пожалуйста, проверьте ввод и попробуйте снова.',
    en: 'Invalid data. Please check your input and try again.',
    emoji: '⚠️',
  },
  [ErrorType.SERVICE]: {
    ru: 'Произошла ошибка.',
    en: 'An error occurred.',
    emoji: '❌',
  },
}

/**
 * Класс для отправки сообщений об ошибках пользователям
 */
export class ErrorMessageService {
  /**
   * Отправляет сообщение об ошибке пользователю
   */
  static async send(params: ErrorMessageParams): Promise<void> {
    const {
      ctx,
      telegram_id,
      isRu,
      errorType = ErrorType.GENERIC,
      error,
      customMessage,
      showDetails = process.env.NODE_ENV === 'development',
    } = params

    try {
      // Определяем сообщение
      let message = customMessage || this.getErrorMessage(errorType, isRu)

      // Добавляем детали ошибки если нужно
      if (error && showDetails) {
        const detailsText = isRu
          ? `\n\nДетали ошибки: ${error.message}`
          : `\n\nError details: ${error.message}`
        message += detailsText
      }

      // Логируем ошибку
      if (error) {
        logger.error('❌ Error occurred, sending message to user:', {
          errorType,
          userId: ctx?.from?.id || telegram_id,
          username: ctx?.from?.username,
          chatId: ctx?.chat?.id,
          errorMessage: error.message,
          stack: error.stack,
        })
      }

      // Отправляем сообщение через ctx или напрямую через telegram API
      if (ctx) {
        await ctx.reply(message)
      } else if (ctx?.telegram && telegram_id) {
        await ctx.telegram.sendMessage(telegram_id.toString(), message)
      } else if (telegram_id) {
        logger.warn('⚠️ No context available to send error message', {
          telegram_id,
        })
      } else {
        logger.error('❌ Cannot send error message: no ctx or telegram_id', {
          errorType,
        })
      }

      logger.info('✅ Error message sent to user', {
        userId: ctx?.from?.id || telegram_id,
        errorType,
      })
    } catch (sendError) {
      // Логирование на случай, если не удалось отправить сообщение об ошибке
      logger.error('❌ Failed to send error message to user:', {
        userId: ctx?.from?.id || telegram_id,
        username: ctx?.from?.username,
        chatId: ctx?.chat?.id,
        originalError: error?.message,
        sendError: sendError instanceof Error ? sendError.message : 'Unknown',
      })
    }
  }

  /**
   * Получает сообщение об ошибке по типу и языку
   */
  private static getErrorMessage(errorType: ErrorType, isRu: boolean): string {
    const template = ERROR_MESSAGES[errorType]
    const message = isRu ? template.ru : template.en
    return template.emoji ? `${template.emoji} ${message}` : message
  }

  /**
   * Быстрые методы для распространенных типов ошибок
   */
  static async sendGenericError(
    ctx: MyContext,
    isRu: boolean,
    error?: Error
  ): Promise<void> {
    await this.send({ ctx, isRu, errorType: ErrorType.GENERIC, error })
  }

  static async sendGenerationError(
    ctx: MyContext,
    isRu: boolean
  ): Promise<void> {
    await this.send({ ctx, isRu, errorType: ErrorType.GENERATION })
  }

  static async sendServiceError(
    ctx: MyContext,
    telegram_id: string,
    error: Error,
    isRu: boolean
  ): Promise<void> {
    await this.send({
      ctx,
      telegram_id,
      isRu,
      errorType: ErrorType.SERVICE,
      error,
      showDetails: true,
    })
  }

  static async sendInsufficientFundsError(
    ctx: MyContext,
    isRu: boolean
  ): Promise<void> {
    await this.send({ ctx, isRu, errorType: ErrorType.INSUFFICIENT_FUNDS })
  }

  static async sendNetworkError(ctx: MyContext, isRu: boolean): Promise<void> {
    await this.send({ ctx, isRu, errorType: ErrorType.NETWORK })
  }

  static async sendValidationError(
    ctx: MyContext,
    isRu: boolean,
    customMessage?: string
  ): Promise<void> {
    await this.send({
      ctx,
      isRu,
      errorType: ErrorType.VALIDATION,
      customMessage,
    })
  }
}
