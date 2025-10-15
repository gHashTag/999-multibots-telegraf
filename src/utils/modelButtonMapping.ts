/**
 * Model Button Mapping Utilities
 *
 * Specialized utilities for handling model selection buttons in wizards
 * like neuroPhoto, with robust ID handling and callback data management.
 */

import { logger } from './logger'
import {
  createButtonMapping,
  findByCallbackData,
  validateCallbackData,
  normalizeButtonText,
  ButtonMappingOptions
} from './buttonMapping'

export interface ModelTraining {
  id: string | number
  model_name?: string
  created_at: string
  steps?: number
  model_url?: string
  trigger_word?: string
}

export interface ModelButtonOptions extends ButtonMappingOptions {
  /**
   * Whether to include step count in button text
   */
  includeSteps?: boolean

  /**
   * Whether to include creation date if no model name
   */
  includeDate?: boolean

  /**
   * Maximum length for button text
   */
  maxTextLength?: number

  /**
   * Language preference
   */
  isRussian?: boolean
}

/**
 * Generates appropriate text for a model button
 */
export function generateModelButtonText(
  model: ModelTraining,
  index: number,
  options: ModelButtonOptions = {}
): string {
  const isRu = options.isRussian ?? true
  const maxLength = options.maxTextLength || 50
  let buttonText = `${index + 1}. `

  // Get date string for fallback
  const dateString = new Date(model.created_at).toLocaleDateString(
    isRu ? 'ru-RU' : 'en-US'
  )

  // Determine base text
  if (model.model_name && model.model_name.trim() !== '') {
    buttonText += model.model_name.trim()
  } else {
    buttonText += isRu ? `Модель ${dateString}` : `Model ${dateString}`
  }

  // Add steps information if requested and available
  if (options.includeSteps && model.steps && model.steps > 0) {
    const stepsText = isRu ? ` (${model.steps} шагов)` : ` (${model.steps} steps)`
    buttonText += stepsText
  }

  // Truncate if too long
  if (buttonText.length > maxLength) {
    buttonText = buttonText.substring(0, maxLength - 3) + '...'
  }

  return normalizeButtonText(buttonText, options)
}

/**
 * Creates model selection buttons with proper callback handling
 */
export function createModelSelectionButtons(
  models: ModelTraining[],
  callbackPrefix: string = 'select_model',
  options: ModelButtonOptions = {}
): Array<Array<{ text: string; callback_data: string }>> {
  if (!models || models.length === 0) {
    logger.warn('[ModelButtonMapping] No models provided for button creation')
    return []
  }

  const buttons = models.map((model, index) => {
    const buttonText = generateModelButtonText(model, index, options)
    const mapping = createButtonMapping(buttonText, callbackPrefix, model.id, options)

    if (options.debug) {
      logger.debug('[ModelButtonMapping] Created model button', {
        modelId: model.id,
        buttonText: mapping.text,
        callbackData: mapping.callback_data,
        originalId: mapping.originalId,
        shortId: mapping.shortId
      })
    }

    return {
      text: mapping.text,
      callback_data: mapping.callback_data
    }
  })

  // Arrange in single column for model selection
  return buttons.map(button => [button])
}

/**
 * Adds standard action buttons (like Cancel) to model selection
 */
export function addModelSelectionActions(
  modelButtons: Array<Array<{ text: string; callback_data: string }>>,
  isRussian: boolean = true,
  additionalActions?: Array<{ text: string; callback_data: string }>
): Array<Array<{ text: string; callback_data: string }>> {
  const buttons = [...modelButtons]

  // Add additional actions if provided
  if (additionalActions && additionalActions.length > 0) {
    buttons.push(...additionalActions.map(action => [action]))
  }

  // Always add cancel button
  buttons.push([
    {
      text: isRussian ? 'Отмена' : 'Cancel',
      callback_data: 'cancel_model_selection'
    }
  ])

  return buttons
}

/**
 * Finds a model by callback data with robust error handling
 */
