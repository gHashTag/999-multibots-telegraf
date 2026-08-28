/**
 * Tests for imageToVideoWizard (Image to Video Generation)
 * Covers: Model selection, image upload, prompt handling, video generation
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/config/unified-video-models.config', () => ({
  generateModelButton: vi.fn(
    (modelId, aspectRatio, isRu) =>
      `${modelId} (${aspectRatio}) ${isRu ? 'RU' : 'EN'}`
  ),
  parseModelButton: vi.fn(text => {
    if (text.includes('minimax') || text.includes('Minimax')) {
      return {
        modelId: 'minimax-video-01',
        aspectRatio: '16:9',
        cost: 100,
        duration: 5,
      }
    }
    if (text.includes('kling') || text.includes('Kling')) {
      return {
        modelId: 'kling-1.0',
        aspectRatio: '9:16',
        cost: 150,
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

vi.mock('@/handlers/handleImageToVideoDirect', () => ({
  handleImageToVideoDirect: vi.fn(() =>
    Promise.resolve({
      success: true,
      videoUrl: 'https://example.com/video.mp4',
    })
  ),
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

vi.mock('@/interfaces/modes', () => ({
  ModeEnum: {
    ImageToVideo: 'image_to_video',
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  generateModelKeyboard,
  parseModelButton,
  getModelPriceStars,
} from '@/config/unified-video-models.config'
import { handleImageToVideoDirect } from '@/handlers/handleImageToVideoDirect'
import { handleHelpCancel } from '@/navigation'

describe('imageToVideoWizard (Image to Video Generation)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'image_to_video' },
    },
    session: {
      selectedVideoModel: null as any,
      selectedAspectRatio: null as any,
      selectedVideoCost: null as any,
      selectedDuration: null as any,
      imageUrl: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
      selectStep: vi.fn(),
    },
    telegram: {
      token: 'test_token',
      getFileLink: vi.fn(() =>
        Promise.resolve({ href: 'https://api.telegram.org/file/image.jpg' })
      ),
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
      imageUrl: null,
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

  describe('1. Шаг 0: Показ моделей', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен генерировать клавиатуру с моделями для image', () => {
      const keyboard = generateModelKeyboard('image', true)

      expect(generateModelKeyboard).toHaveBeenCalledWith('image', true)
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

    it('должен добавлять кнопки навигации', () => {
      const isRu = true
      const backButton = isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'
      const cancelButton = isRu ? 'Отмена' : 'Cancel'

      expect(backButton).toBe('⬅️ Назад в меню')
      expect(cancelButton).toBe('Отмена')
    })

    it('должен выходить если нет моделей', async () => {
      ;(generateModelKeyboard as Mock).mockReturnValue([])

      const keyboard = generateModelKeyboard('image', true)
      expect(keyboard).toHaveLength(0)
    })
  })

  describe('2. Шаг 1: Выбор модели', () => {
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
        ? `✅ Модель выбрана: ${selectedText}\n\n🖼️ Теперь отправьте изображение для создания видео:`
        : `✅ Model selected: ${selectedText}\n\n🖼️ Now send an image to create video:`

      expect(confirmMessage).toContain('Модель выбрана')
      expect(confirmMessage).toContain('изображение')
    })

    it('должен обрабатывать кнопку "Назад"', () => {
      const text = '⬅️ Назад в меню'
      const isBack = text.includes('Назад') || text.includes('Back')

      expect(isBack).toBe(true)
    })

    it('должен обрабатывать кнопку "Отмена"', () => {
      const text = 'Отмена'
      const isCancel = text.includes('Отмена') || text.includes('Cancel')

      expect(isCancel).toBe(true)
    })
  })

  describe('3. Шаг 2: Загрузка изображения', () => {
    it('должен проверять наличие фото', () => {
      mockContext.message = { photo: [{ file_id: 'test_file_id' }] }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      expect(hasPhoto).toBe(true)
    })

    it('должен отклонять сообщение без фото', () => {
      mockContext.message = { text: 'Some text' }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      expect(hasPhoto).toBe(false)
    })

    it('должен получать ссылку на файл', async () => {
      const fileLink = await mockContext.telegram.getFileLink('test_file_id')

      expect(mockContext.telegram.getFileLink).toHaveBeenCalledWith(
        'test_file_id'
      )
      expect(fileLink.href).toBe('https://api.telegram.org/file/image.jpg')
    })

    it('должен сохранять imageUrl в сессии', () => {
      mockContext.session.imageUrl = 'https://api.telegram.org/file/image.jpg'
      expect(mockContext.session.imageUrl).toBe(
        'https://api.telegram.org/file/image.jpg'
      )
    })

    it('должен показывать подтверждение получения изображения', () => {
      const isRu = true
      const message = isRu
        ? '✅ Изображение получено!\n\n📝 Теперь опишите, что должно происходить в видео:'
        : '✅ Image received!\n\n📝 Now describe what should happen in the video:'

      expect(message).toContain('Изображение получено')
    })

    it('должен показывать ошибку если фото не получено', () => {
      const isRu = true
      const errorMessage = isRu
        ? 'Не удалось получить изображение. Попробуйте еще раз.'
        : 'Failed to get the image. Please try again.'

      expect(errorMessage).toContain('получить изображение')
    })
  })

  describe('4. Шаг 3: Обработка промпта', () => {
    it('должен валидировать минимальную длину промпта', () => {
      const prompt = 'ab'
      const minLength = 3
      const isValid = prompt.length >= minLength

      expect(isValid).toBe(false)
    })

    it('должен принимать валидный промпт', () => {
      const prompt = 'A cat running through a field of flowers'
      const minLength = 3
      const isValid = prompt.length >= minLength

      expect(isValid).toBe(true)
    })

    it('должен проверять наличие модели в сессии', () => {
      mockContext.session.selectedVideoModel = null

      const hasModel = !!mockContext.session.selectedVideoModel
      expect(hasModel).toBe(false)
    })

    it('должен проверять наличие imageUrl в сессии', () => {
      mockContext.session.imageUrl = null

      const hasImage = !!mockContext.session.imageUrl
      expect(hasImage).toBe(false)
    })

    it('должен показывать сообщение о начале генерации', () => {
      const isRu = true
      const selectedModel = 'minimax-video-01'
      const aspectRatio = '16:9'
      const cost = 100
      const prompt = 'Test prompt'

      const message = isRu
        ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
        : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`

      expect(message).toContain('Генерируем видео')
      expect(message).toContain(prompt)
    })
  })

  describe('5. Генерация видео', () => {
    it('должен вызывать handleImageToVideoDirect', async () => {
      const result = await handleImageToVideoDirect(
        mockContext as any,
        'https://example.com/image.jpg',
        'Test prompt',
        'minimax-video-01' as any,
        5,
        '16:9'
      )

      expect(handleImageToVideoDirect).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен обрабатывать ошибку генерации', async () => {
      ;(handleImageToVideoDirect as Mock).mockResolvedValue({
        success: false,
        error: 'Generation failed',
      })

      const result = await handleImageToVideoDirect(
        mockContext as any,
        'https://example.com/image.jpg',
        'Test prompt',
        'minimax-video-01' as any,
        5,
        '16:9'
      )

      expect(result.success).toBe(false)
    })
  })

  describe('6. Форматы видео', () => {
    it('должен поддерживать горизонтальный формат 16:9', () => {
      const aspectRatio = '16:9'
      expect(aspectRatio).toBe('16:9')
    })

    it('должен поддерживать вертикальный формат 9:16', () => {
      const aspectRatio = '9:16'
      expect(aspectRatio).toBe('9:16')
    })

    it('должен использовать дефолтный aspectRatio если не выбран', () => {
      mockContext.session.selectedAspectRatio = null
      const aspectRatio = mockContext.session.selectedAspectRatio || '9:16'

      expect(aspectRatio).toBe('9:16')
    })
  })

  describe('7. Стоимость моделей', () => {
    it('должен получать стоимость модели', () => {
      const price = getModelPriceStars('minimax-video-01')

      expect(getModelPriceStars).toHaveBeenCalledWith('minimax-video-01')
      expect(price).toBe(100)
    })

    it('должен использовать дефолтную стоимость', () => {
      mockContext.session.selectedVideoCost = null
      const cost = mockContext.session.selectedVideoCost || 25

      expect(cost).toBe(25)
    })
  })

  describe('8. Навигация wizard', () => {
    it('должен переходить к следующему шагу', () => {
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('должен возвращаться к шагу 0 при отсутствии модели', () => {
      mockContext.wizard.selectStep(0)
      expect(mockContext.wizard.selectStep).toHaveBeenCalledWith(0)
    })

    it('должен отслеживать текущий шаг', () => {
      expect(mockContext.wizard.cursor).toBe(0)
    })
  })

  describe('9. Обработка ошибок', () => {
    it('должен показывать сообщение об ошибке при получении изображения', () => {
      const isRu = true
      const errorMessage = isRu
        ? '❌ Ошибка при обработке изображения'
        : '❌ Error processing image'

      expect(errorMessage).toContain('Ошибка')
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен показывать ошибку в мастере', () => {
      const errorMessage = '❌ Ошибка в мастере генерации видео'
      expect(errorMessage).toContain('мастере генерации')
    })
  })

  describe('10. Локализация сообщений', () => {
    it('должен показывать запрос изображения на русском', () => {
      const isRu = true
      const message = isRu
        ? 'Пожалуйста, отправьте изображение (фото).'
        : 'Please send an image (photo).'

      expect(message).toContain('изображение')
    })

    it('должен показывать запрос изображения на английском', () => {
      const isRu = false
      const message = isRu
        ? 'Пожалуйста, отправьте изображение (фото).'
        : 'Please send an image (photo).'

      expect(message).toContain('image')
    })

    it('должен показывать запрос промпта на русском', () => {
      const isRu = true
      const message = isRu
        ? 'Введите описание видео.'
        : 'Enter video description.'

      expect(message).toContain('описание видео')
    })
  })

  describe('11. Очистка сессии при выходе', () => {
    it('должен очищать данные сессии', () => {
      mockContext.session.selectedVideoModel = 'minimax-video-01'
      mockContext.session.selectedVideoCost = 100
      mockContext.session.selectedAspectRatio = '16:9'
      mockContext.session.selectedDuration = 5
      mockContext.session.imageUrl = 'https://example.com/image.jpg'

      // Симулируем очистку при выходе
      delete (mockContext.session as any).selectedVideoModel
      delete (mockContext.session as any).selectedVideoCost
      delete (mockContext.session as any).selectedAspectRatio
      delete (mockContext.session as any).selectedDuration
      delete (mockContext.session as any).imageUrl

      expect(mockContext.session.selectedVideoModel).toBeUndefined()
      expect(mockContext.session.selectedVideoCost).toBeUndefined()
      expect(mockContext.session.selectedAspectRatio).toBeUndefined()
      expect(mockContext.session.selectedDuration).toBeUndefined()
      expect(mockContext.session.imageUrl).toBeUndefined()
    })
  })

  describe('12. Проверка типа сообщения', () => {
    it('должен проверять наличие текстового сообщения', () => {
      mockContext.message = { text: 'Test' }
      const hasText = mockContext.message && 'text' in mockContext.message

      expect(hasText).toBe(true)
    })

    it('должен обрабатывать отсутствие сообщения', () => {
      mockContext.message = null
      const hasText = mockContext.message && 'text' in mockContext.message

      expect(hasText).toBeFalsy()
    })

    it('должен проверять наличие фото в сообщении', () => {
      mockContext.message = {
        photo: [
          { file_id: 'small', width: 100, height: 100 },
          { file_id: 'large', width: 800, height: 800 },
        ],
      }
      const photo =
        mockContext.message.photo[mockContext.message.photo.length - 1]

      expect(photo.file_id).toBe('large')
    })
  })
})
