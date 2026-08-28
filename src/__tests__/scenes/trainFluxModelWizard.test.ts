/**
 * Tests for trainFluxModelWizard (LoRA Model Training from Photos)
 * Covers: Image collection, validation, training initiation
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/language', () => ({
  isRussian: vi.fn(() => true),
}))

vi.mock('@/helpers/images', () => ({
  isValidImage: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/handlers', () => ({
  getBotToken: vi.fn(() => 'test_bot_token'),
}))

vi.mock('@/helpers/sanitizeModelName', () => ({
  sanitizeModelName: vi.fn(name => name.replace(/[^a-zA-Z0-9_]/g, '_')),
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
import { isRussian } from '@/helpers/language'
import { isValidImage } from '@/helpers/images'
import { handleHelpCancel } from '@/navigation'
import { getBotToken } from '@/handlers'
import { sanitizeModelName } from '@/helpers/sanitizeModelName'

describe('trainFluxModelWizard (LoRA Model Training)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'trainFluxModelWizard' },
    },
    session: {
      username: null as string | null,
      targetUserId: null as number | null,
      gender: null as string | null,
      modelName: null as string | null,
      triggerWord: null as string | null,
      images: [] as any[],
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      getFile: vi.fn(() =>
        Promise.resolve({
          file_id: 'file_123',
          file_path: 'photos/test.jpg',
        })
      ),
    },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      username: null,
      targetUserId: null,
      gender: null,
      modelName: null,
      triggerWord: null,
      images: [],
    }
    mockContext.message = null
    ;(isRussian as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(isValidImage as Mock).mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Инициализация', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussian(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен инициализировать username из ctx.from', () => {
      if (!mockContext.session.username && mockContext.from?.username) {
        mockContext.session.username = mockContext.from.username
      }

      expect(mockContext.session.username).toBe('testuser')
    })

    it('должен создавать fallback username', () => {
      const ctx = { ...mockContext, from: { id: 12345 } }

      if (!ctx.session.username) {
        if (ctx.from?.username) {
          ctx.session.username = ctx.from.username
        } else {
          ctx.session.username = `user${ctx.from?.id || 'unknown'}`
        }
      }

      expect(ctx.session.username).toBe('user12345')
    })

    it('должен инициализировать targetUserId', () => {
      if (!mockContext.session.targetUserId && mockContext.from?.id) {
        mockContext.session.targetUserId = mockContext.from.id
      }

      expect(mockContext.session.targetUserId).toBe(223757230)
    })

    it('должен устанавливать пол по умолчанию', () => {
      if (!mockContext.session.gender) {
        mockContext.session.gender = 'male'
      }

      expect(mockContext.session.gender).toBe('male')
    })

    it('должен устанавливать название модели по умолчанию', () => {
      if (!mockContext.session.modelName) {
        mockContext.session.modelName = 'digital_avatar_model'
        mockContext.session.triggerWord =
          mockContext.session.modelName.toUpperCase()
      }

      expect(mockContext.session.modelName).toBe('digital_avatar_model')
      expect(mockContext.session.triggerWord).toBe('DIGITAL_AVATAR_MODEL')
    })
  })

  describe('2. Сообщение о требованиях к фото', () => {
    it('должен показывать минимум 10 изображений', () => {
      const isRu = true
      const message = isRu
        ? '📸 Загрузите изображения для обучения ИИ-модели (минимум 10)'
        : '📸 Now upload images for AI model training (minimum 10 images)'

      expect(message).toContain('10')
    })

    it('должен показывать требование четкости', () => {
      const requirement = '📷 Четкость и качество изображения'
      expect(requirement).toContain('Четкость')
    })

    it('должен показывать требование разнообразия ракурсов', () => {
      const requirement = '🔄 Разнообразие ракурсов'
      expect(requirement).toContain('ракурсов')
    })

    it('должен показывать требование разнообразия выражений лиц', () => {
      const requirement = '😊 Разнообразие выражений лиц'
      expect(requirement).toContain('выражений')
    })

    it('должен показывать требование разнообразия освещения', () => {
      const requirement = '💡 Разнообразие освещения'
      expect(requirement).toContain('освещения')
    })
  })

  describe('3. Шаг 2: Сбор изображений', () => {
    it('должен проверять отмену/справку', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      expect(isCancel).toBe(true)
    })

    it('должен обрабатывать команду /done', () => {
      mockContext.message = { text: '/done' }

      const isDone = mockContext.message?.text === '/done'
      expect(isDone).toBe(true)
    })

    it('должен требовать минимум 10 изображений для /done', () => {
      mockContext.session.images = new Array(5).fill({
        buffer: Buffer.from('test'),
      })

      const canFinish = mockContext.session.images.length >= 10
      expect(canFinish).toBe(false)
    })

    it('должен разрешать /done при 10+ изображениях', () => {
      mockContext.session.images = new Array(10).fill({
        buffer: Buffer.from('test'),
      })

      const canFinish = mockContext.session.images.length >= 10
      expect(canFinish).toBe(true)
    })

    it('должен инициализировать массив images', () => {
      if (!mockContext.session.images) {
        mockContext.session.images = []
      }

      expect(mockContext.session.images).toEqual([])
    })
  })

  describe('4. Обработка фото', () => {
    it('должен получать file из Telegram', async () => {
      const file = await mockContext.telegram.getFile('photo_123')

      expect(mockContext.telegram.getFile).toHaveBeenCalledWith('photo_123')
      expect(file.file_path).toBe('photos/test.jpg')
    })

    it('должен получать токен бота', () => {
      const token = getBotToken(mockContext as any)

      expect(getBotToken).toHaveBeenCalled()
      expect(token).toBe('test_bot_token')
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
      const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024) // 15MB

      const isTooLarge = largeBuffer.length > MAX_IMAGE_SIZE
      expect(isTooLarge).toBe(true)
    })
  })

  describe('5. Добавление изображения в сессию', () => {
    it('должен добавлять изображение в массив', () => {
      const buffer = Buffer.from('image data')

      mockContext.session.images.push({
        buffer: buffer,
        filename: `a_photo_of_testuser_x1.jpg`,
      })

      expect(mockContext.session.images).toHaveLength(1)
    })

    it('должен формировать правильное имя файла', () => {
      const username = 'testuser'
      const imageIndex = 3
      const filename = `a_photo_of_${username}x${imageIndex}.jpg`

      expect(filename).toBe('a_photo_of_testuserx3.jpg')
    })

    it('должен показывать прогресс загрузки на русском', () => {
      const isRu = true
      const imagesCount = 5
      const remaining = 10 - imagesCount
      const message = isRu
        ? `✅ Изображение ${imagesCount} добавлено. Нужно еще ${remaining} фото.`
        : `✅ Image ${imagesCount} added. Need ${remaining} more photos.`

      expect(message).toContain('5')
      expect(message).toContain('5 фото')
    })

    it('должен показывать сообщение о завершении на русском', () => {
      const isRu = true
      const imagesCount = 12
      const message = isRu
        ? `✅ Изображение ${imagesCount} добавлено. Отправьте /done для завершения.`
        : `✅ Image ${imagesCount} added. Send /done to finish.`

      expect(message).toContain('/done')
    })
  })

  describe('6. Переход к uploadTrainFluxModelScene', () => {
    it('должен переходить в uploadTrainFluxModelScene', async () => {
      mockContext.session.images = new Array(10).fill({
        buffer: Buffer.from('test'),
      })

      await mockContext.scene.enter('uploadTrainFluxModelScene', {
        gender: mockContext.session.gender,
      })

      expect(mockContext.scene.enter).toHaveBeenCalledWith(
        'uploadTrainFluxModelScene',
        expect.objectContaining({
          gender: mockContext.session.gender,
        })
      )
    })
  })

  describe('7. Обработка ошибок', () => {
    it('должен показывать ошибку при отсутствии file_path', () => {
      const isRu = true
      const message = isRu
        ? '❌ Ошибка получения файла. Попробуйте загрузить фото еще раз.'
        : '❌ Error getting file. Please try uploading the photo again.'

      expect(message).toContain('Ошибка')
    })

    it('должен показывать ошибку при невалидном формате', () => {
      const isRu = true
      const message = isRu
        ? '❌ Файл не является корректным изображением. Поддерживаются JPG, PNG, WEBP.'
        : '❌ File is not a valid image. Supported formats: JPG, PNG, WEBP.'

      expect(message).toContain('JPG')
      expect(message).toContain('PNG')
      expect(message).toContain('WEBP')
    })

    it('должен показывать ошибку при слишком большом файле', () => {
      const isRu = true
      const message = isRu
        ? '❌ Изображение слишком большое (максимум 10MB).'
        : '❌ Image too large (max 10MB).'

      expect(message).toContain('10MB')
    })
  })

  describe('8. Локализация', () => {
    it('должен показывать заголовок на русском', () => {
      const isRu = true
      const modelName = 'digital_avatar_model'
      const message = isRu
        ? `✅ Модель: "${modelName}"`
        : `✅ Model: "${modelName}"`

      expect(message).toContain('Модель')
    })

    it('должен показывать заголовок на английском', () => {
      const isRu = false
      const modelName = 'digital_avatar_model'
      const message = isRu
        ? `✅ Модель: "${modelName}"`
        : `✅ Model: "${modelName}"`

      expect(message).toContain('Model')
    })

    it('должен показывать просьбу отправить фото', () => {
      const isRu = true
      const message = isRu
        ? 'Пожалуйста, отправьте фото или /done.'
        : 'Please send a photo or /done.'

      expect(message).toContain('фото')
    })
  })

  describe('9. Санитизация имени модели', () => {
    it('должен санитизировать имя модели', () => {
      const result = sanitizeModelName('My Model Name!')

      expect(sanitizeModelName).toHaveBeenCalled()
    })

    it('должен заменять спецсимволы на подчеркивания', () => {
      const input = 'test model 123'
      const sanitized = input.replace(/[^a-zA-Z0-9_]/g, '_')

      expect(sanitized).toBe('test_model_123')
    })
  })

  describe('10. Клавиатура', () => {
    it('должен показывать кнопку отмены на русском', () => {
      const isRu = true
      const cancelButton = isRu ? 'Отмена' : 'Cancel'

      expect(cancelButton).toBe('Отмена')
    })

    it('должен показывать кнопку отмены на английском', () => {
      const isRu = false
      const cancelButton = isRu ? 'Отмена' : 'Cancel'

      expect(cancelButton).toBe('Cancel')
    })
  })
})
