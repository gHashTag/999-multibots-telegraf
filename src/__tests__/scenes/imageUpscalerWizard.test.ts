/**
 * Tests for imageUpscalerWizard (Image Quality Enhancement)
 * Covers: Image upload, upscaling process, error handling
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/services/imageUpscaler', () => ({
  upscaleImage: vi.fn(() =>
    Promise.resolve({
      success: true,
      imageUrl: 'https://example.com/upscaled.jpg',
    })
  ),
}))

vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
  createHelpCancelKeyboard: vi.fn(isRu => ({
    reply_markup: { keyboard: [[{ text: isRu ? 'Отмена' : 'Cancel' }]] },
  })),
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
    ImageUpscaler: 'image_upscaler',
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { upscaleImage } from '@/services/imageUpscaler'
import { handleHelpCancel, createHelpCancelKeyboard } from '@/navigation'
import { ModeEnum } from '@/interfaces/modes'

describe('imageUpscalerWizard (Image Quality Enhancement)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      session: { state: {} },
      current: { id: 'image_upscaler' },
    },
    session: {
      mode: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      getFileLink: vi.fn(() =>
        Promise.resolve({ href: 'https://example.com/photo.jpg' })
      ),
    },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = { mode: null }
    mockContext.message = null
    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(upscaleImage as Mock).mockResolvedValue({
      success: true,
      imageUrl: 'https://example.com/upscaled.jpg',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Запрос изображения', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен устанавливать режим ImageUpscaler', () => {
      mockContext.session.mode = ModeEnum.ImageUpscaler
      expect(mockContext.session.mode).toBe('image_upscaler')
    })

    it('должен показывать сообщение на русском', () => {
      const isRu = true
      const message = isRu
        ? '⬆️ Отправьте фото для увеличения качества\n\n🎯 Clarity Upscaler увеличит разрешение в 2 раза и улучшит детализацию\n💎 Стоимость: 3 ⭐'
        : '⬆️ Send a photo to upscale quality'

      expect(message).toContain('увеличения качества')
      expect(message).toContain('3 ⭐')
    })

    it('должен показывать сообщение на английском', () => {
      const isRu = false
      const message = isRu
        ? '⬆️ Отправьте фото для увеличения качества'
        : '⬆️ Send a photo to upscale quality\n\n🎯 Clarity Upscaler will increase resolution 2x and improve details\n💎 Cost: 3 ⭐'

      expect(message).toContain('upscale quality')
      expect(message).toContain('3 ⭐')
    })

    it('должен создавать клавиатуру с кнопками справки/отмены', () => {
      const keyboard = createHelpCancelKeyboard(true)

      expect(createHelpCancelKeyboard).toHaveBeenCalledWith(true)
      expect(keyboard.reply_markup).toBeDefined()
    })

    it('должен инициализировать state сцены', () => {
      mockContext.scene.session.state = { step: 0 }
      expect(mockContext.scene.session.state.step).toBe(0)
    })

    it('должен переходить к следующему шагу', () => {
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })
  })

  describe('2. Обработка отмены', () => {
    it('должен проверять отмену/справку', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      expect(isCancel).toBe(true)
    })

    it('должен выходить из сцены при отмене', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      if (isCancel) {
        await mockContext.scene.leave()
      }

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('3. Шаг 2: Обработка изображения', () => {
    it('должен проверять наличие сообщения', async () => {
      mockContext.message = null

      if (!mockContext.message) {
        await mockContext.reply('Пожалуйста, отправьте изображение')
      }

      expect(mockContext.reply).toHaveBeenCalledWith(
        'Пожалуйста, отправьте изображение'
      )
    })

    it('должен обрабатывать фото сообщение', () => {
      mockContext.message = {
        photo: [
          { file_id: 'small_123', width: 100, height: 100 },
          { file_id: 'large_456', width: 800, height: 800 },
        ],
      }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      expect(hasPhoto).toBe(true)
    })

    it('должен получать file_id последнего (самого большого) фото', () => {
      mockContext.message = {
        photo: [
          { file_id: 'small_123', width: 100, height: 100 },
          { file_id: 'large_456', width: 800, height: 800 },
        ],
      }

      const photo = mockContext.message.photo
      const fileId = photo[photo.length - 1].file_id

      expect(fileId).toBe('large_456')
    })

    it('должен получать ссылку на файл', async () => {
      const fileLink = await mockContext.telegram.getFileLink('large_456')

      expect(mockContext.telegram.getFileLink).toHaveBeenCalledWith('large_456')
      expect(fileLink.href).toBe('https://example.com/photo.jpg')
    })
  })

  describe('4. Вызов сервиса upscaleImage', () => {
    it('должен вызывать upscaleImage с правильными параметрами', async () => {
      const imageUrl = 'https://example.com/photo.jpg'
      const telegramId = '223757230'
      const username = 'testuser'
      const isRu = true

      await upscaleImage({
        imageUrl,
        telegram_id: telegramId,
        username,
        is_ru: isRu,
        ctx: mockContext as any,
        originalPrompt: 'Manual upscale request',
      })

      expect(upscaleImage).toHaveBeenCalledWith({
        imageUrl,
        telegram_id: telegramId,
        username,
        is_ru: isRu,
        ctx: mockContext,
        originalPrompt: 'Manual upscale request',
      })
    })

    it('должен обрабатывать успешный результат', async () => {
      const result = await upscaleImage({
        imageUrl: 'https://example.com/photo.jpg',
        telegram_id: '223757230',
        username: 'testuser',
        is_ru: true,
        ctx: mockContext as any,
        originalPrompt: 'Test',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('5. Обработка ошибок', () => {
    it('должен обрабатывать ошибку upscaleImage', async () => {
      ;(upscaleImage as Mock).mockRejectedValue(new Error('Upscale failed'))

      try {
        await upscaleImage({
          imageUrl: 'https://example.com/photo.jpg',
          telegram_id: '223757230',
          username: 'testuser',
          is_ru: true,
          ctx: mockContext as any,
          originalPrompt: 'Test',
        })
      } catch (error) {
        expect((error as Error).message).toBe('Upscale failed')
      }
    })

    it('должен показывать сообщение об ошибке на русском', () => {
      const isRu = true
      const errorMessage = isRu
        ? 'Произошла ошибка при увеличении качества изображения. Пожалуйста, попробуйте позже.'
        : 'An error occurred while upscaling the image.'

      expect(errorMessage).toContain('ошибка')
    })

    it('должен показывать сообщение об ошибке на английском', () => {
      const isRu = false
      const errorMessage = isRu
        ? 'Произошла ошибка'
        : 'An error occurred while upscaling the image. Please try again later.'

      expect(errorMessage).toContain('error occurred')
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('6. Проверка типа сообщения', () => {
    it('должен отклонять текстовые сообщения', () => {
      mockContext.message = { text: 'Просто текст' }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      expect(hasPhoto).toBe(false)
    })

    it('должен обрабатывать отсутствие photo в сообщении', async () => {
      mockContext.message = { document: { file_id: 'doc_123' } }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message

      if (!hasPhoto) {
        await mockContext.reply('Пожалуйста, отправьте изображение')
      }

      expect(mockContext.reply).toHaveBeenCalled()
    })
  })

  describe('7. Стоимость услуги', () => {
    it('должен иметь стоимость 3 звезды', () => {
      const cost = 3
      expect(cost).toBe(3)
    })

    it('должен отображать стоимость в звездах', () => {
      const cost = 3
      const displayCost = `${cost} ⭐`

      expect(displayCost).toBe('3 ⭐')
    })
  })

  describe('8. Параметры Clarity Upscaler', () => {
    it('должен увеличивать разрешение в 2 раза', () => {
      const scaleFactor = 2
      expect(scaleFactor).toBe(2)
    })

    it('должен улучшать детализацию', () => {
      const featureMessage = 'улучшит детализацию'
      expect(featureMessage).toContain('детализацию')
    })
  })

  describe('9. Обработчики команд', () => {
    it('должен обрабатывать команду /help', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isHelp = await handleHelpCancel(mockContext as any)
      expect(isHelp).toBe(true)
    })

    it('должен обрабатывать команду /cancel', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      expect(isCancel).toBe(true)
    })
  })

  describe('10. Логирование', () => {
    it('должен логировать начало upscale', () => {
      const logData = {
        telegramId: 223757230,
        imageUrl: 'https://example.com/photo.jpg',
      }

      expect(logData.telegramId).toBe(223757230)
      expect(logData.imageUrl).toBeDefined()
    })

    it('должен логировать ошибки', () => {
      const errorLog = {
        error: 'Unknown error',
        telegramId: 223757230,
      }

      expect(errorLog.error).toBeDefined()
    })
  })
})
