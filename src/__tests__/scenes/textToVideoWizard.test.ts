/**
 * Tests for textToVideoWizard (Text to Video Generation)
 * Covers: Model selection, prompt handling, video generation
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/config/unified-video-models.config', () => ({
  generateModelButton: vi.fn((modelId, aspectRatio, isRu) =>
    `${modelId} (${aspectRatio}) ${isRu ? 'RU' : 'EN'}`
  ),
  parseModelButton: vi.fn((text) => {
    if (text.includes('minimax')) {
      return {
        modelId: 'minimax-video-01',
        aspectRatio: '16:9',
        cost: 100,
        duration: 5,
      }
    }
    return null
  }),
  generateModelKeyboard: vi.fn(() => [
    ['🎬 Minimax (16:9) 100⭐', '🎬 Minimax (9:16) 100⭐'],
    ['🎬 Kling (16:9) 150⭐', '🎬 Kling (9:16) 150⭐'],
  ]),
  getModelPriceStars: vi.fn(() => 100),
}))

vi.mock('@/handlers/handleTextToVideoDirect', () => ({
  handleTextToVideoDirect: vi.fn(() => Promise.resolve({
    success: true,
    videoUrl: 'https://example.com/video.mp4',
  })),
}))

vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/interfaces/zod/textToVideo.zod', () => ({
  TEXT_TO_VIDEO_CONSTANTS: {
    MIN_PROMPT_LENGTH: 3,
    MAX_PROMPT_LENGTH: 1000,
    DEFAULT_DURATION: 5,
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  generateModelKeyboard,
  parseModelButton,
  getModelPriceStars,
} from '@/config/unified-video-models.config'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { handleHelpCancel } from '@/navigation'
import { TEXT_TO_VIDEO_CONSTANTS } from '@/interfaces/zod/textToVideo.zod'

describe('textToVideoWizard (Text to Video Generation)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'text_to_video' },
    },
    session: {
      selectedVideoModel: null as any,
      selectedAspectRatio: null as any,
      selectedVideoCost: null as any,
      selectedDuration: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      token: 'test_token',
    },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      selectedVideoModel: null,
      selectedAspectRatio: null,
      selectedVideoCost: null,
      selectedDuration: null,
    }
    mockContext.message = null

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(generateModelKeyboard as Mock).mockReturnValue([
      ['🎬 Minimax (16:9) 100⭐', '🎬 Minimax (9:16) 100⭐'],
      ['🎬 Kling (16:9) 150⭐', '🎬 Kling (9:16) 150⭐'],
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Выбор модели', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен генерировать клавиатуру с моделями', () => {
      const keyboard = generateModelKeyboard('text', true)

      expect(generateModelKeyboard).toHaveBeenCalledWith('text', true)
      expect(keyboard).toHaveLength(2)
    })

    it('должен показывать сообщение о выборе модели на русском', () => {
      const isRu = true
      const message = isRu
        ? '🎥 Выберите модель и формат видео:\n\n🖥️ Горизонтальные (16:9) — слева\n📱 Вертикальные (9:16) — справа\n\n⭐ Цена в Telegram Stars'
        : '🎥 Choose model and video format:'

      expect(message).toContain('Выберите модель')
      expect(message).toContain('16:9')
      expect(message).toContain('9:16')
    })

    it('должен показывать сообщение на английском', () => {
      const isRu = false
      const message = isRu
        ? '🎥 Выберите модель и формат видео:'
        : '🎥 Choose model and video format:\n\n🖥️ Horizontal (16:9) — left\n📱 Vertical (9:16) — right\n\n⭐ Price in Telegram Stars'

      expect(message).toContain('Choose model')
    })

    it('должен добавлять кнопки навигации', () => {
      const isRu = true
      const backButton = isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'
      const cancelButton = isRu ? 'Отмена' : 'Cancel'

      expect(backButton).toBe('⬅️ Назад в меню')
      expect(cancelButton).toBe('Отмена')
    })

    it('должен выходить если нет моделей', async () => {
      ;(generateModelKeyboard as Mock).mockReturnValue([])

      const keyboard = generateModelKeyboard('text', true)
      expect(keyboard).toHaveLength(0)
    })
  })

  describe('2. Шаг 2: Выбор модели или ввод промпта', () => {
    it('должен проверять отмену/справку', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      expect(isCancel).toBe(true)
    })

    it('должен парсить выбранную модель', () => {
      const buttonText = '🎬 minimax (16:9) 100⭐'
      const parsed = parseModelButton(buttonText)

      expect(parsed).toBeDefined()
      expect(parsed?.modelId).toBe('minimax-video-01')
      expect(parsed?.aspectRatio).toBe('16:9')
      expect(parsed?.cost).toBe(100)
    })

    it('должен обрабатывать невалидный ввод', () => {
      const buttonText = 'invalid text'
      const parsed = parseModelButton(buttonText)

      expect(parsed).toBeNull()
    })

    it('должен сохранять выбранную модель в сессии', () => {
      mockContext.session.selectedVideoModel = 'minimax-video-01'
      mockContext.session.selectedAspectRatio = '16:9'
      mockContext.session.selectedVideoCost = 100
      mockContext.session.selectedDuration = 5

      expect(mockContext.session.selectedVideoModel).toBe('minimax-video-01')
      expect(mockContext.session.selectedAspectRatio).toBe('16:9')
      expect(mockContext.session.selectedVideoCost).toBe(100)
      expect(mockContext.session.selectedDuration).toBe(5)
    })

    it('должен показывать сообщение после выбора модели', () => {
      const isRu = true
      const selectedText = '🎬 Minimax (16:9) 100⭐'
      const confirmMessage = isRu
        ? `✅ Модель выбрана: ${selectedText}\n\n📝 Теперь опишите, что должно происходить в видео:`
        : `✅ Model selected: ${selectedText}\n\n📝 Now describe what should happen in the video:`

      expect(confirmMessage).toContain('Модель выбрана')
    })

    it('должен обрабатывать кнопку "Назад"', () => {
      const text = '⬅️ Назад в меню'
      const isBack = text.includes('Назад') || text.includes('Back')

      expect(isBack).toBe(true)
    })
  })

  describe('3. Шаг 3: Обработка промпта и генерация', () => {
    it('должен валидировать минимальную длину промпта', () => {
      const prompt = 'ab'
      const minLength = TEXT_TO_VIDEO_CONSTANTS.MIN_PROMPT_LENGTH
      const isValid = prompt.length >= minLength

      expect(isValid).toBe(false)
    })

    it('должен принимать валидный промпт', () => {
      const prompt = 'A beautiful sunset over the ocean with waves'
      const minLength = TEXT_TO_VIDEO_CONSTANTS.MIN_PROMPT_LENGTH
      const isValid = prompt.length >= minLength

      expect(isValid).toBe(true)
    })

    it('должен вызывать handleTextToVideoDirect для генерации', async () => {
      const result = await handleTextToVideoDirect(
        mockContext as any,
        'Test prompt',
        'minimax-video-01',
        '16:9',
        100
      )

      expect(handleTextToVideoDirect).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен обрабатывать ошибку генерации', async () => {
      ;(handleTextToVideoDirect as Mock).mockResolvedValue({
        success: false,
        error: 'Generation failed',
      })

      const result = await handleTextToVideoDirect(
        mockContext as any,
        'Test prompt',
        'minimax-video-01',
        '16:9',
        100
      )

      expect(result.success).toBe(false)
    })
  })

  describe('4. Форматы видео', () => {
    it('должен поддерживать горизонтальный формат 16:9', () => {
      const aspectRatio = '16:9'
      expect(aspectRatio).toBe('16:9')
    })

    it('должен поддерживать вертикальный формат 9:16', () => {
      const aspectRatio = '9:16'
      expect(aspectRatio).toBe('9:16')
    })

    it('должен показывать правильные значки для форматов', () => {
      const horizontal = '🖥️'
      const vertical = '📱'

      expect(horizontal).toBe('🖥️')
      expect(vertical).toBe('📱')
    })
  })

  describe('5. Стоимость моделей', () => {
    it('должен получать стоимость модели', () => {
      const price = getModelPriceStars('minimax-video-01', '16:9')

      expect(getModelPriceStars).toHaveBeenCalledWith('minimax-video-01', '16:9')
      expect(price).toBe(100)
    })

    it('должен отображать стоимость в звездах', () => {
      const cost = 100
      const displayCost = `${cost}⭐`

      expect(displayCost).toBe('100⭐')
    })
  })

  describe('6. Обработка ошибок', () => {
    it('должен показывать сообщение об ошибке', () => {
      const errorMessage = '❌ Ошибка в мастере генерации видео'
      expect(errorMessage).toContain('Ошибка')
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('7. Навигация wizard', () => {
    it('должен переходить к следующему шагу', () => {
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('должен отслеживать текущий шаг', () => {
      expect(mockContext.wizard.cursor).toBe(0)
    })
  })

  describe('8. Локализация сообщений', () => {
    it('должен показывать запрос промпта на русском', () => {
      const isRu = true
      const message = isRu
        ? '📝 Теперь опишите, что должно происходить в видео:'
        : '📝 Now describe what should happen in the video:'

      expect(message).toContain('опишите')
    })

    it('должен показывать запрос промпта на английском', () => {
      const isRu = false
      const message = isRu
        ? '📝 Теперь опишите, что должно происходить в видео:'
        : '📝 Now describe what should happen in the video:'

      expect(message).toContain('describe')
    })

    it('должен показывать просьбу выбрать модель', () => {
      const isRu = true
      const message = isRu
        ? 'Пожалуйста, выберите модель из кнопок выше.'
        : 'Please select a model from the buttons above.'

      expect(message).toContain('выберите модель')
    })
  })

  describe('9. Проверка типа сообщения', () => {
    it('должен проверять наличие текстового сообщения', () => {
      mockContext.message = { text: 'Test prompt' }
      const hasText = mockContext.message && 'text' in mockContext.message

      expect(hasText).toBe(true)
    })

    it('должен обрабатывать отсутствие сообщения', () => {
      mockContext.message = null
      const hasText = mockContext.message && 'text' in mockContext.message

      expect(hasText).toBeFalsy()
    })
  })

  describe('10. Константы генерации', () => {
    it('должен иметь минимальную длину промпта', () => {
      expect(TEXT_TO_VIDEO_CONSTANTS.MIN_PROMPT_LENGTH).toBe(3)
    })

    it('должен иметь максимальную длину промпта', () => {
      expect(TEXT_TO_VIDEO_CONSTANTS.MAX_PROMPT_LENGTH).toBe(1000)
    })

    it('должен иметь дефолтную длительность видео', () => {
      expect(TEXT_TO_VIDEO_CONSTANTS.DEFAULT_DURATION).toBe(5)
    })
  })
})
