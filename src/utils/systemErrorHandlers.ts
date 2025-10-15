/**
 * System-wide Error Handlers
 *
 * Provides comprehensive error handling and recovery mechanisms
 * for the entire Telegram bot system, with special focus on
 * button mapping and callback query failures.
 */

import { MyContext } from '@/interfaces'
import { logger } from './logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export interface SystemErrorContext {
  telegramId?: string
  username?: string
  sceneName?: string
  operationName?: string
  callbackData?: string
  buttonText?: string
  additionalData?: Record<string, any>
}

export interface ErrorRecoveryOptions {
  /**
   * Whether to return to main menu on error
   */
  returnToMainMenu?: boolean

  /**
   * Custom error message to show user
   */
  customMessage?: string

  /**
   * Whether to log the full error stack
   */
  logFullStack?: boolean

  /**
   * Callback for custom recovery actions
   */
  customRecovery?: (ctx: MyContext, error: Error) => Promise<void>

  /**
   * Whether to suppress user notification (for silent errors)
   */
  silent?: boolean

  /**
   * Maximum number of retry attempts
   */
  maxRetries?: number
}

/**
 * Main system error handler with comprehensive recovery
 */
export async function handleSystemError(
  ctx: MyContext,
  error: Error | string,
  context: SystemErrorContext = {},
  options: ErrorRecoveryOptions = {}
): Promise<void> {
  const errorObj = error instanceof Error ? error : new Error(String(error))
  const isRu = isRussianFromState(ctx)

  // Comprehensive error logging
  const logContext = {
    ...context,
    telegramId: context.telegramId || ctx.from?.id?.toString(),
    username: context.username || ctx.from?.username,
    errorMessage: errorObj.message,
    errorType: errorObj.name,
    ...(options.logFullStack && { stack: errorObj.stack })
  }

  logger.error('[SystemError] Comprehensive error handler triggered', logContext)

  try {
    // Execute custom recovery if provided
    if (options.customRecovery) {
      await options.customRecovery(ctx, errorObj)
      return
    }

    // Determine error message
    let userMessage = ''
    if (options.customMessage) {
      userMessage = options.customMessage
    } else {
      // Standard error messages based on error type
      if (errorObj.message.includes('BUTTON_DATA_INVALID')) {
        userMessage = isRu
          ? '❌ Ошибка обработки кнопки. Попробуйте выбрать опцию заново.'
          : '❌ Button processing error. Please try selecting the option again.'
      } else if (errorObj.message.includes('callback')) {
        userMessage = isRu
          ? '❌ Ошибка обработки команды. Попробуйте снова.'
          : '❌ Command processing error. Please try again.'
      } else if (errorObj.message.includes('validation')) {
        userMessage = isRu
          ? '❌ Ошибка проверки данных. Проверьте введенную информацию.'
          : '❌ Data validation error. Please check your input.'
      } else {
        userMessage = isRu
          ? '❌ Произошла ошибка. Мы работаем над её устранением.'
          : '❌ An error occurred. We are working to resolve it.'
      }
    }

    // Send error message to user (unless silent)
    if (!options.silent && userMessage) {
      await ctx.reply(userMessage)
    }

    // Handle scene exit and return to main menu
    if (options.returnToMainMenu !== false) {
      try {
        // Leave current scene if in one
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }

        // Import and call handleMenu
        const { handleMenu } = await import('@/handlers/handleMenu')
        await handleMenu(ctx)

        logger.info('[SystemError] Successfully returned user to main menu', {
          telegramId: context.telegramId
        })
      } catch (menuError) {
        logger.error('[SystemError] Failed to return to main menu', {
          telegramId: context.telegramId,
          menuError: menuError instanceof Error ? menuError.message : String(menuError)
        })

        // Final fallback - try to enter main menu scene directly
        try {
          await ctx.scene.enter('main_menu')
        } catch (sceneError) {
          logger.error('[SystemError] Final fallback failed', {
            telegramId: context.telegramId,
            sceneError: sceneError instanceof Error ? sceneError.message : String(sceneError)
          })
        }
      }
    }

  } catch (handlerError) {
    // Error in error handler itself
    const handlerErrorObj = handlerError instanceof Error ? handlerError : new Error(String(handlerError))

    logger.error('[SystemError] Error in error handler', {
      ...logContext,
      handlerError: handlerErrorObj.message,
      handlerStack: handlerErrorObj.stack
    })

    // Absolute final fallback
    try {
      await ctx.reply(
        isRu
          ? '❌ Критическая ошибка. Используйте /start для перезапуска.'
          : '❌ Critical error. Use /start to restart.'
      )
    } catch {
      // If even this fails, just log it
      logger.error('[SystemError] Complete failure - cannot send message to user', {
        telegramId: context.telegramId
      })
    }
  }
}

/**
 * Specialized handler for callback query errors
 */
