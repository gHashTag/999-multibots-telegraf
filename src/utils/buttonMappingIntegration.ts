/**
 * Button Mapping Integration Utilities
 *
 * High-level integration utilities that combine all button mapping
 * functionality into easy-to-use interfaces for common use cases.
 */

import { MyContext } from '@/interfaces'
import { logger } from './logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
// Removed dependency on deleted modelButtonMapping module
// import {
//   createSafeModelSelectionKeyboard,
//   handleModelSelectionCallback,
//   ModelTraining,
//   ModelButtonOptions
// } from './modelButtonMapping'

// Type definitions for model selection (moved from deleted module)
export interface ModelTraining {
  id: string
  name: string
  steps?: number
  created_at?: string
}

export interface ModelButtonOptions {
  isRussian?: boolean
  includeSteps?: boolean
  includeDate?: boolean
  debug?: boolean
}
import {
  createWizardCallbackHandler,
  createStandardWizardHandlers,
  WizardButtonHandler
} from './wizardButtonHandlers'
import {
  handleSystemError,
  handleCallbackQueryError
} from './systemErrorHandlers'

/**
 * Quick setup function for model selection in any wizard
 */
export async function setupModelSelectionStep(
  ctx: MyContext,
  models: ModelTraining[],
  options: {
    title?: string
    callbackPrefix?: string
    includeSteps?: boolean
    onModelSelected?: (ctx: MyContext, model: ModelTraining) => Promise<void>
    onCancel?: (ctx: MyContext) => Promise<void>
    onError?: (ctx: MyContext, error: Error) => Promise<void>
  } = {}
): Promise<{ success: boolean; error?: string }> {
  const isRu = isRussianFromState(ctx)

  try {
    // Validate models
    if (!models || models.length === 0) {
      const error = 'No models provided for selection'
      logger.warn('[ButtonMappingIntegration] No models for selection', {
        telegramId: ctx.from?.id?.toString(),
        modelCount: models?.length || 0
      })

      if (options.onError) {
        await options.onError(ctx, new Error(error))
      } else {
        await ctx.reply(
          isRu
            ? '❌ Модели для выбора не найдены.'
            : '❌ No models found for selection.'
        )
      }

      return { success: false, error }
    }

    // TODO: Restore keyboard creation when modelButtonMapping is reimplemented
    logger.error('[ButtonMappingIntegration] Model selection disabled - modelButtonMapping module removed', {
      telegramId: ctx.from?.id?.toString()
    })

    const error = 'Model selection currently unavailable'
    if (options.onError) {
      await options.onError(ctx, new Error(error))
    } else {
      await ctx.reply(
        isRu
          ? '❌ Функция выбора модели временно недоступна.'
          : '❌ Model selection is temporarily unavailable.'
      )
    }

    return { success: false, error }

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error))

    logger.error('[ButtonMappingIntegration] Error setting up model selection', {
      telegramId: ctx.from?.id?.toString(),
      error: errorObj.message
    })

    if (options.onError) {
      await options.onError(ctx, errorObj)
    } else {
      await handleSystemError(errorObj)
    }

    return { success: false, error: errorObj.message }
  }
}

/**
 * Creates a complete callback handler for model selection wizards
 */
export function createModelSelectionCallbackHandler(
  wizardName: string,
  options: {
    callbackPrefix?: string
    onModelSelected?: (ctx: MyContext, model: ModelTraining) => Promise<void>
    onCancel?: (ctx: MyContext) => Promise<void>
    onError?: (ctx: MyContext, error: Error) => Promise<void>
    moveToNextStep?: boolean
  } = {}
) {
  const callbackPrefix = options.callbackPrefix || 'select_model'

  const handlers: Record<string, WizardButtonHandler> = {
    ...createStandardWizardHandlers(wizardName, {
      onCancel: options.onCancel,
      onError: options.onError
    }),

    [callbackPrefix]: {
      validate: async (ctx: MyContext, callbackData: string) => {
        const userModels = ctx.scene?.state ? (ctx.scene.state as any).userModels : null

        if (!userModels || !Array.isArray(userModels) || userModels.length === 0) {
          return {
            isValid: false,
            error: 'No models found in session state'
          }
        }

        return { isValid: true }
      },

      handle: async (ctx: MyContext, callbackData: string) => {
        // TODO: Restore when modelButtonMapping module is reimplemented
        logger.error('[ButtonMappingIntegration] Model selection handler disabled', {
          telegramId: ctx.from?.id?.toString(),
          wizardName
        })

        return {
          success: false,
          error: 'Model selection currently unavailable'
        }
      },

      onError: options.onError
    }
  }

  return createWizardCallbackHandler(`${wizardName}_model_selection`, handlers)
}

