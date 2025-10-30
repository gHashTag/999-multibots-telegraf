/**
 * Button Error Handling Middleware
 *
 * Global middleware that catches and handles button-related errors,
 * particularly BUTTON_DATA_INVALID errors from Telegram API.
 */

import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { handleCallbackQueryError } from '@/utils/systemErrorHandlers'
import { validateCallbackData } from '@/utils/buttonMapping'

/**
 * Middleware to handle callback query errors globally
 */
export function createButtonErrorMiddleware() {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    // Only process callback queries
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return next()
    }

    const callbackData = ctx.callbackQuery.data
    const telegramId = ctx.from?.id?.toString()

    try {
      // Validate callback data before processing
      const validation = validateCallbackData(callbackData)

      if (!validation.isValid) {
        logger.warn('[ButtonErrorMiddleware] Invalid callback data detected', {
          telegramId,
          callbackData,
          error: validation.error
        })

        await handleCallbackQueryError(
          ctx,
          new Error(`Invalid callback data: ${validation.error}`),
          callbackData,
          {
            telegramId,
            operationName: 'callback_validation'
          },
          {
            silent: false,
            returnToMainMenu: true
          }
        )

        return
      }

      // Log callback processing
      logger.debug('[ButtonErrorMiddleware] Processing valid callback', {
        telegramId,
        callbackData: callbackData.substring(0, 50) + (callbackData.length > 50 ? '...' : ''),
        username: ctx.from?.username
      })

      // Continue to next middleware/handler
      await next()

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))

      // Check if this is a BUTTON_DATA_INVALID error
      if (errorObj.message.includes('BUTTON_DATA_INVALID') ||
          errorObj.message.includes('400: Bad Request: invalid button') ||
          errorObj.message.includes('callback query is too old')) {

        logger.error('[ButtonErrorMiddleware] Button data invalid error caught', {
          telegramId,
          callbackData,
          error: errorObj.message,
          stack: errorObj.stack
        })

        await handleCallbackQueryError(
          ctx,
          errorObj,
          callbackData,
          {
            telegramId,
            username: ctx.from?.username,
            operationName: 'callback_processing'
          },
          {
            customMessage: ctx.session?.userLanguage === 'en'
              ? '❌ This button is no longer valid. Please try again from the menu.'
              : '❌ Эта кнопка больше не действительна. Попробуйте снова из меню.',
            returnToMainMenu: true,
            silent: false
          }
        )

        return
      }

      // Handle other callback-related errors
      if (errorObj.message.includes('callback') ||
          errorObj.message.includes('answerCbQuery') ||
          errorObj.message.includes('inline keyboard')) {

        logger.error('[ButtonErrorMiddleware] Callback processing error caught', {
          telegramId,
          callbackData,
          error: errorObj.message
        })

        await handleCallbackQueryError(
          ctx,
          errorObj,
          callbackData,
          {
            telegramId,
            username: ctx.from?.username,
            operationName: 'callback_error_handling'
          }
        )

        return
      }

      // For other errors, re-throw to be handled by general error handlers
      throw error
    }
  }
}

/**
 * Middleware to validate button state before callback processing
 */
export function createButtonStateValidationMiddleware() {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return next()
    }

    const callbackData = ctx.callbackQuery.data
    const telegramId = ctx.from?.id?.toString()

    try {
      // Check if callback data exceeds Telegram limits
      if (callbackData.length > 64) {
        logger.warn('[ButtonStateValidation] Callback data exceeds limit', {
          telegramId,
          callbackDataLength: callbackData.length,
          callbackData: callbackData.substring(0, 50) + '...'
        })

        await ctx.answerCbQuery(
          ctx.session?.userLanguage === 'en'
            ? 'Invalid button data'
            : 'Некорректные данные кнопки'
        )

        return
      }

      // Check for potentially dangerous characters
      if (/[<>\"'&\x00-\x1f\x7f-\x9f]/.test(callbackData)) {
        logger.warn('[ButtonStateValidation] Potentially dangerous callback data', {
          telegramId,
          callbackData,
          dangerousChars: callbackData.match(/[<>\"'&\x00-\x1f\x7f-\x9f]/g)
        })

        await ctx.answerCbQuery(
          ctx.session?.userLanguage === 'en'
            ? 'Invalid characters detected'
            : 'Обнаружены недопустимые символы'
        )

        return
      }

      await next()

    } catch (error) {
      logger.error('[ButtonStateValidation] Error in button state validation', {
        telegramId,
        callbackData,
        error: error instanceof Error ? error.message : String(error)
      })

      // Fallback to general error handling
      await handleCallbackQueryError(
        ctx,
        error instanceof Error ? error : new Error(String(error)),
        callbackData,
        {
          telegramId,
          operationName: 'button_state_validation'
        }
      )
    }
  }
}

/**
 * Middleware to add callback query timeout handling
 */
export function createCallbackTimeoutMiddleware(timeoutMs: number = 5000) {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    if (!ctx.callbackQuery) {
      return next()
    }

    const telegramId = ctx.from?.id?.toString()

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Callback processing timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      })

      // Race between actual processing and timeout
      await Promise.race([
        next(),
        timeoutPromise
      ])

    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warn('[CallbackTimeout] Callback processing timed out', {
          telegramId,
          callbackData: 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : 'unknown',
          timeoutMs
        })

        await ctx.answerCbQuery(
          ctx.session?.userLanguage === 'en'
            ? 'Processing timed out. Please try again.'
            : 'Время обработки истекло. Попробуйте снова.'
        )

        return
      }

      throw error
    }
  }
}

/**
 * Combined middleware that includes all button error handling features
 */
export function createComprehensiveButtonMiddleware(options: {
  timeoutMs?: number
  enableValidation?: boolean
  enableErrorHandling?: boolean
} = {}) {
  const middlewares = []

  if (options.enableValidation !== false) {
    middlewares.push(createButtonStateValidationMiddleware())
  }

  if (options.timeoutMs) {
    middlewares.push(createCallbackTimeoutMiddleware(options.timeoutMs))
  }

  if (options.enableErrorHandling !== false) {
    middlewares.push(createButtonErrorMiddleware())
  }

  // Return composed middleware
  return async (ctx: MyContext, next: () => Promise<void>) => {
    let currentNext = next

    // Chain middlewares in reverse order
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i]
      const nextMiddleware = currentNext

      currentNext = async () => {
        await middleware(ctx, nextMiddleware)
      }
    }

    await currentNext()
  }
}