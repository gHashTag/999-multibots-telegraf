/**
 * Model button mapping utilities
 */

// Заглушка для маппинга кнопок моделей
export const modelButtonMappings = {
  'flux-kontext-pro': 'Flux Kontext Pro',
  'flux-kontext-multi': 'Flux Kontext Multi',
  default: 'Default Model',
}

export function getModelDisplayName(modelKey: string): string {
  return (
    modelButtonMappings[modelKey as keyof typeof modelButtonMappings] ||
    modelButtonMappings.default
  )
}

export function validateModelButton(modelKey: string): boolean {
  return Object.keys(modelButtonMappings).includes(modelKey)
}

export function createSafeModelSelectionKeyboard(
  models: ModelTraining[],
  callbackPrefix: string = 'select_model',
  options: ModelButtonOptions = {}
): { isValid: boolean; keyboard?: any[]; error?: string } {
  try {
    console.log(
      `🔍 [createSafeModelSelectionKeyboard] Создание клавиатуры для ${models?.length || 0} моделей`
    )

    if (!models || models.length === 0) {
      console.log(
        `❌ [createSafeModelSelectionKeyboard] Нет моделей для создания клавиатуры`
      )
      return { isValid: false, error: 'No models provided' }
    }

    const keyboard: any[] = []
    const isRu = options.isRussian || false
    const maxTextLength = options.maxTextLength || 50

    // Создаем кнопки для каждой модели
    for (const model of models) {
      const modelName =
        model.model_name ||
        model.name ||
        model.id?.toString() ||
        'Unknown Model'
      const modelCost = model.cost || 0

      // Ограничиваем длину текста кнопки
      const buttonText =
        modelName.length > maxTextLength
          ? `${modelName.substring(0, maxTextLength - 3)}...`
          : modelName

      // Используем только название модели без стоимости
      const fullButtonText = buttonText

      // Создаем callback_data с ограничением длины
      const callbackData = `${callbackPrefix}_${model.id}`
      if (callbackData.length > 64) {
        // Если слишком длинный, используем хеш
        const shortId = model.id.toString().slice(-8)
        const shortCallbackData = `${callbackPrefix}_${shortId}`
        keyboard.push([
          {
            text: fullButtonText,
            callback_data: shortCallbackData,
          },
        ])
      } else {
        keyboard.push([
          {
            text: fullButtonText,
            callback_data: callbackData,
          },
        ])
      }
    }

    // Добавляем кнопку отмены
    keyboard.push([
      {
        text: isRu ? '❌ Отмена' : '❌ Cancel',
        callback_data: 'cancel_model_selection',
      },
    ])

    console.log(
      `✅ [createSafeModelSelectionKeyboard] Клавиатура создана успешно: ${keyboard.length} кнопок`
    )
    return { isValid: true, keyboard }
  } catch (error) {
    console.log(
      `❌ [createSafeModelSelectionKeyboard] Ошибка создания клавиатуры:`,
      error
    )
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export function handleModelSelectionCallback(
  userModels: ModelTraining[],
  callbackData: string,
  operationName: string,
  options: { isRussian?: boolean; debug?: boolean } = {}
): {
  success: boolean
  model?: ModelTraining
  shouldCancel?: boolean
  error?: string
} {
  try {
    console.log(`🔍 [handleModelSelectionCallback] Обработка выбора модели:`, {
      callbackData,
      userModelsCount: userModels?.length || 0,
      operationName,
    })

    if (!userModels || userModels.length === 0) {
      console.log(`❌ [handleModelSelectionCallback] Нет моделей для выбора`)
      return { success: false, error: 'No models available' }
    }

    if (!callbackData || !callbackData.startsWith('select_model_')) {
      console.log(
        `❌ [handleModelSelectionCallback] Неверный callback: ${callbackData}`
      )
      return { success: false, error: 'Invalid callback data' }
    }

    // Извлекаем ID модели из callback_data
    const modelId = callbackData.replace('select_model_', '')
    console.log(
      `🔍 [handleModelSelectionCallback] Ищем модель с ID: ${modelId}`
    )

    // Находим модель по ID
    const selectedModel = userModels.find(
      model => model.id.toString() === modelId
    )

    if (!selectedModel) {
      console.log(
        `❌ [handleModelSelectionCallback] Модель не найдена: ${modelId}`
      )
      return { success: false, error: 'Model not found' }
    }

    console.log(`✅ [handleModelSelectionCallback] Модель найдена:`, {
      id: selectedModel.id,
      name: selectedModel.model_name || selectedModel.name,
      status: selectedModel.status,
    })

    return {
      success: true,
      model: selectedModel,
    }
  } catch (error) {
    console.error(
      `❌ [handleModelSelectionCallback] Ошибка обработки выбора модели:`,
      error
    )
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export interface ModelTraining {
  id: string | number
  name?: string
  cost?: number
  [key: string]: any
}

export interface ModelButtonOptions {
  [key: string]: any
}
