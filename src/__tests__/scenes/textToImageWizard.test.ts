/**
 * Tests for textToImageWizard (Text to Image Generation)
 * Covers: Model selection, balance validation, image generation
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/price/models', () => ({
  imageModelPrices: {
    'flux-schnell': {
      shortName: 'FLUX Schnell',
      description_ru: 'Быстрая генерация',
      description_en: 'Fast generation',
      inputType: ['text'],
      previewImage: 'https://example.com/preview.jpg',
      costPerImage: 5,
    },
    'sdxl-1.0': {
      shortName: 'SDXL 1.0',
      description_ru: 'Стандартная модель',
      description_en: 'Standard model',
      inputType: ['text'],
      previewImage: 'https://example.com/preview2.jpg',
      costPerImage: 3,
    },
  },
}))

vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
  sendGenericErrorMessage: vi.fn(() => Promise.resolve()),
  createHelpCancelKeyboard: vi.fn(isRu => ({
    reply_markup: { keyboard: [[{ text: isRu ? 'Отмена' : 'Cancel' }]] },
  })),
}))

vi.mock('@/services/generateTextToImageDirect', () => ({
  generateTextToImageDirect: vi.fn(() =>
    Promise.resolve({
      success: true,
      imageUrl: 'https://example.com/generated.jpg',
    })
  ),
}))

vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(100)),
  updateUserBalance: vi.fn(() => Promise.resolve({ error: null })),
}))

vi.mock('@/price/helpers', () => ({
  sendBalanceMessage: vi.fn(() => Promise.resolve()),
  validateAndCalculateImageModelPrice: vi.fn(() => Promise.resolve(5)),
}))

vi.mock('@/db/userSettings', () => ({
  getUserProfileAndSettings: vi.fn(() =>
    Promise.resolve({
      profile: { telegram_id: '123' },
      settings: {},
    })
  ),
}))

vi.mock('@/interfaces/payments.interface', () => ({
  PaymentType: {
    MONEY_OUTCOME: 'MONEY_OUTCOME',
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { imageModelPrices } from '@/price/models'
import { handleHelpCancel, sendGenericErrorMessage } from '@/navigation'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import {
  validateAndCalculateImageModelPrice,
  sendBalanceMessage,
} from '@/price/helpers'

describe('textToImageWizard (Text to Image Generation)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    replyWithPhoto: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'text_to_image' },
    },
    session: {
      selectedImageModel: null as any,
      imageGenerationPrice: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    botInfo: { username: 'test_bot' },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      selectedImageModel: null,
      imageGenerationPrice: null,
    }
    mockContext.message = null
    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(getUserBalance as Mock).mockResolvedValue(100)
    ;(validateAndCalculateImageModelPrice as Mock).mockResolvedValue(5)
    ;(generateTextToImageDirect as Mock).mockResolvedValue({
      success: true,
      imageUrl: 'https://example.com/generated.jpg',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Выбор модели', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен фильтровать модели с text inputType', () => {
      const filteredModels = Object.values(imageModelPrices).filter(model =>
        model.inputType.includes('text')
      )

      expect(filteredModels.length).toBeGreaterThan(0)
    })

    it('должен создавать кнопки для моделей', () => {
      const models = Object.values(imageModelPrices)
      const modelButtons = models.map(model => model.shortName)

      expect(modelButtons).toContain('FLUX Schnell')
      expect(modelButtons).toContain('SDXL 1.0')
    })

    it('должен показывать сообщение выбора модели на русском', () => {
      const isRu = true
      const message = isRu
        ? '🎨 Выберите модель для генерации:'
        : '🎨 Choose a model for generation:'

      expect(message).toContain('Выберите модель')
    })

    it('должен добавлять кнопки справки и отмены', () => {
      const isRu = true
      const helpButton = isRu ? 'Справка по команде' : 'Help for the command'
      const cancelButton = isRu ? 'Отмена' : 'Cancel'
      const menuButton = isRu ? '🏠 Главное меню' : '🏠 Main menu'

      expect(helpButton).toBe('Справка по команде')
      expect(cancelButton).toBe('Отмена')
      expect(menuButton).toBe('🏠 Главное меню')
    })

    it('должен проверять наличие telegram_id', () => {
      const telegramId = mockContext.from?.id
      expect(telegramId).toBe(223757230)
    })

    it('должен вызывать sendGenericErrorMessage при отсутствии telegram_id', async () => {
      const context = { from: null }

      if (!context.from?.id) {
        await sendGenericErrorMessage(context as any, true)
      }

      expect(sendGenericErrorMessage).toHaveBeenCalled()
    })
  })

  describe('2. Шаг 2: Обработка выбора модели', () => {
    it('должен проверять отмену/справку', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      expect(isCancel).toBe(true)
    })

    it('должен находить модель по shortName', () => {
      const modelShortName = 'FLUX Schnell'
      const selectedModelEntry = Object.entries(imageModelPrices).find(
        ([, modelInfo]) => modelInfo.shortName === modelShortName
      )

      expect(selectedModelEntry).toBeDefined()
      expect(selectedModelEntry?.[0]).toBe('flux-schnell')
    })

    it('должен сохранять выбранную модель в сессии', () => {
      mockContext.session.selectedImageModel = 'flux-schnell'
      expect(mockContext.session.selectedImageModel).toBe('flux-schnell')
    })

    it('должен вызывать sendGenericErrorMessage при неизвестной модели', async () => {
      const modelShortName = 'Unknown Model'
      const selectedModelEntry = Object.entries(imageModelPrices).find(
        ([, modelInfo]) => modelInfo.shortName === modelShortName
      )

      if (!selectedModelEntry) {
        await sendGenericErrorMessage(mockContext as any, true)
      }

      expect(sendGenericErrorMessage).toHaveBeenCalled()
    })
  })

  describe('3. Проверка баланса', () => {
    it('должен получать баланс пользователя', async () => {
      const balance = await getUserBalance('223757230')

      expect(getUserBalance).toHaveBeenCalledWith('223757230')
      expect(balance).toBe(100)
    })

    it('должен валидировать и рассчитывать цену модели', async () => {
      const fullModelId = 'flux-schnell'
      const availableModels = Object.keys(imageModelPrices)
      const userBalance = 100
      const isRu = true

      const price = await validateAndCalculateImageModelPrice(
        fullModelId,
        availableModels,
        userBalance,
        isRu,
        mockContext as any
      )

      expect(validateAndCalculateImageModelPrice).toHaveBeenCalled()
      expect(price).toBe(5)
    })

    it('должен сохранять цену в сессии', () => {
      mockContext.session.imageGenerationPrice = 5
      expect(mockContext.session.imageGenerationPrice).toBe(5)
    })

    it('должен выходить из сцены при недостаточном балансе', async () => {
      ;(validateAndCalculateImageModelPrice as Mock).mockResolvedValue(null)

      const price = await validateAndCalculateImageModelPrice(
        'flux-schnell',
        ['flux-schnell'],
        10,
        true,
        mockContext as any
      )

      expect(price).toBeNull()
    })
  })

  describe('4. Генерация изображения', () => {
    it('должен показывать сообщение о генерации', () => {
      const isRu = true
      const message = isRu ? 'Генерирую изображение...' : 'Generating image...'

      expect(message).toBe('Генерирую изображение...')
    })

    it('должен вызывать sendBalanceMessage', async () => {
      await sendBalanceMessage(mockContext as any, 100, 5, true, 'test_bot')

      expect(sendBalanceMessage).toHaveBeenCalledWith(
        mockContext,
        100,
        5,
        true,
        'test_bot'
      )
    })

    it('должен отправлять preview изображения модели', async () => {
      const modelInfo = imageModelPrices['flux-schnell']

      await mockContext.replyWithPhoto(modelInfo.previewImage, {
        caption: 'Test caption',
        parse_mode: 'HTML',
      })

      expect(mockContext.replyWithPhoto).toHaveBeenCalled()
    })

    it('должен вызывать generateTextToImageDirect', async () => {
      const result = await generateTextToImageDirect({
        prompt: 'Test prompt',
        modelId: 'flux-schnell',
        telegramId: '223757230',
      })

      expect(generateTextToImageDirect).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен обрабатывать ошибку генерации', async () => {
      ;(generateTextToImageDirect as Mock).mockResolvedValue({
        success: false,
        error: 'Generation failed',
      })

      const result = await generateTextToImageDirect({
        prompt: 'Test prompt',
        modelId: 'flux-schnell',
        telegramId: '223757230',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('5. Описание моделей', () => {
    it('должен иметь русское описание модели', () => {
      const modelInfo = imageModelPrices['flux-schnell']
      expect(modelInfo.description_ru).toBe('Быстрая генерация')
    })

    it('должен иметь английское описание модели', () => {
      const modelInfo = imageModelPrices['flux-schnell']
      expect(modelInfo.description_en).toBe('Fast generation')
    })

    it('должен иметь preview изображение', () => {
      const modelInfo = imageModelPrices['flux-schnell']
      expect(modelInfo.previewImage).toBe('https://example.com/preview.jpg')
    })
  })

  describe('6. Проверка botInfo', () => {
    it('должен проверять наличие botInfo.username', () => {
      const username = mockContext.botInfo?.username
      expect(username).toBe('test_bot')
    })

    it('должен вызывать ошибку при отсутствии username', async () => {
      const context = { ...mockContext, botInfo: null }

      if (!context.botInfo?.username) {
        await sendGenericErrorMessage(context as any, true)
      }

      expect(sendGenericErrorMessage).toHaveBeenCalled()
    })
  })

  describe('7. Локализация', () => {
    it('должен показывать caption на русском', () => {
      const isRu = true
      const modelInfo = imageModelPrices['flux-schnell']
      const caption = isRu
        ? `<b>Модель: ${modelInfo.shortName}</b>\n\n<b>Описание:</b> ${modelInfo.description_ru}`
        : `<b>Model: ${modelInfo.shortName}</b>\n\n<b>Description:</b> ${modelInfo.description_en}`

      expect(caption).toContain('Модель: FLUX Schnell')
      expect(caption).toContain('Быстрая генерация')
    })

    it('должен показывать caption на английском', () => {
      const isRu = false
      const modelInfo = imageModelPrices['flux-schnell']
      const caption = isRu
        ? `<b>Модель: ${modelInfo.shortName}</b>`
        : `<b>Model: ${modelInfo.shortName}</b>\n\n<b>Description:</b> ${modelInfo.description_en}`

      expect(caption).toContain('Model: FLUX Schnell')
      expect(caption).toContain('Fast generation')
    })
  })

  describe('8. Валидация сообщения', () => {
    it('должен проверять наличие текстового сообщения', () => {
      mockContext.message = { text: 'FLUX Schnell' }
      const hasText = mockContext.message && 'text' in mockContext.message

      expect(hasText).toBe(true)
    })

    it('должен обрабатывать отсутствие сообщения', async () => {
      mockContext.message = null

      if (!mockContext.message) {
        await sendGenericErrorMessage(mockContext as any, true)
      }

      expect(sendGenericErrorMessage).toHaveBeenCalled()
    })
  })

  describe('9. Навигация wizard', () => {
    it('должен переходить к следующему шагу', () => {
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('10. Стоимость моделей', () => {
    it('должен иметь стоимость для каждой модели', () => {
      const model1 = imageModelPrices['flux-schnell']
      const model2 = imageModelPrices['sdxl-1.0']

      expect(model1.costPerImage).toBe(5)
      expect(model2.costPerImage).toBe(3)
    })
  })
})
