import { calculateFinalStarPrice } from '@/pricing/calculator'
import { ModeEnum } from '@/interfaces/modes'
import * as pricingConfig from '@/pricing/config/pricing.config'
import * as modelsConfig from '@/pricing/config/models.config'
import { VIDEO_MODELS_CONFIG } from '@/pricing/config/models.config'

// Моки конфигураций для Jest
jest.mock('@/config/pricing.config', () => {
  const original = jest.requireActual('@/config/pricing.config')
  return {
    ...original,
    STAR_COST_USD: 0.01, // Упрощенная цена для тестов
    MARKUP_MULTIPLIER: 2, // Упрощенная наценка для тестов
    BASE_PRICES_USD: {
      neuro_photo: 0.1,
      digital_avatar_body: 0,
      image_to_video: 0,
      helpScene: 0,
    },
    STEP_BASED_PRICES_USD: {
      digital_avatar_body: 0.02,
    },
    CURRENCY_RATES: {
      USD_TO_RUB: 100, // Упрощенный курс
    },
  }
})

jest.mock('@/config/models.config', () => {
  const original = jest.requireActual('@/config/models.config')
  return {
    ...original,
    VIDEO_MODELS_CONFIG: {
      'model-fast': { id: 'model-fast', name: 'Fast', basePrice: 0.5 },
      'model-slow': { id: 'model-slow', name: 'Slow', basePrice: 1.0 },
    },
  }
})

describe('calculateFinalStarPrice', () => {
  // Очистка моков перед каждым тестом для чистоты
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return null if price cannot be determined', () => {
    // Пример: Неизвестный режим без базовой цены
    const result = calculateFinalStarPrice('unknown-mode' as ModeEnum)
    expect(result).toBeNull()
  })

  it('should calculate price based on BASE_PRICES_USD for fixed price modes', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhoto)
    // Ожидания: base=0.1, markup=2 => finalUSD=0.2
    // stars = ceil(0.2 / 0.01) = ceil(20) = 20
    // rub = 0.2 * 100 = 20
    expect(result).toEqual({ stars: 20, rub: 20, usd: 0.2 })
  })

  it('should calculate price based on steps for STEP_BASED_PRICES_USD modes', () => {
    const steps = 5
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps,
    })
    // Ожидания: pricePerStep=0.02, steps=5 => base=0.1
    // markup=2 => finalUSD=0.2
    // stars = ceil(0.2 / 0.01) = ceil(20) = 20
    // rub = 0.2 * 100 = 20
    expect(result).toEqual({ stars: 20, rub: 20, usd: 0.2 })
  })

  it('should calculate price based on modelId for VIDEO_MODELS_CONFIG modes', () => {
    const modelId = 'model-fast'
    const result = calculateFinalStarPrice(ModeEnum.ImageToVideo, { modelId })
    // Ожидания: modelPrice=0.5 => base=0.5
    // markup=2 => finalUSD=1.0
    // stars = ceil(1.0 / 0.01) = ceil(100) = 100
    // rub = 1.0 * 100 = 100
    expect(result).toEqual({ stars: 100, rub: 100, usd: 1.0 })
  })

  it('should return price for free modes as 0 stars', () => {
    const result = calculateFinalStarPrice(ModeEnum.HelpScene)
    // Ожидания: base=0 => finalUSD=0
    // stars = ceil(0 / 0.01) = 0
    // rub = 0 * 100 = 0
    expect(result).toEqual({ stars: 0, rub: 0, usd: 0 })
  })

  // TODO: Добавить тесты на граничные случаи и ошибки
  // - steps = 0 или отрицательное
  // - modelId не найден
  // - Приоритет modelId над steps и base price
  // - Приоритет steps над base price
})