export async function handleCallbackQueryError(
  ctx: MyContext,
  error: Error | string,
  callbackData: string,
  context: Omit<SystemErrorContext, 'callbackData'> = {},
  options: ErrorRecoveryOptions = {}
): Promise<void> {
  await handleSystemError(
    ctx,
    error,
    {
      ...context,
      callbackData,
      operationName: 'callback_query_processing'
    },
    {
      customMessage: isRussianFromState(ctx)
        ? '❌ Ошибка обработки команды. Попробуйте выбрать опцию заново.'
        : '❌ Command processing error. Please try selecting the option again.',
      ...options
    }
  )
}

/**
 * Specialized handler for button mapping errors
 */
export async function handleButtonMappingError(
  ctx: MyContext,
  error: Error | string,
  buttonText: string,
  callbackData: string,
  context: Omit<SystemErrorContext, 'buttonText' | 'callbackData'> = {},
  options: ErrorRecoveryOptions = {}
): Promise<void> {
  await handleSystemError(
    ctx,
    error,
    {
      ...context,
      buttonText,
      callbackData,
      operationName: 'button_mapping'
    },
    {
      customMessage: isRussianFromState(ctx)
        ? '❌ Ошибка обработки кнопки. Интерфейс будет перезагружен.'
        : '❌ Button processing error. Interface will be reloaded.',
      ...options
    }
  )
}

/**
 * Specialized handler for model selection errors
 */
export async function handleModelSelectionError(
  ctx: MyContext,
  error: Error | string,
  modelInfo: {
    modelId?: string | number
    modelName?: string
    callbackData?: string
  },
  context: Omit<SystemErrorContext, 'additionalData'> = {},
  options: ErrorRecoveryOptions = {}
): Promise<void> {
  await handleSystemError(
    ctx,
    error,
    {
      ...context,
      operationName: 'model_selection',
      additionalData: modelInfo
    },
    {
      customMessage: isRussianFromState(ctx)
        ? '❌ Ошибка выбора модели. Попробуйте выбрать другую модель.'
        : '❌ Model selection error. Please try selecting a different model.',
      ...options
    }
  )
}

/**
 * Creates a safe wrapper for async operations with automatic error handling
 */
export function createSafeAsyncWrapper(
  operationName: string,
  defaultOptions: ErrorRecoveryOptions = {}
) {
  return <T extends any[], R>(
    operation: (ctx: MyContext, ...args: T) => Promise<R>
  ) => {
    return async (ctx: MyContext, ...args: T): Promise<R | void> => {
      try {
        return await operation(ctx, ...args)
      } catch (error) {
        await handleSystemError(
          ctx,
          error instanceof Error ? error : new Error(String(error)),
          {
            operationName,
            telegramId: ctx.from?.id?.toString(),
            username: ctx.from?.username
          },
          defaultOptions
        )

        // Re-throw if caller needs to handle it
        if (defaultOptions.maxRetries === 0) {
          throw error
        }
      }
    }
  }
}

/**
 * Validates system state and handles inconsistencies
 */
export async function validateAndRecoverSystemState(
  ctx: MyContext,
  expectedState: {
    shouldHaveSession?: boolean
    shouldBeInScene?: string
    requiredSessionFields?: string[]
  }
): Promise<{ isValid: boolean; recovered: boolean; errors: string[] }> {
  const errors: string[] = []
  let recovered = false

  try {
    // Check session exists
    if (expectedState.shouldHaveSession && !ctx.session) {
      errors.push('Session missing')

      // Try to recover by initializing session
      ctx.session = {} as any
      recovered = true

      logger.info('[SystemValidation] Recovered missing session', {
        telegramId: ctx.from?.id?.toString()
      })
    }

    // Check scene state
    if (expectedState.shouldBeInScene && ctx.scene.current?.id !== expectedState.shouldBeInScene) {
      errors.push(`Wrong scene: expected ${expectedState.shouldBeInScene}, got ${ctx.scene.current?.id || 'none'}`)

      // Try to recover by entering correct scene
      try {
        await ctx.scene.enter(expectedState.shouldBeInScene)
        recovered = true

        logger.info('[SystemValidation] Recovered wrong scene', {
          telegramId: ctx.from?.id?.toString(),
          expectedScene: expectedState.shouldBeInScene,
          previousScene: ctx.scene.current?.id
        })
      } catch (sceneError) {
        logger.warn('[SystemValidation] Could not recover scene state', {
          telegramId: ctx.from?.id?.toString(),
          error: sceneError instanceof Error ? sceneError.message : String(sceneError)
        })
      }
    }

    // Check required session fields
    if (expectedState.requiredSessionFields && ctx.session) {
      for (const field of expectedState.requiredSessionFields) {
        if (!ctx.session[field]) {
          errors.push(`Missing session field: ${field}`)
        }
      }
    }

    const isValid = errors.length === 0

    if (!isValid) {
      logger.warn('[SystemValidation] System state validation failed', {
        telegramId: ctx.from?.id?.toString(),
        errors,
        recovered,
        expectedState
      })
    }

    return { isValid, recovered, errors }

  } catch (validationError) {
    logger.error('[SystemValidation] Error during system state validation', {
      telegramId: ctx.from?.id?.toString(),
      error: validationError instanceof Error ? validationError.message : String(validationError)
    })

    return {
      isValid: false,
      recovered: false,
      errors: [...errors, 'Validation process failed']
    }
  }
}