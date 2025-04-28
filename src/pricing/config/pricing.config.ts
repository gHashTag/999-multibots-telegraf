import { ModeEnum } from '@/interfaces/modes'

/**
 * Центральный файл конфигурации ценообразования.
 * Источник истины для всех расчетов стоимости.
 */

// Стоимость 1 звезды в долларах США
export const STAR_COST_USD = 0.016

// Множитель наценки. 1.0 = без наценки, 1.5 = 50% наценка.
export const MARKUP_MULTIPLIER = 1.5

// Базовые цены для различных режимов/операций в долларах США.
// Для режимов с переменной стоимостью (steps, model) здесь может быть базовая цена за единицу или 0.
export const BASE_PRICES_USD: Partial<Record<ModeEnum, number>> = {
  // --- Фиксированные цены (Пример, нужно будет перенести реальные значения) ---
  [ModeEnum.NeuroPhoto]: 0.08,
  [ModeEnum.NeuroPhotoV2]: 0.14,
  [ModeEnum.NeuroAudio]: 0.12,
  [ModeEnum.ImageToPrompt]: 0.03,
  [ModeEnum.Voice]: 0.9, // Очень высокая цена, проверить!
  [ModeEnum.TextToSpeech]: 0.12,
  [ModeEnum.LipSync]: 0.9, // Очень высокая цена, проверить!
  [ModeEnum.VoiceToText]: 0.08,
  [ModeEnum.TextToImage]: 0, // Цена для TextToImage должна зависеть от модели?

  // --- Режимы с динамической/нулевой базовой ценой ---
  [ModeEnum.DigitalAvatarBody]: 0, // Цена будет зависеть от steps, логика в калькуляторе
  [ModeEnum.DigitalAvatarBodyV2]: 0, // Цена будет зависеть от steps, логика в калькуляторе
  [ModeEnum.ImageToVideo]: 0, // Цена будет зависеть от модели, логика в калькуляторе
  [ModeEnum.TextToVideo]: 0, // Цена будет зависеть от модели, логика в калькуляторе

  // --- Бесплатные режимы ---
  [ModeEnum.Avatar]: 0,
  [ModeEnum.ChatWithAvatar]: 0,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.SelectAiTextModel]: 0,
  [ModeEnum.StartScene]: 0,
  [ModeEnum.HelpScene]: 0,
  [ModeEnum.MainMenu]: 0,
  [ModeEnum.Balance]: 0,
  // ... добавить остальные бесплатные режимы ...
}

// (Новый объект) Цены за один шаг для режимов, зависящих от steps
export const STEP_BASED_PRICES_USD: Partial<Record<ModeEnum, number>> = {
  // TODO: Указать реальную цену за шаг!
  [ModeEnum.DigitalAvatarBody]: 0.01, // Пример цены за 1 шаг
  [ModeEnum.DigitalAvatarBodyV2]: 0.01, // Пример цены за 1 шаг
}

// (Опционально) Курсы валют для отображения
export const CURRENCY_RATES = {
  USD_TO_RUB: 100, // Пример
}

console.log('📈 Pricing Config Loaded:')
console.log(`   STAR_COST_USD: ${STAR_COST_USD}`)
console.log(`   MARKUP_MULTIPLIER: ${MARKUP_MULTIPLIER}`)
