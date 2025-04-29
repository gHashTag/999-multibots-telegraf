import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ModeEnum } from '@/interfaces/modes' // Переносим импорт сюда

// Move mock before imports
// Corrected path for mock - Now using actual values
vi.mock('@/config/pricing.config', async () => {
  // No need to import actual, just return the mock values
  return {
    STAR_COST_USD: 0.016,
    MARKUP_MULTIPLIER: 1.5,
    BASE_PRICES_USD: {
      [ModeEnum.NeuroPhoto]: 0.1,
      [ModeEnum.NeuroPhotoV2]: 0.15,
      [ModeEnum.VoiceToText]: 0.05,
      [ModeEnum.ImageToPrompt]: 0, // Free
      [ModeEnum.TextToSpeech]: 0.02,
      [ModeEnum.LipSync]: 0.03,
      [ModeEnum.MainMenu]: 0, // Free
      // Add other modes as needed or assume 0
    },
    STEP_BASED_PRICES_USD: {
      [ModeEnum.DigitalAvatarBody]: 0.1,
      [ModeEnum.DigitalAvatarBodyV2]: 0.2,
    },
    CURRENCY_RATES: {
      USD_TO_RUB: 100,
    },
  }
})

// Mock models.config if needed for model-based tests (uncomment if necessary)
// vi.mock('@/config/models.config', async () => {
//   const original = await vi.importActual<typeof import('@/config/models.config')>('@/config/models.config');
//   return {
//     ...original,
//     // VIDEO_MODELS_CONFIG: { ... }, // Example: Define specific models for tests
//     // IMAGES_MODELS_CONFIG: { ... },
//     // VOICE_MODELS_CONFIG: { ... },
//   };
// });

// Import the function under test *after* the mocks
import { calculateFinalStarPrice } from '@/price/calculator'

