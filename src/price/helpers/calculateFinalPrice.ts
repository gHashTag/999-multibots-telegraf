import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'

export const calculateFinalPrice = (modelId: string): number => {
  try {
    // 1. Получаем конфиг модели
    const model = VIDEO_MODELS_CONFIG[modelId]
    if (!model) {
      throw new Error(`Model ${modelId} not found`)
    }

    // 2. Проверяем базовую цену
    if (typeof model.basePrice !== 'number' || model.basePrice <= 0) {
      throw new Error(`Invalid base price for model ${modelId}`)
    }

    // 3. Применяем наценку (50%)
    const priceWithMarkup = model.basePrice * 1.5

    // 4. Конвертируем в звезды (1$ = 100 звезд)
    const stars = Math.round(priceWithMarkup * 100)

    console.log('✅ Расчет стоимости:', {
      model: model.title,
      basePrice: model.basePrice,
      priceWithMarkup,
      stars,
    })

    return stars
  } catch (error) {
    console.error('💥 Ошибка расчета:', error.message)
    return NaN
  }
}
