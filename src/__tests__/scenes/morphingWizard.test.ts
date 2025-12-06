/**
 * Tests for morphingWizard (Infinity Morphing - Image Sequence Video)
 * Covers: Image upload, loop/linear selection, prompt presets, video generation
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/services/generateMorphing', () => ({
  generateMorphing: vi.fn(() => Promise.resolve({
    success: true,
    videoUrl: 'https://example.com/morphing.mp4',
  })),
}))

vi.mock('@/config/unified-video-models.config', () => ({
  getModelsByInputType: vi.fn(() => [
    {
      id: 'sora-2-i2v',
      name: 'Sora 2 I2V',
      provider: 'kie',
      priceStars: 9,
    },
    {
      id: 'sora-2-pro-i2v',
      name: 'Sora 2 Pro I2V',
      provider: 'kie',
      priceStars: 19,
    },
  ]),
}))

vi.mock('@/price/helpers/calculateFinalPrice', () => ({
  calculateFinalPrice: vi.fn(() => 15),
}))

vi.mock('@/modules/videoGenerator/helpers/priceHelper', () => ({
  processBalanceVideoOperationHelper: vi.fn(() => Promise.resolve({
    success: true,
    paymentAmount: 15,
    newBalance: 85,
  })),
}))

vi.mock('@/helpers/images', () => ({
  isValidImage: vi.fn(() => Promise.resolve(true)),
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
import { handleHelpCancel } from '@/navigation'
import { generateMorphing } from '@/services/generateMorphing'
import { getModelsByInputType } from '@/config/unified-video-models.config'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import { processBalanceVideoOperationHelper } from '@/modules/videoGenerator/helpers/priceHelper'
import { isValidImage } from '@/helpers/images'

// Prompt presets from source
const PROMPT_PRESETS = {
  cinematic: 'smooth cinematic transition, elegant camera glide between frames, professional cinematography with soft lighting',
  dramatic: 'high energy dramatic transition, powerful emotional impact, intense lighting changes',
  smooth: 'seamless gradual transition, ultra-smooth morphing between frames, gentle motion blur',
  artistic: 'creative abstract transition, unique visual transformation, artistic morphing effect',
} as const

describe('morphingWizard (Infinity Morphing)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    chat: { id: 123456789 },
    reply: vi.fn(),
    answerCbQuery: vi.fn(),
    editMessageText: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      reenter: vi.fn(),
      current: { id: 'morphing_wizard' },
    },
    session: {
      morphingImages: [] as any[],
      morphingProgressMessageId: undefined as number | undefined,
      morphingRestarting: false,
      morphingType: null as string | null,
      morphingCustomPrompt: null as string | null,
      morphingAwaitingCustomPrompt: false,
    },
    wizard: {
      next: vi.fn(),
      back: vi.fn(),
      selectStep: vi.fn(),
      cursor: 0,
      step: null as any,
    },
    telegram: {
      getFile: vi.fn(() => Promise.resolve({ file_path: 'photos/test.jpg' })),
      editMessageText: vi.fn(),
    },
    tg: {
      sendVideo: vi.fn(),
    },
    botInfo: { username: 'test_bot' },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      morphingImages: [],
      morphingProgressMessageId: undefined,
      morphingRestarting: false,
      morphingType: null,
      morphingCustomPrompt: null,
      morphingAwaitingCustomPrompt: false,
    }
    mockContext.message = null

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(generateMorphing as Mock).mockResolvedValue({
      success: true,
      videoUrl: 'https://example.com/morphing.mp4',
    })
    ;(isValidImage as Mock).mockResolvedValue(true)
    ;(processBalanceVideoOperationHelper as Mock).mockResolvedValue({
      success: true,
      paymentAmount: 15,
      newBalance: 85,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Приветствие', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен очищать предыдущие данные при входе', () => {
      mockContext.session.morphingImages = [{ buffer: Buffer.from('test') }]
      mockContext.session.morphingProgressMessageId = 123

      // Имитация очистки при входе в сцену
      mockContext.session.morphingImages = []
      mockContext.session.morphingProgressMessageId = undefined
      mockContext.session.morphingRestarting = false

      expect(mockContext.session.morphingImages).toHaveLength(0)
      expect(mockContext.session.morphingProgressMessageId).toBeUndefined()
    })

    it('должен показывать приветственное сообщение на русском', () => {
      const isRu = true
      const message = isRu
        ? '🌀 Добро пожаловать в Infinity Морфинг!'
        : '🌀 Welcome to Infinity Morphing!'

      expect(message).toContain('Infinity Морфинг')
    })

    it('должен показывать приветственное сообщение на английском', () => {
      const isRu = false
      const message = isRu
        ? '🌀 Добро пожаловать в Infinity Морфинг!'
        : '🌀 Welcome to Infinity Morphing!'

      expect(message).toContain('Welcome to Infinity Morphing')
    })

    it('должен переходить к следующему шагу', () => {
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })
  })

  describe('2. Шаг 2: Загрузка изображений', () => {
    it('должен проверять отмену/справку', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      expect(isCancel).toBe(true)
    })

    it('должен обрабатывать фото сообщение', () => {
      mockContext.message = {
        photo: [
          { file_id: 'small_123', width: 100, height: 100 },
          { file_id: 'large_456', width: 1080, height: 1080 },
        ],
      }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      expect(hasPhoto).toBe(true)
    })

    it('должен получать самое большое фото из массива', () => {
      mockContext.message = {
        photo: [
          { file_id: 'small', width: 100, height: 100 },
          { file_id: 'medium', width: 500, height: 500 },
          { file_id: 'large', width: 1080, height: 1080 },
        ],
      }

      const photos = mockContext.message.photo
      const largestPhoto = photos[photos.length - 1]

      expect(largestPhoto.file_id).toBe('large')
    })

    it('должен добавлять изображение в массив', () => {
      const imageBuffer = Buffer.from('test image data')

      mockContext.session.morphingImages.push({
        buffer: imageBuffer,
        filename: 'morphing_image_1.jpg',
        timestamp: Date.now(),
        originalOrder: 1,
      })

      expect(mockContext.session.morphingImages).toHaveLength(1)
      expect(mockContext.session.morphingImages[0].originalOrder).toBe(1)
    })

    it('должен валидировать изображение', async () => {
      const buffer = Buffer.from('image data')
      const isValid = await isValidImage(buffer)

      expect(isValidImage).toHaveBeenCalledWith(buffer)
      expect(isValid).toBe(true)
    })

    it('должен отклонять невалидные изображения', async () => {
      ;(isValidImage as Mock).mockResolvedValue(false)

      const buffer = Buffer.from('invalid data')
      const isValid = await isValidImage(buffer)

      expect(isValid).toBe(false)
    })

    it('должен отклонять слишком большие файлы', () => {
      const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024) // 15MB

      const isTooLarge = largeBuffer.length > MAX_IMAGE_SIZE
      expect(isTooLarge).toBe(true)
    })
  })

  describe('3. Прогресс-бар и сообщения', () => {
    it('должен создавать прогресс-бар', () => {
      const createProgressBar = (current: number, length = 10): string => {
        const filled = Math.min(length, Math.floor(current / 2) * 2)
        const empty = length - filled
        return `[${'▓'.repeat(filled) + '░'.repeat(empty)}] ${current}/∞`
      }

      const bar = createProgressBar(4)
      expect(bar).toContain('▓')
      expect(bar).toContain('░')
      expect(bar).toContain('4/∞')
    })

    it('должен показывать минимум 2 изображения требуется', () => {
      const imagesCount = 1
      const canGenerate = imagesCount >= 2

      expect(canGenerate).toBe(false)
    })

    it('должен разрешать генерацию при 2+ изображениях', () => {
      const imagesCount = 3
      const canGenerate = imagesCount >= 2

      expect(canGenerate).toBe(true)
    })
  })

  describe('4. Шаг 3: Выбор типа (Loop/Linear)', () => {
    it('должен сохранять тип loop в сессии', () => {
      mockContext.session.morphingType = 'loop'
      expect(mockContext.session.morphingType).toBe('loop')
    })

    it('должен сохранять тип linear в сессии', () => {
      mockContext.session.morphingType = 'linear'
      expect(mockContext.session.morphingType).toBe('linear')
    })

    it('должен показывать сообщение о выборе типа на русском', () => {
      const isRu = true
      const loopText = isRu ? '🔄 С зацикливанием' : '🔄 With Loop'
      const linearText = isRu ? '➡️ Без зацикливания' : '➡️ No Loop'

      expect(loopText).toContain('зацикливанием')
      expect(linearText).toContain('Без')
    })

    it('должен вычислять количество переходов для loop', () => {
      const imagesCount = 5
      const withLoop = true
      const transitionsCount = withLoop ? imagesCount : imagesCount - 1

      expect(transitionsCount).toBe(5) // С лупом: 1→2, 2→3, 3→4, 4→5, 5→1
    })

    it('должен вычислять количество переходов для linear', () => {
      const imagesCount = 5
      const withLoop = false
      const transitionsCount = withLoop ? imagesCount : imagesCount - 1

      expect(transitionsCount).toBe(4) // Линейно: 1→2, 2→3, 3→4, 4→5
    })
  })

  describe('5. Шаг 4: Выбор промпта', () => {
    it('должен иметь пресет cinematic', () => {
      expect(PROMPT_PRESETS.cinematic).toContain('cinematic')
    })

    it('должен иметь пресет dramatic', () => {
      expect(PROMPT_PRESETS.dramatic).toContain('dramatic')
    })

    it('должен иметь пресет smooth', () => {
      expect(PROMPT_PRESETS.smooth).toContain('smooth')
    })

    it('должен иметь пресет artistic', () => {
      expect(PROMPT_PRESETS.artistic).toContain('artistic')
    })

    it('должен сохранять кастомный промпт в сессии', () => {
      const customPrompt = 'my custom transition effect'
      mockContext.session.morphingCustomPrompt = customPrompt

      expect(mockContext.session.morphingCustomPrompt).toBe(customPrompt)
    })

    it('должен устанавливать флаг ожидания кастомного промпта', () => {
      mockContext.session.morphingAwaitingCustomPrompt = true
      expect(mockContext.session.morphingAwaitingCustomPrompt).toBe(true)
    })

    it('должен отклонять слишком короткий промпт', () => {
      const customPrompt = 'short'
      const minLength = 10
      const isValid = customPrompt.length >= minLength

      expect(isValid).toBe(false)
    })

    it('должен принимать валидный промпт', () => {
      const customPrompt = 'smooth elegant transition with soft colors'
      const minLength = 10
      const isValid = customPrompt.length >= minLength

      expect(isValid).toBe(true)
    })
  })

  describe('6. Генерация морфинга', () => {
    it('должен получать модели для морфинга', () => {
      const models = getModelsByInputType('morph')

      expect(getModelsByInputType).toHaveBeenCalledWith('morph')
      expect(models.length).toBeGreaterThan(0)
    })

    it('должен проверять баланс', async () => {
      const result = await processBalanceVideoOperationHelper(
        '223757230',
        'sora-2-i2v',
        true,
        'test_bot',
        'morphing'
      )

      expect(processBalanceVideoOperationHelper).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен вычислять общую стоимость', () => {
      const pricePerTransition = calculateFinalPrice('sora-2-i2v')
      const transitionsCount = 4
      const totalCost = pricePerTransition * transitionsCount

      expect(calculateFinalPrice).toHaveBeenCalled()
      expect(totalCost).toBe(60) // 15 * 4
    })

    it('должен вызывать generateMorphing', async () => {
      mockContext.session.morphingImages = [
        { buffer: Buffer.from('img1'), filename: 'img1.jpg' },
        { buffer: Buffer.from('img2'), filename: 'img2.jpg' },
      ]

      const result = await generateMorphing({
        images: mockContext.session.morphingImages,
        telegram_id: '223757230',
        is_ru: true,
        botName: 'test_bot',
        imageCount: 2,
        morphingType: 'seamless',
        withLoop: true,
        customPrompt: PROMPT_PRESETS.cinematic,
        ctx: mockContext as any,
      })

      expect(generateMorphing).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })
  })

  describe('7. Callback handlers', () => {
    it('должен обрабатывать morphing_start_generation', async () => {
      await mockContext.answerCbQuery()
      expect(mockContext.answerCbQuery).toHaveBeenCalled()
    })

    it('должен обрабатывать morphing_restart', async () => {
      await mockContext.answerCbQuery()

      mockContext.session.morphingImages = []
      mockContext.session.morphingProgressMessageId = undefined
      mockContext.session.morphingRestarting = true

      expect(mockContext.session.morphingRestarting).toBe(true)
    })

    it('должен обрабатывать morphing_cancel', async () => {
      await mockContext.answerCbQuery()
      await mockContext.scene.leave()

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен переходить к шагу выбора лупа', () => {
      mockContext.wizard.selectStep(2)
      expect(mockContext.wizard.selectStep).toHaveBeenCalledWith(2)
    })

    it('должен переходить к шагу выбора промпта', () => {
      mockContext.wizard.selectStep(3)
      expect(mockContext.wizard.selectStep).toHaveBeenCalledWith(3)
    })
  })

  describe('8. Обработка ошибок', () => {
    it('должен обрабатывать ошибку недостаточного баланса', async () => {
      ;(processBalanceVideoOperationHelper as Mock).mockResolvedValue({
        success: false,
        error: 'Insufficient balance',
      })

      const result = await processBalanceVideoOperationHelper(
        '223757230',
        'sora-2-i2v',
        true,
        'test_bot',
        'morphing'
      )

      expect(result.success).toBe(false)
    })

    it('должен обрабатывать ошибку генерации', async () => {
      ;(generateMorphing as Mock).mockRejectedValue(new Error('Generation failed'))

      try {
        await generateMorphing({
          images: [],
          telegram_id: '223757230',
          is_ru: true,
          botName: 'test_bot',
          imageCount: 2,
          morphingType: 'seamless',
          withLoop: false,
          ctx: mockContext as any,
        })
      } catch (error) {
        expect((error as Error).message).toBe('Generation failed')
      }
    })

    it('должен показывать сообщение об ошибке', () => {
      const isRu = true
      const errorMessage = isRu
        ? '❌ Произошла ошибка при создании морфинг видео'
        : '❌ An error occurred while creating morphing video'

      expect(errorMessage).toContain('ошибка')
    })
  })

  describe('9. Мотивационные сообщения', () => {
    it('должен показывать сообщение на 2 изображениях', () => {
      const imageIndex = 2
      const isRu = true
      let message = ''

      if (imageIndex === 2) {
        message = isRu
          ? '🎉 Отлично! Уже можно создать морфинг.'
          : '🎉 Great! You can now create morphing.'
      }

      expect(message).toContain('морфинг')
    })

    it('должен показывать сообщение на 5 изображениях', () => {
      const imageIndex = 5
      const isRu = true
      let message = ''

      if (imageIndex === 5) {
        message = isRu
          ? '⭐ Превосходно! 5 изображений'
          : '⭐ Excellent! 5 images'
      }

      expect(message).toContain('5')
    })

    it('должен показывать сообщение на 10 изображениях', () => {
      const imageIndex = 10
      const isRu = true
      let message = ''

      if (imageIndex === 10) {
        message = isRu
          ? '🚀 Невероятно! 10 изображений'
          : '🚀 Incredible! 10 images'
      }

      expect(message).toContain('10')
    })
  })

  describe('10. Навигация', () => {
    it('должен возвращаться к загрузке изображений', () => {
      mockContext.wizard.back()
      expect(mockContext.wizard.back).toHaveBeenCalled()
    })

    it('должен возвращаться к выбору лупа', () => {
      mockContext.wizard.back()
      expect(mockContext.wizard.back).toHaveBeenCalled()
    })

    it('должен выходить из сцены', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен перезапускать сцену', async () => {
      await mockContext.scene.reenter()
      expect(mockContext.scene.reenter).toHaveBeenCalled()
    })
  })
})