describe('calculateFinalStarPrice - General Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks() // Use vitest
  })

  // --- Тесты для Общих Случаев ---
  it('should return 0 for unknown/unconfigured modes', () => {
    const result = calculateFinalStarPrice('unknown-mode' as ModeEnum)
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  // --- Тесты для Базовых Цен (BASE_PRICES_USD) - USING MOCK ---
  it('should calculate price for NeuroPhoto (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhoto)
    // Calculation: baseUSD=0.1, costUSD=0.016, markup=1.5
    // finalStars = floor((0.1 / 0.016) * 1.5) = floor(6.25 * 1.5) = floor(9.375) = 9
    // finalUSD = base * markup = 0.1 * 1.5 = 0.15
    // finalRUB = finalUSD * rate = 0.15 * 100 = 15
    //expect(result).toEqual({ stars: 9, rubles: 15, dollars: 0.15 });
    expect(result?.stars).toBe(9)
    expect(result?.rubles).toBeCloseTo(15)
    expect(result?.dollars).toBeCloseTo(0.15)
  })

  it('should calculate price for NeuroPhotoV2 (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhotoV2)
    // Calculation: baseUSD=0.15, costUSD=0.016, markup=1.5
    // finalStars = floor((0.15 / 0.016) * 1.5) = floor(9.375 * 1.5) = floor(14.0625) = 14
    // finalUSD = base * markup = 0.15 * 1.5 = 0.225
    // finalRUB = finalUSD * rate = 0.225 * 100 = 22.5
    //expect(result).toEqual({ stars: 14, rubles: 22.5, dollars: 0.225 });
    expect(result?.stars).toBe(14)
    expect(result?.rubles).toBeCloseTo(22.5)
    expect(result?.dollars).toBeCloseTo(0.225)
  })

  it('should calculate price for VoiceToText (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.VoiceToText)
    // Calculation: baseUSD=0.05, costUSD=0.016, markup=1.5
    // finalStars = floor((0.05 / 0.016) * 1.5) = floor(3.125 * 1.5) = floor(4.6875) = 4
    // finalUSD = base * markup = 0.05 * 1.5 = 0.075
    // finalRUB = finalUSD * rate = 0.075 * 100 = 7.5
    //expect(result).toEqual({ stars: 4, rubles: 7.5, dollars: 0.075 });
    expect(result?.stars).toBe(4)
    expect(result?.rubles).toBeCloseTo(7.5)
    expect(result?.dollars).toBeCloseTo(0.075)
  })

  it('should calculate price for TextToSpeech (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToSpeech)
    // Calculation: baseUSD=0.02, costUSD=0.016, markup=1.5
    // finalStars = floor((0.02 / 0.016) * 1.5) = floor(1.25 * 1.5) = floor(1.875) = 1
    // finalUSD = base * markup = 0.02 * 1.5 = 0.03
    // finalRUB = finalUSD * rate = 0.03 * 100 = 3
    expect(result).toEqual({ stars: 1, rubles: 3, dollars: 0.03 })
  })

  it('should calculate price for LipSync (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.LipSync)
    // Calculation: baseUSD=0.03, costUSD=0.016, markup=1.5
    // finalStars = floor((0.03 / 0.016) * 1.5) = floor(1.875 * 1.5) = floor(2.8125) = 2
    // finalUSD = base * markup = 0.03 * 1.5 = 0.045
    // finalRUB = finalUSD * rate = 0.045 * 100 = 4.5
    expect(result).toEqual({ stars: 2, rubles: 4.5, dollars: 0.045 })
  })

  it('should return 0 for MainMenu (free mode)', () => {
    const result = calculateFinalStarPrice(ModeEnum.MainMenu)
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  it('should return 0 for ImageToPrompt (free mode)', () => {
    const result = calculateFinalStarPrice(ModeEnum.ImageToPrompt)
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  // --- Тесты для Цен по Шагам (STEP_BASED_PRICES_USD) - USING MOCK ---
  it('should calculate price for DigitalAvatarBody based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: 10,
    })
    // Calculation: stepBaseUSD=0.1, steps=10 => baseUSD=1.0
    // finalStars = floor((1.0 / 0.016) * 1.5) = floor(62.5 * 1.5) = floor(93.75) = 93
    // finalUSD = base * markup = 1.0 * 1.5 = 1.5
    // finalRUB = finalUSD * rate = 1.5 * 100 = 150
    expect(result).toEqual({ stars: 93, rubles: 150, dollars: 1.5 })
  })

  it('should calculate price for DigitalAvatarBodyV2 based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBodyV2, {
      steps: 10,
    })
    // Calculation: stepBaseUSD=0.2, steps=10 => baseUSD=2.0
    // finalStars = floor((2.0 / 0.016) * 1.5) = floor(125 * 1.5) = floor(187.5) = 187
    // finalUSD = base * markup = 2.0 * 1.5 = 3.0
    // finalRUB = finalUSD * rate = 3.0 * 100 = 300
    expect(result).toEqual({ stars: 187, rubles: 300, dollars: 3.0 })
  })

  it('should return 0 for DigitalAvatarBody when steps = 0', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: 0,
    })
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  it('should return 0 for DigitalAvatarBody when steps is negative', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: -5,
    })
    // Base price becomes negative or 0, leading to 0 stars after floor.
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  it('should return 0 for DigitalAvatarBody when steps is not provided', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody)
    // Base price depends on steps, if steps not provided, base price is 0.
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  // --- Тесты для Цен по Моделям Изображений (Пока НЕ реализовано в калькуляторе) ---
  // TODO: Add tests when model-based pricing is implemented in calculator
  it('should return 0 for TextToImage (as no specific model logic exists yet)', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToImage)
    // Assuming it falls back to 0 if BASE_PRICES_USD is not set for it and no modelId provided
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  it('should return 0 for TextToImage even if modelId is provided (no model logic yet)', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToImage, {
      modelId: 'some-image-model',
    })
    // Assuming no logic to read from models.config yet
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  // --- Тесты для Цен по Моделям Видео (Пока НЕ реализовано в калькуляторе) ---
  // TODO: Add tests when model-based pricing is implemented in calculator
  it('should return 0 for TextToVideo (as no specific model logic exists yet)', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo)
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  it('should return 0 for ImageToVideo (as no specific model logic exists yet)', () => {
    const result = calculateFinalStarPrice(ModeEnum.ImageToVideo)
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  // TODO: Добавить тесты на граничные случаи и ошибки (если еще нужны)
  // TODO: Добавить тесты на приоритеты (если логика усложнится)
  // TODO: Add tests for model-based pricing once implemented in calculator.ts
})
