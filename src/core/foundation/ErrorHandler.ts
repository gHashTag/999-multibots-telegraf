/**
 * 🛡️ ЖЕЛЕЗОБЕТОННАЯ СИСТЕМА ОБРАБОТКИ ОШИБОК
 * Централизованная обработка всех типов ошибок
 * Предотвращает падения бота и обеспечивает graceful degradation
 */

import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { isRussianFromState } from './LanguageManager'
import { telegramLogService } from '@/services/telegram-log.service'

export enum ErrorType {
  VALIDATION = 'validation',
  NETWORK = 'network', 
  DATABASE = 'database',
  AUTHORIZATION = 'authorization',
  SUBSCRIPTION = 'subscription',
  SCENE_TRANSITION = 'scene_transition',
  FILE_PROCESSING = 'file_processing',
  API_INTEGRATION = 'api_integration',
  CONFIGURATION = 'configuration',
  UNKNOWN = 'unknown',
}

export interface ErrorContext {
  telegramId?: string
  username?: string
  sceneId?: string
  action?: string
  data?: any
}

export interface ErrorHandlingResult {
  handled: boolean
  userNotified: boolean
  shouldRetry: boolean
  fallbackAction?: () => Promise<void>
}

export class ErrorHandler {
  private static instance: ErrorHandler
  private errorCounts: Map<string, number> = new Map()
  private lastErrors: Map<string, Date> = new Map()
  private readonly MAX_ERRORS_PER_MINUTE = 5
  private readonly ERROR_RESET_INTERVAL = 60000 // 1 минута

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler()
    }
    return ErrorHandler.instance
  }

  /**
   * ГЛАВНАЯ ФУНКЦИЯ: Обработка ошибки
   */
  public async handleError(
    error: Error | any,
    ctx: MyContext | null,
    errorType: ErrorType = ErrorType.UNKNOWN,
    context: ErrorContext = {}
  ): Promise<ErrorHandlingResult> {
    const errorId = this.generateErrorId(error, context)
    
    // Защита от спама ошибок
    if (this.isErrorSpam(errorId)) {
      logger.warn('Error spam detected, throttling', { errorId })
      return { handled: true, userNotified: false, shouldRetry: false }
    }

    // Обогащаем контекст
    const enrichedContext = this.enrichContext(ctx, context)
    
    // Логируем ошибку
    this.logError(error, errorType, enrichedContext, errorId)

    // Определяем стратегию обработки
    const strategy = this.getErrorStrategy(errorType, error)

    // Уведомляем пользователя (если возможно)
    let userNotified = false
    if (ctx && strategy.notifyUser) {
      try {
        await this.notifyUser(ctx, errorType, strategy.userMessage)
        userNotified = true
      } catch (notificationError) {
        logger.error('Failed to notify user about error', {
          originalError: errorId,
          notificationError: notificationError instanceof Error ? notificationError.message : String(notificationError),
        })
      }
    }

    // Выполняем fallback действие
    let fallbackAction: (() => Promise<void>) | undefined
    if (strategy.fallback && ctx) {
      fallbackAction = async () => {
        try {
          await strategy.fallback!(ctx)
        } catch (fallbackError) {
          logger.error('Fallback action failed', {
            originalError: errorId,
            fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          })
        }
      }
    }

    // Уведомляем администраторов о критических ошибках
    if (strategy.notifyAdmin) {
      this.notifyAdmin(error, errorType, enrichedContext, errorId)
    }

    return {
      handled: true,
      userNotified,
      shouldRetry: strategy.shouldRetry,
      fallbackAction,
    }
  }

  /**
   * Специализированные обработчики для разных типов ошибок
   */
  public async handleSceneTransitionError(
    error: Error,
    ctx: MyContext,
    targetScene: string
  ): Promise<void> {
    await this.handleError(error, ctx, ErrorType.SCENE_TRANSITION, {
      action: 'scene_transition',
      data: { targetScene, currentScene: ctx.scene.current?.id },
    })

    // Fallback: возврат в главное меню
    try {
      if (ctx.scene.current) {
        await ctx.scene.leave()
      }
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
    } catch (fallbackError) {
      logger.error('Failed to return to main menu after scene transition error', {
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      })
    }
  }

  public async handleApiError(
    error: Error | any,
    ctx: MyContext | null,
    apiName: string,
    operation: string
  ): Promise<ErrorHandlingResult> {
    return await this.handleError(error, ctx, ErrorType.API_INTEGRATION, {
      action: `${apiName}_${operation}`,
      data: { apiName, operation },
    })
  }

  public async handleDatabaseError(
    error: Error,
    ctx: MyContext | null,
    operation: string
  ): Promise<ErrorHandlingResult> {
    return await this.handleError(error, ctx, ErrorType.DATABASE, {
      action: `db_${operation}`,
      data: { operation },
    })
  }

  public async handleSubscriptionError(
    error: Error,
    ctx: MyContext,
    service: string
  ): Promise<ErrorHandlingResult> {
    return await this.handleError(error, ctx, ErrorType.SUBSCRIPTION, {
      action: 'subscription_check',
      data: { service },
    })
  }

  /**
   * Генерация уникального ID ошибки
   */
  private generateErrorId(error: Error | any, context: ErrorContext): string {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const contextStr = JSON.stringify(context)
    return `${Date.now()}_${Buffer.from(errorMessage + contextStr).toString('base64').substring(0, 10)}`
  }

  /**
   * Проверка на спам ошибок
   */
  private isErrorSpam(errorId: string): boolean {
    const now = new Date()
    const lastError = this.lastErrors.get(errorId)
    const errorCount = this.errorCounts.get(errorId) || 0

    if (lastError && (now.getTime() - lastError.getTime()) < this.ERROR_RESET_INTERVAL) {
      if (errorCount >= this.MAX_ERRORS_PER_MINUTE) {
        return true
      }
      this.errorCounts.set(errorId, errorCount + 1)
    } else {
      this.errorCounts.set(errorId, 1)
      this.lastErrors.set(errorId, now)
    }

    return false
  }

  /**
   * Обогащение контекста ошибки
   */
  private enrichContext(ctx: MyContext | null, context: ErrorContext): ErrorContext {
    if (!ctx) return context

    return {
      ...context,
      telegramId: context.telegramId || ctx.from?.id?.toString(),
      username: context.username || ctx.from?.username,
      sceneId: context.sceneId || ctx.scene.current?.id,
    }
  }

  /**
   * Логирование ошибки
   */
  private logError(
    error: Error | any,
    errorType: ErrorType,
    context: ErrorContext,
    errorId: string
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    logger.error(`[${errorType.toUpperCase()}] Error occurred`, {
      errorId,
      message: errorMessage,
      stack,
      context,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Получение стратегии обработки ошибки
   */
  private getErrorStrategy(errorType: ErrorType, error: Error | any): {
    notifyUser: boolean
    notifyAdmin: boolean
    shouldRetry: boolean
    userMessage: { ru: string; en: string }
    fallback?: (ctx: MyContext) => Promise<void>
  } {
    switch (errorType) {
      case ErrorType.NETWORK:
        return {
          notifyUser: true,
          notifyAdmin: false,
          shouldRetry: true,
          userMessage: {
            ru: '🌐 Проблемы с сетью. Пожалуйста, попробуйте позже.',
            en: '🌐 Network issues. Please try again later.',
          },
        }

      case ErrorType.DATABASE:
        return {
          notifyUser: true,
          notifyAdmin: true,
          shouldRetry: true,
          userMessage: {
            ru: '💾 Временные проблемы с базой данных. Попробуйте позже.',
            en: '💾 Temporary database issues. Please try again later.',
          },
        }

      case ErrorType.AUTHORIZATION:
        return {
          notifyUser: true,
          notifyAdmin: false,
          shouldRetry: false,
          userMessage: {
            ru: '🔒 Проблемы с авторизацией. Обратитесь в поддержку.',
            en: '🔒 Authorization issues. Please contact support.',
          },
        }

      case ErrorType.SUBSCRIPTION:
        return {
          notifyUser: true,
          notifyAdmin: false,
          shouldRetry: false,
          userMessage: {
            ru: '💳 Проблемы с подпиской. Проверьте статус подписки.',
            en: '💳 Subscription issues. Please check your subscription status.',
          },
          fallback: async (ctx) => {
            await ctx.scene.enter(ModeEnum.SubscriptionScene)
          },
        }

      case ErrorType.SCENE_TRANSITION:
        return {
          notifyUser: true,
          notifyAdmin: true,
          shouldRetry: false,
          userMessage: {
            ru: '🔄 Проблемы с навигацией. Возвращаемся в главное меню.',
            en: '🔄 Navigation issues. Returning to main menu.',
          },
          fallback: async (ctx) => {
            if (ctx.scene.current) {
              await ctx.scene.leave()
            }
            await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
          },
        }

      case ErrorType.API_INTEGRATION:
        return {
          notifyUser: true,
          notifyAdmin: true,
          shouldRetry: true,
          userMessage: {
            ru: '🤖 Сервис временно недоступен. Попробуйте позже.',
            en: '🤖 Service temporarily unavailable. Please try again later.',
          },
        }

      case ErrorType.CONFIGURATION:
        return {
          notifyUser: true,
          notifyAdmin: true,
          shouldRetry: false,
          userMessage: {
            ru: '⚙️ Проблемы с конфигурацией. Обратитесь в поддержку.',
            en: '⚙️ Configuration issues. Please contact support.',
          },
        }

      case ErrorType.VALIDATION:
        return {
          notifyUser: true,
          notifyAdmin: false,
          shouldRetry: false,
          userMessage: {
            ru: '❌ Некорректные данные. Проверьте введенную информацию.',
            en: '❌ Invalid data. Please check the entered information.',
          },
        }

      default:
        return {
          notifyUser: true,
          notifyAdmin: true,
          shouldRetry: false,
          userMessage: {
            ru: '🔧 Произошла неожиданная ошибка. Мы уже работаем над исправлением.',
            en: '🔧 An unexpected error occurred. We are already working on a fix.',
          },
        }
    }
  }

  /**
   * Уведомление пользователя об ошибке
   */
  private async notifyUser(
    ctx: MyContext,
    errorType: ErrorType,
    userMessage: { ru: string; en: string }
  ): Promise<void> {
    const isRu = isRussianFromState(ctx)
    const message = isRu ? userMessage.ru : userMessage.en

    try {
      await ctx.reply(message)
    } catch (replyError) {
      // Если не можем отправить обычное сообщение, пробуем answerCbQuery
      if ('answerCbQuery' in ctx && typeof ctx.answerCbQuery === 'function') {
        try {
          await ctx.answerCbQuery(message)
        } catch (cbError) {
          throw replyError // Возвращаем оригинальную ошибку
        }
      } else {
        throw replyError
      }
    }
  }

  /**
   * Уведомление администраторов
   */
  private async notifyAdmin(
    error: Error | any,
    errorType: ErrorType,
    context: ErrorContext,
    errorId: string
  ): Promise<void> {
    try {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Отправляем в группу НейроМентор
      await telegramLogService.logError({
        telegramId: context.telegramId,
        username: context.username,
        error: errorMessage,
        context: `[${errorType.toUpperCase()}] ${context.action || context.sceneId || 'unknown'}`,
      })

      logger.info('Admin notification sent to НейроМентор', {
        errorId,
        errorType,
        context,
      })
    } catch (notificationError) {
      logger.error('Failed to notify admin', {
        notificationError: notificationError instanceof Error ? notificationError.message : String(notificationError),
      })
    }
  }

  /**
   * Получение статистики ошибок
   */
  public getErrorStats(): { totalErrors: number; errorTypes: Record<string, number> } {
    return {
      totalErrors: this.errorCounts.size,
      errorTypes: Object.fromEntries(this.errorCounts),
    }
  }

  /**
   * Очистка статистики ошибок
   */
  public clearErrorStats(): void {
    this.errorCounts.clear()
    this.lastErrors.clear()
  }
}

// Экспорт singleton экземпляра
export const errorHandler = ErrorHandler.getInstance()

// Функции-обертки для удобства использования
export const handleError = (
  error: Error | any,
  ctx: MyContext | null,
  errorType: ErrorType = ErrorType.UNKNOWN,
  context: ErrorContext = {}
) => errorHandler.handleError(error, ctx, errorType, context)

export const handleSceneError = (error: Error, ctx: MyContext, targetScene: string) =>
  errorHandler.handleSceneTransitionError(error, ctx, targetScene)

export const handleApiError = (error: Error | any, ctx: MyContext | null, apiName: string, operation: string) =>
  errorHandler.handleApiError(error, ctx, apiName, operation)