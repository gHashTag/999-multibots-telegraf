import { MyContext } from '@/types'
import { ModeEnum } from '@/types/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'

/** Диапазон цен с минимальным и максимальным значением */
type PriceRange = { min: number; max: number }

/** Цены для разных режимов */
type Prices = Record<string, number | PriceRange>

/** Категории услуг */
type ServiceCategory = {
  emoji: string
  title: { ru: string; en: string }
  services: Array<{
    mode: ModeEnum
    name: { ru: string; en: string }
  }>
}

/** Конфигурация шагов для обучения модели */
const STEPS_RANGE = {
  min: 1000,
  max: 6000,
  step: 1000,
} as const

/** Категории услуг с локализацией */
const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    emoji: '🤖',
    title: { ru: 'Нейросети', en: 'Neural Networks' },
    services: [
      {
        mode: ModeEnum.NeuroPhoto,
        name: { ru: 'Нейрофото', en: 'NeuroPhoto' },
      },
      {
        mode: ModeEnum.NeuroPhotoV2,
        name: {
          ru: 'Нейрофото V2 (улучшенное)',
          en: 'NeuroPhoto V2 (enhanced)',
        },
      },
      {
        mode: ModeEnum.ImageToPrompt,
        name: { ru: 'Генерация промпта', en: 'Prompt Generation' },
      },
    ],
  },
  {
    emoji: '🎭',
    title: { ru: 'Аватары', en: 'Avatars' },
    services: [
      {
        mode: ModeEnum.DigitalAvatarBody,
        name: { ru: 'Обучение модели V1', en: 'Model Training V1' },
      },
      {
        mode: ModeEnum.DigitalAvatarBodyV2,
        name: { ru: 'Обучение модели V2', en: 'Model Training V2' },
      },
      {
        mode: ModeEnum.ChatWithAvatar,
        name: { ru: 'Чат с аватаром', en: 'Chat with Avatar' },
      },
      {
        mode: ModeEnum.Avatar,
        name: { ru: 'Базовый аватар', en: 'Basic Avatar' },
      },
    ],
  },
  {
    emoji: '🎬',
    title: { ru: 'Видео и аудио', en: 'Video & Audio' },
    services: [
      {
        mode: ModeEnum.TextToVideo,
        name: { ru: 'Текст в видео', en: 'Text to Video' },
      },
      {
        mode: ModeEnum.ImageToVideo,
        name: { ru: 'Изображение в видео', en: 'Image to Video' },
      },
      {
        mode: ModeEnum.LipSync,
        name: { ru: 'Синхронизация губ', en: 'Lip Sync' },
      },
      {
        mode: ModeEnum.Voice,
        name: { ru: 'Голос', en: 'Voice' },
      },
      {
        mode: ModeEnum.TextToSpeech,
        name: { ru: 'Текст в речь', en: 'Text to Speech' },
      },
    ],
  },
  {
    emoji: '🎨',
    title: { ru: 'Изображения', en: 'Images' },
    services: [
      {
        mode: ModeEnum.TextToImage,
        name: { ru: 'Текст в изображение', en: 'Text to Image' },
      },
    ],
  },
]

/**
 * Форматирует цену для отображения
 * @param mode Режим услуги
 * @param prices Объект с ценами
 * @returns Отформатированная цена
 */
function formatPrice(mode: ModeEnum, prices: Prices): string {
  const price = prices[mode]
  if (typeof price === 'number') return price.toString()
  return `${price.min} - ${price.max}`
}

/**
 * Генерирует таблицу стоимости шагов
 * @param isRu Флаг русского языка
 * @returns Текст таблицы
 */
function generateStepsTable(isRu: boolean): string {
  const stepsTable = Array.from(
    { length: (STEPS_RANGE.max - STEPS_RANGE.min) / STEPS_RANGE.step + 1 },
    (_, i) => {
      const steps = STEPS_RANGE.min + i * STEPS_RANGE.step
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

  return stepsTable
    .map(({ steps, costV1, costV2 }) =>
      isRu
        ? `• ${steps} шагов: ${costV1} ⭐️ (V1) / ${costV2} ⭐️ (V2)`
        : `• ${steps} steps: ${costV1} ⭐️ (V1) / ${costV2} ⭐️ (V2)`
    )
    .join('\n')
}

/**
 * Генерирует сообщение с ценами
 * @param isRu Флаг русского языка
 * @param prices Объект с ценами
 * @returns Отформатированное сообщение
 */
function generatePriceMessage(isRu: boolean, prices: Prices): string {
  const title = isRu ? '💰 Прайс-лист на услуги:' : '💰 Service Price List:'
  const stepsTitle = isRu
    ? '📊 Стоимость обучения модели (шаги):'
    : '📊 Model Training Cost (steps):'
  const buyCommand = isRu
    ? '💵 Пополнить баланс: /buy'
    : '💵 Top up balance: /buy'

  const categoriesText = SERVICE_CATEGORIES.map(category => {
    const categoryTitle = `${category.emoji} ${isRu ? category.title.ru : category.title.en}:`
    const servicesText = category.services
      .map(service => {
        const name = isRu ? service.name.ru : service.name.en
        const price = formatPrice(service.mode, prices)
        return `• ${name}: ${price} ⭐️`
      })
      .join('\n')
    return `${categoryTitle}\n${servicesText}`
  }).join('\n\n')

  const stepsTable = generateStepsTable(isRu)

  return `
<b>${title}</b>

${categoriesText}

${stepsTitle}
${stepsTable}

${buyCommand}`
}

export async function priceCommand(ctx: MyContext) {
  const isRu = ctx.from?.language_code === 'ru'

  // Рассчитываем цены для всех режимов
  const prices = Object.entries(ModeEnum).reduce((acc, [, mode]) => {
    if (
      mode === ModeEnum.DigitalAvatarBody ||
      mode === ModeEnum.DigitalAvatarBodyV2
    ) {
      const minStepsCost = calculateModeCost({
        mode,
        steps: STEPS_RANGE.min,
      }).stars
      const maxStepsCost = calculateModeCost({
        mode,
        steps: STEPS_RANGE.max,
      }).stars
      acc[mode] = { min: minStepsCost, max: maxStepsCost }
    } else {
      const result = calculateModeCost({ mode })
      acc[mode] = result.stars
    }
    return acc
  }, {} as Prices)

  logger.info('💰 Расчет стоимости услуг', {
    description: 'Calculating service costs',
    prices,
    telegram_id: ctx.from?.id,
  })

  const message = generatePriceMessage(isRu, prices)
  await ctx.reply(message, { parse_mode: 'HTML' })
}
