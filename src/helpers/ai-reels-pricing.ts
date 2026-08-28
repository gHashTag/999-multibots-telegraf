/**
 * AI Reels Dynamic Pricing Calculator
 * Расчет стоимости с учетом B-роллов, длины аудио и типа аватара
 */

interface AIReelsPricingOptions {
  text: string
  avatarService: 'hedra' | 'heygen' | 'fal'
  isOwnHeyGenKey?: boolean
  isOwnFalKey?: boolean
  markupMultiplier?: number
}

interface PriceBreakdown {
  audioDuration: number
  bRollCount: number
  elevenLabsCost: number
  veo31Cost: number
  avatarCost: number
  infrastructureCost: number
  subtotal: number
  finalPrice: number
  priceInRubles: number
}

const STAR_TO_RUB_RATE = 1.36 // Текущий курс

/**
 * Рассчитывает полную стоимость AI Reels
 */
export function calculateAIReelsPrice(
  options: AIReelsPricingOptions
): PriceBreakdown {
  const {
    text,
    avatarService,
    isOwnHeyGenKey = false,
    isOwnFalKey = false,
    markupMultiplier = 1.5, // Наценка x1.5 как в коде
  } = options

  // Расчет длительности аудио (примерно 60 символов в секунду речи)
  const audioDuration = Math.ceil(text.length * 0.06)

  // Количество B-роллов (по 8 секунд каждый)
  const bRollCount = Math.ceil(audioDuration / 8)

  // Стоимость компонентов (в звездах)
  const elevenLabsCost = audioDuration * 0.5 // ~0.5⭐/сек
  // Veo 3 Fast через Kie.ai: $0.40 за 8 сек = 40⭐ (официальная цена)
  const veo31Cost = bRollCount * 40 // 40⭐ за 8-сек клип Veo 3 Fast

  // Стоимость аватара
  let avatarCost = 0
  if (avatarService === 'hedra') {
    avatarCost = audioDuration * 5 // ~5⭐/сек для Hedra
  } else if (avatarService === 'heygen') {
    if (isOwnHeyGenKey) {
      avatarCost = 0 // Клиент использует свой API ключ
    } else {
      avatarCost = audioDuration * 3 // ~3⭐/сек амортизация наших ключей
    }
  } else if (avatarService === 'fal') {
    if (isOwnFalKey) {
      avatarCost = 0 // Клиент использует свой API ключ
    } else {
      avatarCost = audioDuration * 4 // ~4⭐/сек для Fal (среднее между Hedra и HeyGen)
    }
  }

  // Инфраструктура
  const infrastructureCost = 25 + bRollCount * 5 // База + доп. за каждый B-ролл

  // Итоговый расчет
  const subtotal = elevenLabsCost + veo31Cost + avatarCost + infrastructureCost
  const finalPrice = Math.ceil(subtotal * markupMultiplier)
  const priceInRubles = Math.round(finalPrice * STAR_TO_RUB_RATE)

  return {
    audioDuration,
    bRollCount,
    elevenLabsCost,
    veo31Cost,
    avatarCost,
    infrastructureCost,
    subtotal,
    finalPrice,
    priceInRubles,
  }
}

/**
 * Формирует читаемое сообщение о цене для пользователя
 */
export function formatPriceMessage(
  breakdown: PriceBreakdown,
  isRussian: boolean = true
): string {
  if (isRussian) {
    return `📊 **Расчет стоимости AI Reels:**

⏱ Длительность видео: ${breakdown.audioDuration} сек
🎬 B-роллы (фон): ${breakdown.bRollCount} шт × 40⭐ = ${breakdown.veo31Cost}⭐
   _Каждый B-roll = 8 сек видео Veo 3 Fast_
🎤 Озвучка (ElevenLabs): ${breakdown.elevenLabsCost}⭐
👤 Аватар (lip-sync): ${breakdown.avatarCost}⭐
🔧 Обработка и хранение: ${breakdown.infrastructureCost}⭐

💰 **Итого: ${breakdown.finalPrice}⭐** (~${breakdown.priceInRubles}₽)

💡 _Цена зависит от длины текста: больше текста = больше B-роллов_`
  } else {
    return `📊 **AI Reels Price Calculation:**

⏱ Video duration: ${breakdown.audioDuration} sec
🎬 B-rolls (background): ${breakdown.bRollCount} × 40⭐ = ${breakdown.veo31Cost}⭐
   _Each B-roll = 8 sec Veo 3 Fast video_
🎤 Voice (ElevenLabs): ${breakdown.elevenLabsCost}⭐
👤 Avatar (lip-sync): ${breakdown.avatarCost}⭐
🔧 Processing & storage: ${breakdown.infrastructureCost}⭐

💰 **Total: ${breakdown.finalPrice}⭐** (~${breakdown.priceInRubles}₽)

💡 _Price depends on text length: more text = more B-rolls_`
  }
}
