import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ModeEnum } from '@/interfaces/modes' // Переносим импорт сюда

// Corrected path for mock - Now using actual values from pricing.config.ts
vi.mock('@/config/pricing.config', async () => {
  // Values taken directly from src/config/pricing.config.ts
  return {
    STAR_COST_USD: 0.016,
    MARKUP_MULTIPLIER: 1.5,
    BASE_PRICES_USD: {
      [ModeEnum.NeuroPhoto]: 0.1,
      [ModeEnum.NeuroPhotoV2]: 0.15,
      [ModeEnum.VoiceToText]: 0.05,
      [ModeEnum.MainMenu]: 0,
      [ModeEnum.ImageToPrompt]: 0,
      [ModeEnum.TextToSpeech]: 0.02,
      [ModeEnum.LipSync]: 0.03,
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

// Mock models.config for testing model-based pricing
vi.mock('@/config/models.config', async () => {
  const original = await vi.importActual<
    typeof import('@/config/models.config')
  >('@/config/models.config')
  return {
    ...original,
    VIDEO_MODELS_CONFIG: {
      'ray-v2': {
        id: 'ray-v2',
        title: 'Ray-v2',
        inputType: ['text', 'image'],
        description: 'Test description',
        basePrice: 0.18, // Test price
        api: { model: 'luma/ray-2-720p', input: {} },
        imageKey: 'start_image_url',
      },
      minimax: {
        id: 'minimax',
        title: 'Minimax',
        inputType: ['text', 'image'],
        description: 'Test description',
        basePrice: 0.5, // Test price
        api: { model: 'minimax/video-01', input: {} },
        imageKey: 'first_frame_image',
      },
    },
    IMAGES_MODELS: {
      'flux-pro': {
        shortName: 'FLUX1.1 [pro]',
        description_en: `Test desc`,
        description_ru: `Тест опис`,
        previewImage: 'test.jpg',
        basePrice: 0.055, // Test price
        inputType: ['text', 'image'],
      },
    },
    // VOICE_MODELS_CONFIG: { ... }, // Add if needed
  }
})

// Import the function under test *after* the mocks
import { calculateFinalStarPrice } from '@/price/calculator'

describe('calculateFinalStarPrice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    // finalStars = floor((0.1 / 0.016) * 1.5) = floor(9.375) = 9
    expect(result?.stars).toBe(9)
    expect(result?.rubles).toBeCloseTo(15)
    expect(result?.dollars).toBeCloseTo(0.15)
  })

  it('should calculate price for NeuroPhotoV2 (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhotoV2)
    // Calculation: baseUSD=0.15, costUSD=0.016, markup=1.5
    // finalStars = floor((0.15 / 0.016) * 1.5) = floor(14.0625) = 14
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
    // finalStars = floor(1.875) = 1
    expect(result).toEqual({ stars: 1, rubles: 3, dollars: 0.03 })
  })

  it('should calculate price for LipSync (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.LipSync)
    // Calculation: baseUSD=0.03, costUSD=0.016, markup=1.5
    // finalStars = floor(2.8125) = 2
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
    // finalStars = floor((1.0 / 0.016) * 1.5) = floor(93.75) = 93
    expect(result).toEqual({ stars: 93, rubles: 150, dollars: 1.5 })
  })

  it('should calculate price for DigitalAvatarBodyV2 based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBodyV2, {
      steps: 10,
    })
    // Calculation: stepBaseUSD=0.2, steps=10 => baseUSD=2.0
    // finalStars = floor((2.0 / 0.016) * 1.5) = floor(187.5) = 187
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

  // --- NEW: Тесты для Цен по Моделям ---

  it('should calculate price for TextToVideo based on modelId', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo, {
      modelId: 'ray-v2',
    })
    // Calculation: basePriceUSD=0.18 (from mock VIDEO_MODELS_CONFIG)
    // finalStars = floor((0.18 / 0.016) * 1.5) = floor(11.25 * 1.5) = floor(16.875) = 16
    expect(result?.stars).toBe(16)
    expect(result?.rubles).toBeCloseTo(27) // 0.18 * 1.5 * 100
    expect(result?.dollars).toBeCloseTo(0.27) // 0.18 * 1.5
  })

  it('should calculate price for ImageToVideo based on modelId', () => {
    const result = calculateFinalStarPrice(ModeEnum.ImageToVideo, {
      modelId: 'minimax',
    })
    // Calculation: basePriceUSD=0.5 (from mock VIDEO_MODELS_CONFIG)
    // finalStars = floor((0.5 / 0.016) * 1.5) = floor(31.25 * 1.5) = floor(46.875) = 46
    expect(result?.stars).toBe(46)
    expect(result?.rubles).toBeCloseTo(75) // 0.5 * 1.5 * 100
    expect(result?.dollars).toBeCloseTo(0.75) // 0.5 * 1.5
  })

  it('should calculate price for TextToImage based on modelId', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToImage, {
      modelId: 'flux-pro',
    })
    // Calculation: basePriceUSD=0.055 (from mock IMAGES_MODELS)
    // finalStars = floor((0.055 / 0.016) * 1.5) = floor(3.4375 * 1.5) = floor(5.15625) = 5
    expect(result?.stars).toBe(5)
    expect(result?.rubles).toBeCloseTo(8.25) // 0.055 * 1.5 * 100
    expect(result?.dollars).toBeCloseTo(0.0825) // 0.055 * 1.5
  })

  it('should return 0 if modelId is provided but not found in config', () => {
    const resultText = calculateFinalStarPrice(ModeEnum.TextToImage, {
      modelId: 'non-existent-image',
    })
    const resultVideo = calculateFinalStarPrice(ModeEnum.TextToVideo, {
      modelId: 'non-existent-video',
    })
    expect(resultText).toEqual({ stars: 0, rubles: 0, dollars: 0 })
    expect(resultVideo).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  it('should return 0 if mode requires modelId but it is not provided', () => {
    const resultText = calculateFinalStarPrice(ModeEnum.TextToImage)
    const resultVideo = calculateFinalStarPrice(ModeEnum.TextToVideo)
    const resultImage = calculateFinalStarPrice(ModeEnum.ImageToVideo)
    expect(resultText).toEqual({ stars: 0, rubles: 0, dollars: 0 })
    expect(resultVideo).toEqual({ stars: 0, rubles: 0, dollars: 0 })
    expect(resultImage).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  // --- NEW: Тесты для numImages ---

  it('should multiply price by numImages when provided', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhoto, {
      numImages: 3,
    })
    // Calculation: baseUSD=0.1, costUSD=0.016, markup=1.5, numImages=3
    // finalStars = floor((0.1 / 0.016) * 1.5 * 3) = floor(9.375 * 3) = floor(28.125) = 28
    expect(result?.stars).toBe(28)
    expect(result?.rubles).toBeCloseTo(45) // 0.15 * 3 * 100
    expect(result?.dollars).toBeCloseTo(0.45) // 0.15 * 3
  })

  it('should ignore numImages for modes where it is not applicable (e.g., video, steps)', () => {
    const resultVideo = calculateFinalStarPrice(ModeEnum.TextToVideo, {
      modelId: 'ray-v2',
      numImages: 5, // Should be ignored
    })
    const resultSteps = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: 10,
      numImages: 5, // Should be ignored
    })

    // Results should be the same as without numImages
    expect(resultVideo?.stars).toBe(16)
    expect(resultSteps?.stars).toBe(93)
  })

  it('should default numImages to 1 if not provided for applicable modes', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhoto) // numImages not provided
    expect(result?.stars).toBe(9) // Same as the test with numImages = 1 implicitly
  })

  // --- NEW: Тесты на округление ---
  it.skip('should correctly floor the final star count', async () => {
    // Mock config to get a result just below an integer before flooring
    vi.doMock('@/config/pricing.config', async () => ({
      STAR_COST_USD: 0.01,
      MARKUP_MULTIPLIER: 1.99, // ~1.99
      BASE_PRICES_USD: { [ModeEnum.NeuroPhoto]: 0.1 }, // base=0.1
      STEP_BASED_PRICES_USD: {},
      CURRENCY_RATES: { USD_TO_RUB: 100 },
    }))
    // Need to re-import after doMock - trying different import style
    const calculatorModule = await import('@/price/calculator')
    const result = calculatorModule.calculateFinalStarPrice(ModeEnum.NeuroPhoto)
    // Calculation: (0.1 / 0.01) * 1.99 = 10 * 1.99 = 19.9
    // finalStars = floor(19.9) = 19
    expect(result?.stars).toBe(19)
    vi.doUnmock('@/config/pricing.config') // Clean up mock
  })

  // TODO: Добавить тесты на граничные случаи и ошибки (если еще нужны)
})
