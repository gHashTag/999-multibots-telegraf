/**
 * 🚨 EMERGENCY ERROR HANDLER
 * Provides graceful error handling and main menu fallback for critical bot functions
 */

import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export interface ErrorHandlerOptions {
  errorMessage?: string
  fallbackToMenu?: boolean
  logContext?: Record<string, any>
}

/**
 * Wraps any async function with error handling and main menu fallback
 */
export async function withErrorHandler<T>(
  ctx: MyContext,
  operation: () => Promise<T>,
  options: ErrorHandlerOptions = {}
): Promise<T | null> {
  const { errorMessage, fallbackToMenu = true, logContext = {} } = options

  const telegramId = ctx.from?.id?.toString()
  const isRu = await isRussianFromState(ctx)

  try {
    return await operation()
  } catch (error) {
    // Log the error with context
    logger.error('[ErrorHandler] Operation failed', {
      telegramId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ...logContext,
    })

    // Send user-friendly error message
    const userMessage =
      errorMessage ||
      (isRu
        ? '❌ Функция временно недоступна. Возвращаю в главное меню.'
        : '❌ Feature temporarily unavailable. Returning to main menu.')

    await ctx.reply(userMessage, {
      reply_markup: { remove_keyboard: true },
    })

    // Fallback to main menu if requested
    if (fallbackToMenu) {
      try {
        await ctx.scene.leave()
        // The main menu will be triggered by the command handler
        await ctx.reply(isRu ? '/start' : '/start')
      } catch (navigationError) {
        logger.error('[ErrorHandler] Menu navigation failed', {
          telegramId,
          navigationError:
            navigationError instanceof Error
              ? navigationError.message
              : 'Unknown error',
        })
      }
    }

    return null
  }
}

/**
 * Emergency hero selection error handler specifically for avatarTransformScene
 */
export async function handleHeroSelectionError(
  ctx: MyContext,
  receivedText: string,
  errorType:
    | 'invalid_selection'
    | 'missing_prompt'
    | 'validation_error' = 'invalid_selection'
): Promise<void> {
  const telegramId = ctx.from?.id?.toString()
  const isRu = await isRussianFromState(ctx)

  // Log the specific error
  logger.error('[HeroSelection] Error occurred', {
    telegramId,
    receivedText,
    errorType,
    sessionState: {
      selectedGender: ctx.session?.selectedGender,
      currentStep: ctx.wizard?.cursor,
    },
  })

  let userMessage: string

  switch (errorType) {
    case 'invalid_selection':
      userMessage = isRu
        ? '❌ Неверный выбор героя. Пожалуйста, используйте кнопки для выбора.'
        : '❌ Invalid hero selection. Please use the buttons to select.'
      break
    case 'missing_prompt':
      userMessage = isRu
        ? '❌ Выбранный герой недоступен. Возвращаю в главное меню.'
        : '❌ Selected hero is unavailable. Returning to main menu.'
      break
    case 'validation_error':
      userMessage = isRu
        ? '❌ Ошибка валидации данных. Функция временно недоступна.'
        : '❌ Data validation error. Feature temporarily unavailable.'
      break
    default:
      userMessage = isRu
        ? '❌ Произошла ошибка. Возвращаю в главное меню.'
        : '❌ An error occurred. Returning to main menu.'
  }

  // Send error message and redirect to main menu
  await ctx.reply(userMessage, {
    reply_markup: { remove_keyboard: true },
  })

  // Emergency navigation to main menu
  try {
    await ctx.scene.leave()

    // Trigger main menu
    const menuMessage = isRu ? '🏠 Главное меню' : '🏠 Main Menu'

    await ctx.reply(menuMessage)

    // Force navigation to start command which will show the main menu
    setTimeout(async () => {
      try {
        await ctx.reply('/start')
      } catch (e) {
        logger.error('[HeroSelection] Failed to trigger start command', {
          telegramId,
          error: e instanceof Error ? e.message : 'Unknown error',
        })
      }
    }, 500)
  } catch (navigationError) {
    logger.error('[HeroSelection] Emergency navigation failed', {
      telegramId,
      navigationError:
        navigationError instanceof Error
          ? navigationError.message
          : 'Unknown error',
    })

    // Last resort - just send a message asking user to restart
    await ctx.reply(
      isRu
        ? '🔄 Пожалуйста, нажмите /start для перезапуска бота'
        : '🔄 Please press /start to restart the bot'
    )
  }
}

/**
 * Generic scene error wrapper - can be used for any scene
 */
export function wrapSceneWithErrorHandler<
  T extends (...args: any[]) => Promise<any>,
>(sceneFunction: T, sceneName: string): T {
  return (async (...args: any[]) => {
    const ctx = args[0] as MyContext

    return withErrorHandler(ctx, () => sceneFunction(...args), {
      errorMessage: undefined, // Will use default
      fallbackToMenu: true,
      logContext: { sceneName, functionName: sceneFunction.name },
    })
  }) as T
}
