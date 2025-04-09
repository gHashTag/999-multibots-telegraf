import { MyContext } from '@/interfaces'
import { calculateFinalPrice } from '@/price/helpers'
import { findModelByTitle, VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { IMAGES_MODELS } from '@/price/models/IMAGES_MODELS'

export type ValidationSuccess = {
  success: true
  amount: number
  modelId: string
}

export type ValidationError = {
  success: false
  error: {
    message: string
    availableModels?: string[]
  }
}

export type ValidationResult = ValidationSuccess | ValidationError

export async function validateAndCalculateVideoModelPrice(
  videoModel: string,
  currentBalance: number,
  isRu: boolean,
  ctx: MyContext,
  inputType: 'text' | 'image'
): Promise<ValidationResult> {
  console.log('🚀 Начало валидации модели:', {
    description: 'Starting model validation',
    videoModel,
    currentBalance,
    isRu,
    inputType,
  })

  // Проверяем, не пытается ли пользователь использовать модель для изображений
  if (videoModel.toLowerCase() in IMAGES_MODELS) {
    console.log('❌ Попытка использовать модель для изображений:', {
      description: 'Attempt to use image model for video',
      model: videoModel,
    })
    return {
      success: false,
      error: {
        message: isRu
          ? '❌ Эта модель предназначена для генерации изображений. Пожалуйста, используйте команду /image для генерации изображений.'
          : '❌ This model is for image generation. Please use the /image command for image generation.'
      }
    }
  }

  const modelId = findModelByTitle(videoModel, inputType)
  console.log('🔍 Результат поиска модели:', {
    description: 'Model search result',
    videoModel,
    modelId,
    found: !!modelId,
  })

  if (!modelId) {
    console.log('❌ Модель не найдена:', {
      description: 'Model not found',
      videoModel,
      inputType,
    })

    // Получаем список доступных моделей для текущего типа ввода
    const availableModels = Object.values(VIDEO_MODELS_CONFIG)
      .filter(model => model.inputType.includes(inputType))
      .map(model => model.title)

    return {
      success: false,
      error: {
        message: isRu
          ? `❌ Модель "${videoModel}" не найдена`
          : `❌ Model "${videoModel}" not found`,
        availableModels
      }
    }
  }

  const amount = calculateFinalPrice(modelId)
  console.log('💰 Расчет стоимости:', {
    description: 'Price calculation',
    modelId,
    amount,
    currentBalance,
  })

  if (currentBalance < amount) {
    console.log('❌ Недостаточно средств:', {
      description: 'Insufficient funds',
      currentBalance,
      amount,
      difference: amount - currentBalance,
    })
    return {
      success: false,
      error: {
        message: isRu 
          ? 'Недостаточно средств на балансе' 
          : 'Insufficient balance'
      }
    }
  }

  console.log('✅ Валидация успешна:', {
    description: 'Validation successful',
    modelId,
    amount,
  })

  return {
    success: true,
    amount,
    modelId,
  }
}
