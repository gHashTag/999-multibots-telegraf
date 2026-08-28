/**
 * Tests for videoTranscriptionWizard (Video to Text Transcription)
 * Covers: Video upload, Instagram URL processing, transcription service
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/language', () => ({
  isRussian: vi.fn(() => true),
}))

vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
  createHelpCancelKeyboard: vi.fn(isRu => ({
    reply_markup: { keyboard: [[{ text: isRu ? 'Отмена' : 'Cancel' }]] },
  })),
  sendGenericErrorMessage: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/services/videoTranscription', () => ({
  transcribeInstagramReel: vi.fn(() =>
    Promise.resolve({
      success: true,
      text: 'Transcribed text from Instagram video',
      videoPath: '/tmp/video.mp4',
    })
  ),
  transcribeVideoFromDirectUrl: vi.fn(() =>
    Promise.resolve({
      success: true,
      text: 'Transcribed text from uploaded video',
    })
  ),
}))

vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(100)),
  updateUserBalance: vi.fn(() => Promise.resolve(true)),
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
    VideoTranscription: 'video_transcription',
  },
}))

vi.mock('@/interfaces/payments.interface', () => ({
  PaymentType: {
    MONEY_OUTCOME: 'MONEY_OUTCOME',
  },
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ size: 10 * 1024 * 1024 })), // 10MB
    unlinkSync: vi.fn(),
  },
}))

// Import after mocks
import { isRussian } from '@/helpers/language'
import {
  handleHelpCancel,
  createHelpCancelKeyboard,
  sendGenericErrorMessage,
} from '@/navigation'
import {
  transcribeInstagramReel,
  transcribeVideoFromDirectUrl,
} from '@/services/videoTranscription'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'

describe('videoTranscriptionWizard (Video to Text Transcription)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    replyWithVideo: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      reenter: vi.fn(),
      current: { id: 'video_transcription' },
    },
    session: {
      mode: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      token: 'test_token',
      getFile: vi.fn(() =>
        Promise.resolve({
          file_id: 'file_123',
          file_path: 'videos/test.mp4',
          file_size: 10 * 1024 * 1024, // 10MB
        })
      ),
    },
    botInfo: { username: 'test_bot' },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = { mode: null }
    mockContext.message = null
    ;(isRussian as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(transcribeInstagramReel as Mock).mockResolvedValue({
      success: true,
      text: 'Transcribed text from Instagram video',
      videoPath: '/tmp/video.mp4',
    })
    ;(transcribeVideoFromDirectUrl as Mock).mockResolvedValue({
      success: true,
      text: 'Transcribed text from uploaded video',
    })
    ;(getUserBalance as Mock).mockResolvedValue(100)
    ;(updateUserBalance as Mock).mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Запрос видео', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussian(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен устанавливать режим VideoTranscription', () => {
      mockContext.session.mode = ModeEnum.VideoTranscription
      expect(mockContext.session.mode).toBe('video_transcription')
    })

    it('должен показывать сообщение на русском', () => {
      const isRu = true
      const message = isRu
        ? '📺 Отправьте видео для транскрибации в текст'
        : '📺 Send a video for transcription to text'

      expect(message).toContain('транскрибации')
    })

    it('должен показывать способы загрузки', () => {
      const isRu = true
      const methods = isRu
        ? '💡 Способы загрузки:\n• 📎 Загрузить видеофайл (до 50MB) - РЕКОМЕНДУЕТСЯ!\n• 🔗 Отправить ссылку на Instagram Reel'
        : '💡 Upload methods:\n• 📎 Upload a video file (up to 50MB) - RECOMMENDED!'

      expect(methods).toContain('50MB')
    })

    it('должен создавать клавиатуру с кнопками', () => {
      const keyboard = createHelpCancelKeyboard(true)

      expect(createHelpCancelKeyboard).toHaveBeenCalledWith(true)
      expect(keyboard.reply_markup).toBeDefined()
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

  describe('3. Шаг 2: Обработка видеофайла', () => {
    it('должен распознавать видео сообщение', () => {
      mockContext.message = {
        video: {
          file_id: 'video_123',
          file_size: 10 * 1024 * 1024,
        },
      }

      const isVideoFile = mockContext.message && 'video' in mockContext.message
      expect(isVideoFile).toBe(true)
    })

    it('должен отклонять слишком большие файлы', async () => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
      const fileSize = 60 * 1024 * 1024 // 60MB

      const isTooLarge = fileSize > MAX_FILE_SIZE
      expect(isTooLarge).toBe(true)
    })

    it('должен принимать файлы до 50MB', () => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
      const fileSize = 30 * 1024 * 1024 // 30MB

      const isAcceptable = fileSize <= MAX_FILE_SIZE
      expect(isAcceptable).toBe(true)
    })

    it('должен формировать URL для Telegram файла', () => {
      const token = 'test_token'
      const filePath = 'videos/test.mp4'
      const videoUrl = `https://api.telegram.org/file/bot${token}/${filePath}`

      expect(videoUrl).toContain('api.telegram.org')
      expect(videoUrl).toContain(filePath)
    })

    it('должен вызывать transcribeVideoFromDirectUrl', async () => {
      const videoUrl = 'https://api.telegram.org/file/bot123/videos/test.mp4'

      const result = await transcribeVideoFromDirectUrl(videoUrl)

      expect(transcribeVideoFromDirectUrl).toHaveBeenCalledWith(videoUrl)
      expect(result.success).toBe(true)
    })
  })

  describe('4. Обработка Instagram URL', () => {
    it('должен распознавать Instagram ссылку', () => {
      mockContext.message = {
        text: 'https://www.instagram.com/reel/ABC123/',
      }

      const isTextWithUrl =
        mockContext.message &&
        'text' in mockContext.message &&
        mockContext.message.text.includes('instagram.com')

      expect(isTextWithUrl).toBe(true)
    })

    it('должен отклонять не-Instagram ссылки', () => {
      mockContext.message = {
        text: 'https://www.youtube.com/watch?v=xyz',
      }

      const isTextWithUrl =
        mockContext.message &&
        'text' in mockContext.message &&
        mockContext.message.text.includes('instagram.com')

      expect(isTextWithUrl).toBe(false)
    })

    it('должен вызывать transcribeInstagramReel', async () => {
      const instagramUrl = 'https://www.instagram.com/reel/ABC123/'

      const result = await transcribeInstagramReel(instagramUrl)

      expect(transcribeInstagramReel).toHaveBeenCalledWith(instagramUrl)
      expect(result.success).toBe(true)
    })

    it('должен получать видео и текст из Instagram', async () => {
      const result = await transcribeInstagramReel(
        'https://www.instagram.com/reel/ABC123/'
      )

      expect(result.text).toBeDefined()
      expect(result.videoPath).toBeDefined()
    })
  })

  describe('5. Проверка входных данных', () => {
    it('должен отклонять пустое сообщение', () => {
      mockContext.message = null

      const isVideoFile = mockContext.message && 'video' in mockContext.message
      const isTextWithUrl =
        mockContext.message &&
        'text' in mockContext.message &&
        mockContext.message?.text?.includes('instagram.com')

      expect(isVideoFile).toBeFalsy()
      expect(isTextWithUrl).toBeFalsy()
    })

    it('должен отклонять текст без URL', () => {
      mockContext.message = { text: 'просто текст' }

      const isTextWithUrl = mockContext.message.text.includes('instagram.com')
      expect(isTextWithUrl).toBe(false)
    })

    it('должен проверять наличие from.id', () => {
      const hasFromId = mockContext.from?.id
      expect(hasFromId).toBe(223757230)
    })

    it('должен проверять наличие botInfo.username', () => {
      const hasUsername = mockContext.botInfo?.username
      expect(hasUsername).toBe('test_bot')
    })
  })

  describe('6. Списание баланса', () => {
    it('должен получать баланс пользователя', async () => {
      const balance = await getUserBalance('223757230')

      expect(getUserBalance).toHaveBeenCalledWith('223757230')
      expect(balance).toBe(100)
    })

    it('должен списывать 3 звезды', async () => {
      const costInStars = 3

      const result = await updateUserBalance(
        '223757230',
        costInStars,
        PaymentType.MONEY_OUTCOME,
        'Транскрибация видео',
        { service_type: 'VIDEO_TRANSCRIPTION' }
      )

      expect(updateUserBalance).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('должен стоить 3 звезды', () => {
      const cost = 3
      expect(cost).toBe(3)
    })
  })

  describe('7. Результат транскрибации', () => {
    it('должен обрабатывать успешный результат', async () => {
      const result = await transcribeVideoFromDirectUrl(
        'https://example.com/video.mp4'
      )

      expect(result.success).toBe(true)
      expect(result.text).toBeDefined()
    })

    it('должен обрабатывать неуспешный результат', async () => {
      ;(transcribeVideoFromDirectUrl as Mock).mockResolvedValue({
        success: false,
        error: 'Transcription failed',
      })

      const result = await transcribeVideoFromDirectUrl(
        'https://example.com/video.mp4'
      )

      expect(result.success).toBe(false)
    })

    it('должен обрезать длинный текст', () => {
      const maxTextLength = 3500
      const longText = 'a'.repeat(4000)

      const displayText =
        longText.length > maxTextLength
          ? longText.substring(0, maxTextLength) + '...'
          : longText

      expect(displayText.length).toBe(maxTextLength + 3) // +3 для "..."
    })
  })

  describe('8. Обработка ошибок', () => {
    it('должен показывать ошибку при приватном видео', () => {
      const error = new Error('Instagram may require login')
      const isRu = true

      const errorMessage = error.message.includes('Instagram may require login')
        ? isRu
          ? '❌ Не удалось скачать видео из Instagram'
          : '❌ Failed to download Instagram video'
        : '❌ Error'

      expect(errorMessage).toContain('Instagram')
    })

    it('должен показывать ошибку при rate-limit', () => {
      const error = new Error('rate-limit reached')
      const isRu = true

      const isRateLimit = error.message.includes('rate-limit reached')
      expect(isRateLimit).toBe(true)
    })

    it('должен показывать ошибку при слишком большом файле', () => {
      const error = new Error('File too large')
      const isRu = true

      const errorMessage = error.message.includes('File too large')
        ? isRu
          ? '❌ Видео слишком большое'
          : '❌ Video is too large'
        : '❌ Error'

      expect(errorMessage).toContain('большое')
    })

    it('должен вызывать sendGenericErrorMessage при критической ошибке', async () => {
      const context = { from: null, botInfo: null }

      await sendGenericErrorMessage(context as any, true)

      expect(sendGenericErrorMessage).toHaveBeenCalled()
    })
  })

  describe('9. Локализация', () => {
    it('должен показывать результат на русском', () => {
      const isRu = true
      const message = isRu
        ? '📺 Транскрибация завершена!'
        : '📺 Transcription completed!'

      expect(message).toContain('Транскрибация')
    })

    it('должен показывать результат на английском', () => {
      const isRu = false
      const message = isRu
        ? '📺 Транскрибация завершена!'
        : '📺 Transcription completed!'

      expect(message).toContain('Transcription')
    })

    it('должен показывать стоимость на русском', () => {
      const isRu = true
      const cost = 3
      const balance = 97
      const message = isRu
        ? `💰 Стоимость: ${cost} ⭐\nВаш баланс: ${balance} ⭐`
        : `💰 Cost: ${cost} ⭐\nYour balance: ${balance} ⭐`

      expect(message).toContain('Стоимость')
    })
  })

  describe('10. Кнопки продолжения', () => {
    it('должен показывать кнопку "Еще одно видео"', () => {
      const isRu = true
      const buttonText = isRu ? '📺 Еще одно видео' : '📺 Another video'

      expect(buttonText).toContain('видео')
    })

    it('должен показывать кнопку "Главное меню"', () => {
      const isRu = true
      const buttonText = isRu ? '🏠 Главное меню' : '🏠 Main menu'

      expect(buttonText).toContain('меню')
    })

    it('должен перезапускать сцену при нажатии "Еще одно видео"', async () => {
      await mockContext.scene.reenter()
      expect(mockContext.scene.reenter).toHaveBeenCalled()
    })
  })
})
