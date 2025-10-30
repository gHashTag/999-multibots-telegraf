/**
 * AI Reels Dynamic Pricing Calculator
 * Расчет стоимости с учетом B-роллов, длины аудио и типа аватара
 */

interface AIReelsPricingOptions {
  text: string
  avatarService: 'hedra' | 'heygen'
  isOwnHeyGenKey?: boolean
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
export function calculateAIReelsPrice(options: AIReelsPricingOptions): PriceBreakdown {
  const {
    text,
    avatarService,
    isOwnHeyGenKey = false,
    markupMultiplier = 2.0
  } = options

  // Расчет длительности аудио (примерно 60 символов в секунду речи)
  const audioDuration = Math.ceil(text.length * 0.06)

  // Количество B-роллов (по 8 секунд каждый)
  const bRollCount = Math.ceil(audioDuration / 8)

  // Стоимость компонентов (в звездах)
  const elevenLabsCost = audioDuration * 0.5 // ~0.5⭐/сек
  const veo31Cost = bRollCount * 160 // 160⭐ за 8-сек клип

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
  }

  // Инфраструктура
  const infrastructureCost = 25 + (bRollCount * 5) // База + доп. за каждый B-ролл

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
    priceInRubles
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

⏱ Длительность: ${breakdown.audioDuration} сек
🎬 B-роллы (Veo 3.1): ${breakdown.bRollCount} × 160⭐ = ${breakdown.veo31Cost}⭐
🎤 Озвучка (ElevenLabs): ${breakdown.elevenLabsCost}⭐
👤 Аватар: ${breakdown.avatarCost}⭐
🔧 Обработка: ${breakdown.infrastructureCost}⭐

💰 **Итого: ${breakdown.finalPrice}⭐** (~${breakdown.priceInRubles}₽)`
  } else {
    return `📊 **AI Reels Price Calculation:**

⏱ Duration: ${breakdown.audioDuration} sec
🎬 B-rolls (Veo 3.1): ${breakdown.bRollCount} × 160⭐ = ${breakdown.veo31Cost}⭐
🎤 Voice (ElevenLabs): ${breakdown.elevenLabsCost}⭐
👤 Avatar: ${breakdown.avatarCost}⭐
🔧 Processing: ${breakdown.infrastructureCost}⭐

💰 **Total: ${breakdown.finalPrice}⭐** (~${breakdown.priceInRubles}₽)`
  }
}