/**
 * Pre-built error recovery functions for common scenarios
 */
export const ErrorRecoveryStrategies = {
  /**
   * Returns user to main menu with error message
   */
  returnToMainMenu: async (ctx: MyContext, error: Error) => {
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка. Возвращаю в главное меню.'
        : '❌ An error occurred. Returning to main menu.'
    )

    // Leave current scene if active
    if (ctx.scene?.current) {
      await ctx.scene.leave()
    }
  },

  /**
   * Restarts the current wizard step
   */
  restartCurrentStep: async (ctx: MyContext, error: Error) => {
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '❌ Ошибка. Попробуем еще раз.'
        : '❌ Error. Let\'s try again.'
    )

    if (ctx.wizard && (ctx.wizard?.cursor ?? 0) > 0) {
      ctx.wizard.selectStep(ctx.wizard?.cursor ?? 0)
    }
  },

  /**
   * Goes back to previous wizard step
   */
  goToPreviousStep: async (ctx: MyContext, error: Error) => {
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '❌ Ошибка. Возвращаюсь к предыдущему шагу.'
        : '❌ Error. Going back to previous step.'
    )

    if (ctx.wizard) {
      ctx.wizard.back()
    }
  },

  /**
   * Shows error and asks user to try again
   */
  askToRetry: async (ctx: MyContext, error: Error) => {
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? `❌ ${error.message}\n\nПопробуйте еще раз или используйте кнопку "Отмена".`
        : `❌ ${error.message}\n\nTry again or use the "Cancel" button.`
    )
  }
}

/**
 * Utility to apply button mapping system to existing wizards
 */
export function upgradeWizardWithButtonMapping(
  wizard: any,
  wizardName: string,
  options: {
    enableModelSelection?: boolean
    enableErrorRecovery?: boolean
    customHandlers?: Record<string, WizardButtonHandler>
    errorStrategy?: keyof typeof ErrorRecoveryStrategies
  } = {}
) {
  const handlers: Record<string, WizardButtonHandler> = {}

  // Add standard handlers
  Object.assign(handlers, createStandardWizardHandlers(wizardName, {
    onError: options.errorStrategy
      ? ErrorRecoveryStrategies[options.errorStrategy]
      : ErrorRecoveryStrategies.returnToMainMenu
  }))

  // Add model selection if enabled
  if (options.enableModelSelection) {
    const modelHandler = createModelSelectionCallbackHandler(wizardName, {
      onError: options.errorStrategy
        ? ErrorRecoveryStrategies[options.errorStrategy]
        : undefined
    })

    // Merge model handler
    wizard.on('callback_query', modelHandler)
  }

  // Add custom handlers
  if (options.customHandlers) {
    Object.assign(handlers, options.customHandlers)
  }

  // Add general callback handler if not model selection
  if (!options.enableModelSelection) {
    const callbackHandler = createWizardCallbackHandler(wizardName, handlers)
    wizard.on('callback_query', callbackHandler)
  }

  logger.info(`[ButtonMappingIntegration] Upgraded wizard ${wizardName}`, {
    enableModelSelection: options.enableModelSelection,
    enableErrorRecovery: options.enableErrorRecovery,
    customHandlerCount: options.customHandlers ? Object.keys(options.customHandlers).length : 0,
    errorStrategy: options.errorStrategy
  })

  return wizard
}

/**
 * Quick diagnostic function to check button mapping health
 */
export function diagnoseLiveButtonMapping(ctx: MyContext) {
  const telegramId = ctx.from?.id?.toString()
  const diagnostics = {
    hasSession: !!ctx.session,
    hasScene: !!ctx.scene.current,
    sceneName: ctx.scene.current?.id,
    hasUserModels: !!(ctx.scene?.state as any)?.userModels,
    userModelCount: ((ctx.scene?.state as any)?.userModels || []).length,
    language: isRussianFromState(ctx) ? 'ru' : 'en',
    callbackQuery: ctx.callbackQuery ? {
      hasData: 'data' in ctx.callbackQuery,
      dataLength: 'data' in ctx.callbackQuery ? ctx.callbackQuery.data.length : 0,
      data: 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : null
    } : null
  }

  logger.debug('[ButtonMappingIntegration] Live diagnostics', {
    telegramId,
    diagnostics
  })

  return diagnostics
}