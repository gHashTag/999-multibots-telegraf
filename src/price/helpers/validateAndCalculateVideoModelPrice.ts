import { MyContext } from '@/types'
import { calculateFinalPrice } from '@/price/helpers'
import { findModelByTitle } from '@/menu/videoModelMenu'
import { IMAGES_MODELS } from '@/price/models/IMAGES_MODELS'

export async function validateAndCalculateVideoModelPrice(
  videoModel: string,
  currentBalance: number,
  isRu: boolean,
  ctx: MyContext,
  inputType: 'text' | 'image'
): Promise<{ amount: number; modelId: string } | null> {
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
    await ctx.reply(
      isRu
        ? '❌ Эта модель предназначена для генерации изображений. Пожалуйста, используйте команду /image для генерации изображений.'
        : '❌ This model is for image generation. Please use the /image command for image generation.'
    )
    return null
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
    await ctx.reply('❌ Модель не найдена')
    return null
  }

  const amount = calculateFinalPrice(modelId)
  console.log('💰 Расчет стоимости:', {
    description: 'Price calculation',
    modelId,
    amount,
    currentBalance,
  })

  ctx.session.amount = amount
  if (currentBalance < amount) {
    console.log('❌ Недостаточно средств:', {
      description: 'Insufficient funds',
      currentBalance,
      amount,
      difference: amount - currentBalance,
    })
    await ctx.reply(
      isRu ? 'Недостаточно средств на балансе' : 'Insufficient balance'
    )
    return null
  }

  console.log('✅ Валидация успешна:', {
    description: 'Validation successful',
    modelId,
    amount,
  })

  return {
    amount,
    modelId,
  }
}
