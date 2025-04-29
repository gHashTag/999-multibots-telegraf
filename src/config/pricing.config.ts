import { ModeEnum } from '@/interfaces/modes'

/**
 * Конфигурация цен.
 * Единый источник истины для стоимости звезды, наценки и базовых цен.
 */

// Стоимость 1 звезды в USD
export const STAR_COST_USD = 0.016

// Множитель наценки (e.g., 1.5 means 50% markup)
// Значение должно быть > 1 для получения прибыли.
// export const MARKUP_MULTIPLIER = 1.5 // Renamed

// Interest Rate (applied as a multiplier, e.g., 1.5 for 50% markup)
// Must be > 1 to make a profit.
export const INTEREST_RATE = 1.5

// Базовые цены в USD для режимов с фиксированной стоимостью
// Ключ - ModeEnum, значение - базовая цена в USD (до наценки)
export const BASE_PRICES_USD: Partial<Record<ModeEnum, number>> = {
  // Values based on previous tests/assumptions - VERIFY THESE!
  [ModeEnum.NeuroPhoto]: 0.1,
  [ModeEnum.NeuroPhotoV2]: 0.15,
  [ModeEnum.VoiceToText]: 0.05,
  [ModeEnum.MainMenu]: 0, // Main menu is free
  // TODO: Add base prices for other fixed-price modes (e.g., TextToSpeech, LipSync?)
  [ModeEnum.ImageToPrompt]: 0, // Assuming free for now
  [ModeEnum.TextToSpeech]: 0.032, // New price: floor((0.032 / 0.016) * 1.5) = 3 stars
  [ModeEnum.LipSync]: 0.03, // Example - VERIFY!
}

// Базовые цены в USD за один шаг для режимов, зависящих от шагов
// Ключ - ModeEnum, значение - базовая цена одного шага в USD (до наценки)
export const STEP_BASED_PRICES_USD: Partial<Record<ModeEnum, number>> = {
  [ModeEnum.DigitalAvatarBody]: 0.1, // From old DIGITAL_AVATAR_COSTS.v1
  [ModeEnum.DigitalAvatarBodyV2]: 0.2, // From old DIGITAL_AVATAR_COSTS.v2
}

// Курсы валют для конвертации (используются для отображения)
export const CURRENCY_RATES = {
  USD_TO_RUB: 100, // Example rate, update if needed
  // Add other rates if necessary
}

// --- Проверка валидности конфигурации --- (Опционально, но полезно)
if (STAR_COST_USD <= 0) {
  throw new Error('Pricing Config Error: STAR_COST_USD must be positive.')
}

if (INTEREST_RATE <= 1) {
  console.warn(
    'Pricing Config Warning: INTEREST_RATE should be greater than 1 to make a profit.'
  )
}
