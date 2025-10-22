/**
 * Model button mapping utilities
 */

// Заглушка для маппинга кнопок моделей
export const modelButtonMappings = {
  'flux-kontext-pro': 'Flux Kontext Pro',
  'flux-kontext-multi': 'Flux Kontext Multi',
  'default': 'Default Model'
}

export function getModelDisplayName(modelKey: string): string {
  return modelButtonMappings[modelKey as keyof typeof modelButtonMappings] || modelButtonMappings.default
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
    if (!models || models.length === 0) {
      return { isValid: false, error: 'No models provided' }
    }

    const keyboard: any[] = []
    const isRu = options.isRussian || false
    const maxTextLength = options.maxTextLength || 50

    // Создаем кнопки для каждой модели
    for (const model of models) {
      const modelName = model.name || model.id?.toString() || 'Unknown Model'
      const modelCost = model.cost || 0
      
      // Ограничиваем длину текста кнопки
      const buttonText = modelName.length > maxTextLength 
        ? `${modelName.substring(0, maxTextLength - 3)}...`
        : modelName
      
      const fullButtonText = `${buttonText} (${modelCost}⭐)`
      
      // Создаем callback_data с ограничением длины
      const callbackData = `${callbackPrefix}_${model.id}`
      if (callbackData.length > 64) {
        // Если слишком длинный, используем хеш
        const shortId = model.id.toString().slice(-8)
        const shortCallbackData = `${callbackPrefix}_${shortId}`
        keyboard.push([{
          text: fullButtonText,
          callback_data: shortCallbackData
        }])
      } else {
        keyboard.push([{
          text: fullButtonText,
          callback_data: callbackData
        }])
      }
    }

    // Добавляем кнопку отмены
    keyboard.push([{
      text: isRu ? '❌ Отмена' : '❌ Cancel',
      callback_data: 'cancel_model_selection'
    }])

    return { isValid: true, keyboard }
  } catch (error) {
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

export function handleModelSelectionCallback(ctx: any): Promise<void> {
  return Promise.resolve()
}

export interface ModelTraining {
  id: string | number
  name?: string
  cost?: number
  [key: string]: any
}

export class ModelTraining {
  static async train(): Promise<any> {
    return {}
  }
}

export interface ModelButtonOptions {
  [key: string]: any
}