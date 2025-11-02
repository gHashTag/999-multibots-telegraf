/**
 * Generic Wizard Button Handler Utilities
 *
 * Provides reusable button handling patterns for various wizard scenes
 * with consistent error handling and fallback mechanisms.
 */

import { MyContext } from '@/interfaces'
import { logger } from './logger'
import { handleButtonError, sanitizeInput } from './buttonMapping'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export interface WizardButtonHandler<T = any> {
  /**
   * Validates the callback data and context
   */
  validate?: (ctx: MyContext, callbackData: string) => Promise<{ isValid: boolean; error?: string }>

  /**
   * Handles the callback action
   */
  handle: (ctx: MyContext, callbackData: string, data?: T) => Promise<{
    success: boolean
    error?: string
    shouldExit?: boolean
    nextStep?: boolean
  }>

  /**
   * Error fallback function
   */
  onError?: (ctx: MyContext, error: Error) => Promise<void>
}

/**
 * Creates a generic callback query handler for wizard scenes
 */
export function createWizardCallbackHandler<T = any>(
  handlerName: string,
  handlers: Record<string, WizardButtonHandler<T>>
) {
  return async (ctx: MyContext) => {
    const isRu = isRussianFromState(ctx)

    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
        const message = isRu
          ? 'Произошла ошибка ответа от кнопки'
          : 'Button callback error'
        logger.warn(`[${handlerName}] Invalid callback query`, {
          telegramId: ctx.from?.id,
          hasCallbackQuery: !!ctx.callbackQuery,
          hasData: ctx.callbackQuery ? 'data' in ctx.callbackQuery : false
        })
        return ctx.answerCbQuery(message)
      }

      const callbackData = sanitizeInput(ctx.callbackQuery.data)
      logger.debug(`[${handlerName}] Processing callback`, {
        telegramId: ctx.from?.id,
        callbackData,
        sanitized: callbackData !== ctx.callbackQuery.data
      })

      await ctx.answerCbQuery()

      // Find the appropriate handler
      let selectedHandler: WizardButtonHandler<T> | undefined
      let matchedPattern: string | undefined

      for (const [pattern, handler] of Object.entries(handlers)) {
        if (callbackData === pattern || callbackData.startsWith(pattern + '_')) {
          selectedHandler = handler
          matchedPattern = pattern
          break
        }
      }

      if (!selectedHandler) {
        logger.warn(`[${handlerName}] No handler found for callback`, {
          telegramId: ctx.from?.id,
          callbackData,
          availableHandlers: Object.keys(handlers)
        })

        await ctx.reply(
          isRu
            ? '❌ Неизвестная команда. Попробуйте снова.'
            : '❌ Unknown command. Please try again.'
        )
        return
      }

      // Validate if handler has validation
      if (selectedHandler.validate) {
        const validation = await selectedHandler.validate(ctx, callbackData)
        if (!validation.isValid) {
          logger.warn(`[${handlerName}] Validation failed for ${matchedPattern}`, {
            telegramId: ctx.from?.id,
            callbackData,
            error: validation.error
          })

          await ctx.reply(
            isRu
              ? `❌ Ошибка проверки: ${validation.error}`
              : `❌ Validation error: ${validation.error}`
          )
          return
        }
      }

      // Handle the callback
      const result = await selectedHandler.handle(ctx, callbackData)

      if (!result.success) {
        logger.error(`[${handlerName}] Handler failed for ${matchedPattern}`, {
          telegramId: ctx.from?.id,
          callbackData,
          error: result.error
        })

        if (selectedHandler.onError) {
          await selectedHandler.onError(ctx, new Error(result.error || 'Handler failed'))
        } else {
          await ctx.reply(
            isRu
              ? `❌ Ошибка обработки: ${result.error || 'Неизвестная ошибка'}`
              : `❌ Processing error: ${result.error || 'Unknown error'}`
          )
        }
        return
      }

      // Handle result actions
      if (result.shouldExit) {
        logger.info(`[${handlerName}] Exiting wizard`, {
          telegramId: ctx.from?.id,
          pattern: matchedPattern
        })
        return ctx.scene.leave()
      }

      if (result.nextStep) {
        logger.info(`[${handlerName}] Moving to next wizard step`, {
          telegramId: ctx.from?.id,
          pattern: matchedPattern
        })
        ctx.wizard.next()
      }

      logger.debug(`[${handlerName}] Callback handled successfully`, {
        telegramId: ctx.from?.id,
        pattern: matchedPattern,
        result
      })

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      logger.error(`[${handlerName}] Unexpected error in callback handler`, {
        telegramId: ctx.from?.id,
        error: errorObj.message,
        stack: errorObj.stack
      })

      handleButtonError(ctx, errorObj, async () => {
        logger.error(`[${handlerName}] Error in callback handler`, { error: errorObj.message })
      })
    }
  }
}

