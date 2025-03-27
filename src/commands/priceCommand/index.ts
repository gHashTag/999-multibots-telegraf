import { MyContext } from '@/interfaces'
import { ModeEnum, calculateModeCost } from '@/price/helpers'
import { logger } from '@/utils/logger'

export async function priceCommand(ctx: MyContext) {
  const isRu = ctx.from?.language_code === 'ru'

  // Рассчитываем стоимость для разных количеств шагов
  const stepsRange = {
    min: 1000,
    max: 6000,
    step: 1000,
  }

  // Получаем стоимость для каждого режима
  const prices = Object.entries(ModeEnum).reduce((acc, [key, mode]) => {
    // Для режимов с шагами рассчитываем диапазон цен
    if (
      mode === ModeEnum.DigitalAvatarBody ||
      mode === ModeEnum.DigitalAvatarBodyV2
    ) {
      const minStepsCost = calculateModeCost({
        mode,
        steps: stepsRange.min,
      }).stars
      const maxStepsCost = calculateModeCost({
        mode,
        steps: stepsRange.max,
      }).stars
      acc[mode] = { min: minStepsCost, max: maxStepsCost }
    } else {
      // Для остальных режимов считаем обычную стоимость
      const result = calculateModeCost({ mode })
      acc[mode] = result.stars
    }
    return acc
  }, {} as Record<string, number | { min: number; max: number }>)

  logger.info('💰 Расчет стоимости услуг', {
    description: 'Calculating service costs',
    prices,
    telegram_id: ctx.from?.id,
  })

  // Создаем таблицу стоимости шагов
  const stepsTable = Array.from(
    { length: (stepsRange.max - stepsRange.min) / stepsRange.step + 1 },
    (_, i) => {
      const steps = stepsRange.min + i * stepsRange.step
      const costV1 = calculateModeCost({
        mode: ModeEnum.DigitalAvatarBody,
        steps,
      }).stars
      const costV2 = calculateModeCost({
        mode: ModeEnum.DigitalAvatarBodyV2,
        steps,
      }).stars
      return { steps, costV1, costV2 }
    }
  )

  const stepsTableText = isRu
    ? stepsTable
        .map(
          ({ steps, costV1, costV2 }) =>
            `• ${steps} шагов: ${costV1} ⭐️ (V1) / ${costV2} ⭐️ (V2)`
        )
        .join('\n')
    : stepsTable
        .map(
          ({ steps, costV1, costV2 }) =>
            `• ${steps} steps: ${costV1} ⭐️ (V1) / ${costV2} ⭐️ (V2)`
        )
        .join('\n')

  const message = isRu
    ? `
<b>💰 Прайс-лист на услуги:</b>

🤖 Нейросети:
• Нейрофото (NeuroPhoto): ${prices[ModeEnum.NeuroPhoto]} ⭐️
• Нейрофото V2 (улучшенное): ${prices[ModeEnum.NeuroPhotoV2]} ⭐️
• Генерация промпта: ${prices[ModeEnum.ImageToPrompt]} ⭐️

🎭 Аватары:
• Обучение модели V1: ${(prices[ModeEnum.DigitalAvatarBody] as any).min} - ${
        (prices[ModeEnum.DigitalAvatarBody] as any).max
      } ⭐️
• Обучение модели V2: ${(prices[ModeEnum.DigitalAvatarBodyV2] as any).min} - ${
        (prices[ModeEnum.DigitalAvatarBodyV2] as any).max
      } ⭐️
• Чат с аватаром: ${prices[ModeEnum.ChatWithAvatar]} ⭐️
• Базовый аватар: ${prices[ModeEnum.Avatar]} ⭐️

📊 Стоимость обучения модели (шаги):
${stepsTableText}

🎬 Видео и аудио:
• Текст в видео: ${prices[ModeEnum.TextToVideo]} ⭐️
• Изображение в видео: ${prices[ModeEnum.ImageToVideo]} ⭐️
• Синхронизация губ: ${prices[ModeEnum.LipSync]} ⭐️
• Голос: ${prices[ModeEnum.Voice]} ⭐️
• Текст в речь: ${prices[ModeEnum.TextToSpeech]} ⭐️

🎨 Изображения:
• Текст в изображение: ${prices[ModeEnum.TextToImage]} ⭐️

💵 Пополнить баланс: /buy`
    : `
<b>💰 Service Price List:</b>

🤖 Neural Networks:
• NeuroPhoto: ${prices[ModeEnum.NeuroPhoto]} ⭐️
• NeuroPhoto V2 (enhanced): ${prices[ModeEnum.NeuroPhotoV2]} ⭐️
• Prompt Generation: ${prices[ModeEnum.ImageToPrompt]} ⭐️

🎭 Avatars:
• Model Training V1: ${(prices[ModeEnum.DigitalAvatarBody] as any).min} - ${
        (prices[ModeEnum.DigitalAvatarBody] as any).max
      } ⭐️
• Model Training V2: ${(prices[ModeEnum.DigitalAvatarBodyV2] as any).min} - ${
        (prices[ModeEnum.DigitalAvatarBodyV2] as any).max
      } ⭐️
• Chat with Avatar: ${prices[ModeEnum.ChatWithAvatar]} ⭐️
• Basic Avatar: ${prices[ModeEnum.Avatar]} ⭐️

📊 Model Training Cost (steps):
${stepsTableText}

🎬 Video & Audio:
• Text to Video: ${prices[ModeEnum.TextToVideo]} ⭐️
• Image to Video: ${prices[ModeEnum.ImageToVideo]} ⭐️
• Lip Sync: ${prices[ModeEnum.LipSync]} ⭐️
• Voice: ${prices[ModeEnum.Voice]} ⭐️
• Text to Speech: ${prices[ModeEnum.TextToSpeech]} ⭐️

🎨 Images:
• Text to Image: ${prices[ModeEnum.TextToImage]} ⭐️

💵 Top up balance: /buy`

  await ctx.reply(message, { parse_mode: 'HTML' })
}