export function findModelByCallback(
  models: ModelTraining[],
  callbackData: string,
  callbackPrefix: string = 'select_model',
  options: ModelButtonOptions = {}
): {
  model?: ModelTraining
  error?: string
  isValid: boolean
} {
  // Validate callback data first
  const validation = validateCallbackData(callbackData, callbackPrefix, options)
  if (!validation.isValid) {
    return {
      isValid: false,
      error: validation.error
    }
  }

  // Find the model
  const model = findByCallbackData(models, callbackData, callbackPrefix, options)

  if (!model) {
    const extractedId = validation.extractedId
    logger.warn('[ModelButtonMapping] Model not found for callback', {
      callbackData,
      extractedId,
      availableModelIds: models.map(m => m.id.toString())
    })

    return {
      isValid: false,
      error: `Model not found for ID: ${extractedId}`
    }
  }

  if (options.debug) {
    logger.debug('[ModelButtonMapping] Successfully found model', {
      callbackData,
      modelId: model.id,
      modelName: model.model_name
    })
  }

  return {
    isValid: true,
    model
  }
}

/**
 * Validates model data before creating buttons
 */
export function validateModelsForButtonCreation(
  models: any[]
): { isValid: boolean; validModels: ModelTraining[]; errors: string[] } {
  const errors: string[] = []
  const validModels: ModelTraining[] = []

  if (!Array.isArray(models)) {
    errors.push('Models must be an array')
    return { isValid: false, validModels: [], errors }
  }

  if (models.length === 0) {
    errors.push('No models provided')
    return { isValid: false, validModels: [], errors }
  }

  for (let i = 0; i < models.length; i++) {
    const model = models[i]

    if (!model) {
      errors.push(`Model at index ${i} is null or undefined`)
      continue
    }

    if (!model.id) {
      errors.push(`Model at index ${i} missing required field: id`)
      continue
    }

    if (!model.created_at) {
      errors.push(`Model at index ${i} missing required field: created_at`)
      continue
    }

    // This model is valid
    validModels.push(model as ModelTraining)
  }

  return {
    isValid: errors.length === 0,
    validModels,
    errors
  }
}

/**
 * Creates a complete model selection keyboard with error handling
 */
export function createSafeModelSelectionKeyboard(
  models: any[],
  callbackPrefix: string = 'select_model',
  options: ModelButtonOptions = {}
): {
  keyboard: Array<Array<{ text: string; callback_data: string }>>
  isValid: boolean
  error?: string
} {
  try {
    // Validate models first
    const validation = validateModelsForButtonCreation(models)
    if (!validation.isValid) {
      return {
        keyboard: [],
        isValid: false,
        error: validation.errors.join('; ')
      }
    }

    // Create model buttons
    const modelButtons = createModelSelectionButtons(
      validation.validModels,
      callbackPrefix,
      options
    )

    // Add standard actions
    const keyboard = addModelSelectionActions(
      modelButtons,
      options.isRussian
    )

    return {
      keyboard,
      isValid: true
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('[ModelButtonMapping] Error creating model selection keyboard', {
      error: errorMessage,
      modelCount: models?.length || 0
    })

    return {
      keyboard: [],
      isValid: false,
      error: `Failed to create keyboard: ${errorMessage}`
    }
  }
}

/**
 * Handles model selection callback with comprehensive error handling and logging
 */
export function handleModelSelectionCallback(
  models: ModelTraining[],
  callbackData: string,
  context: string = 'model_selection',
  options: ModelButtonOptions = {}
): {
  success: boolean
  model?: ModelTraining
  error?: string
  shouldCancel?: boolean
} {
  try {
    // Handle cancel action
    if (callbackData === 'cancel_model_selection') {
      return {
        success: true,
        shouldCancel: true
      }
    }

    // Find the model
    const result = findModelByCallback(models, callbackData, 'select_model', {
      ...options,
      debug: true
    })

    if (!result.isValid || !result.model) {
      logger.warn(`[ModelButtonMapping] Invalid model selection in ${context}`, {
        callbackData,
        error: result.error,
        availableModels: models.length
      })

      return {
        success: false,
        error: result.error || 'Model not found'
      }
    }

    logger.info(`[ModelButtonMapping] Model selected successfully in ${context}`, {
      callbackData,
      modelId: result.model.id,
      modelName: result.model.model_name
    })

    return {
      success: true,
      model: result.model
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`[ModelButtonMapping] Error handling model selection in ${context}`, {
      error: errorMessage,
      callbackData
    })

    return {
      success: false,
      error: `Selection failed: ${errorMessage}`
    }
  }
}