/**
 * Creates standard handlers for common wizard patterns
 */
export function createStandardWizardHandlers(
  wizardName: string,
  options: {
    cancelCallback?: string
    onCancel?: (ctx: MyContext) => Promise<void>
    onError?: (ctx: MyContext, error: Error) => Promise<void>
  } = {}
): Record<string, WizardButtonHandler> {
  const handlers: Record<string, WizardButtonHandler> = {}

  // Standard cancel handler
  const cancelCallback = options.cancelCallback || `cancel_${wizardName.toLowerCase()}`
  handlers[cancelCallback] = {
    handle: async (ctx: MyContext) => {
      const isRu = isRussianFromState(ctx)

      if (options.onCancel) {
        await options.onCancel(ctx)
      } else {
        await ctx.reply(
          isRu ? 'Отменено.' : 'Cancelled.'
        )

        // Import handleMenu dynamically to avoid circular imports
        const { handleMenu } = await import('@/handlers')
        await handleMenu(ctx)
      }

      return {
        success: true,
        shouldExit: true
      }
    },
    onError: options.onError
  }

  return handlers
}

/**
 * Adds input validation for text-based wizard steps
 */
export function validateWizardTextInput(
  text: string,
  options: {
    minLength?: number
    maxLength?: number
    pattern?: RegExp
    isRussian?: boolean
  } = {}
): { isValid: boolean; error?: string; sanitized?: string } {
  if (!text || typeof text !== 'string') {
    return {
      isValid: false,
      error: options.isRussian
        ? 'Текст не может быть пустым'
        : 'Text cannot be empty'
    }
  }

  const sanitized = sanitizeInput(text)

  if (options.minLength && sanitized.length < options.minLength) {
    return {
      isValid: false,
      error: options.isRussian
        ? `Минимальная длина: ${options.minLength} символов`
        : `Minimum length: ${options.minLength} characters`,
      sanitized
    }
  }

  if (options.maxLength && sanitized.length > options.maxLength) {
    return {
      isValid: false,
      error: options.isRussian
        ? `Максимальная длина: ${options.maxLength} символов`
        : `Maximum length: ${options.maxLength} characters`,
      sanitized
    }
  }

  if (options.pattern && !options.pattern.test(sanitized)) {
    return {
      isValid: false,
      error: options.isRussian
        ? 'Неверный формат текста'
        : 'Invalid text format',
      sanitized
    }
  }

  return {
    isValid: true,
    sanitized
  }
}

/**
 * Creates a safe error boundary for wizard operations
 */
export function createWizardErrorBoundary(
  operationName: string,
  fallbackToMainMenu: boolean = true
) {
  return async (ctx: MyContext, operation: () => Promise<any>) => {
    const isRu = isRussianFromState(ctx)

    try {
      return await operation()
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))

      logger.error(`[${operationName}] Operation failed`, {
        telegramId: ctx.from?.id,
        error: errorObj.message,
        stack: errorObj.stack
      })

      handleButtonError(ctx, errorObj, async () => {
        logger.error(`[${operationName}] Operation failed`, { error: errorObj.message })
      })

      throw errorObj // Re-throw for caller to handle if needed
    }
  }
}