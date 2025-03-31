import { MyContext } from '@/interfaces'
import { calculateFinalPrice } from '@/price/helpers'
import { findModelByTitle } from '@/menu/videoModelMenu'
import { IMAGES_MODELS } from '@/price/models/IMAGES_MODELS'

export async function validateAndCalculateVideoModelPrice(
  videoModel: string,
  currentBalance: number,
  isRu: boolean,
  ctx: MyContext,
  inputType: 'text' | 'image'
): Promise<{ paymentAmount: number; modelId: string } | null> {
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

  const paymentAmount = calculateFinalPrice(modelId)
  console.log('💰 Расчет стоимости:', {
    description: 'Price calculation',
    modelId,
    paymentAmount,
    currentBalance,
  })

  ctx.session.paymentAmount = paymentAmount
  if (currentBalance < paymentAmount) {
    console.log('❌ Недостаточно средств:', {
      description: 'Insufficient funds',
      currentBalance,
      paymentAmount,
      difference: paymentAmount - currentBalance,
    })
    await ctx.reply(
      isRu ? 'Недостаточно средств на балансе' : 'Insufficient balance'
    )
    return null
  }

  console.log('✅ Валидация успешна:', {
    description: 'Validation successful',
    modelId,
    paymentAmount,
  })

  return {
    paymentAmount,
    modelId,
  }
}
