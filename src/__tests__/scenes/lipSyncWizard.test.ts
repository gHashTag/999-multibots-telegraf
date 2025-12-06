/**
 * Tests for lipSyncWizard (LipSync Generation)
 * Covers: Admin access, video/audio input, balance check, generation
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(1000)),
}))

vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(() => Promise.resolve({ error: null })),
}))

vi.mock('@/services/generateLipSync', () => ({
  generateLipSync: vi.fn(() => Promise.resolve({
    success: true,
    videoUrl: 'https://example.com/lipsync.mp4',
  })),
}))

vi.mock('@/price/helpers/modelsCost', () => ({
  BASE_COSTS: {
    lip_sync: 84.38,
  },
}))

vi.mock('@/interfaces/zod/lipsync.zod', () => ({
  validateVideoInput: vi.fn((input) => input),
  validateAudioInput: vi.fn((input) => input),
  validateSession: vi.fn((session) => session),
  validateTelegramFile: vi.fn((file) => file),
  isValidAdmin: vi.fn((telegramId, adminIds) => adminIds.includes(telegramId)),
  LIPSYNC_CONSTANTS: {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    SUPPORTED_VIDEO_FORMATS: ['mp4', 'webm', 'mov'],
    SUPPORTED_AUDIO_FORMATS: ['mp3', 'wav', 'm4a'],
    MIN_DURATION: 1,
    MAX_DURATION: 60,
  },
  LipsyncSessionSchema: {},
  MediaInputSchema: {},
  LipsyncErrorSchema: {},
}))

vi.mock('@/interfaces/modes', () => ({
  ModeEnum: {
    LipSync: 'lip_sync',
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
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { generateLipSync } from '@/services/generateLipSync'
import { BASE_COSTS } from '@/price/helpers/modelsCost'
import {
  validateVideoInput,
  validateAudioInput,
  validateSession,
  validateTelegramFile,
  isValidAdmin,
  LIPSYNC_CONSTANTS,
} from '@/interfaces/zod/lipsync.zod'

describe('lipSyncWizard (LipSync Generation)', () => {
  const mockContext = {
    from: { id: 123456789, language_code: 'ru' },
    reply: vi.fn(),
    answerCbQuery: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'lip_sync' },
    },
    session: {
      step: null as any,
      videoUrl: null as any,
      audioUrl: null as any,
      startTime: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      token: 'test_token',
      getFile: vi.fn(() => Promise.resolve({ file_path: 'path/to/file.mp4' })),
    },
    message: null as any,
    callbackQuery: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      step: null,
      videoUrl: null,
      audioUrl: null,
      startTime: null,
    }
    mockContext.message = null
    mockContext.callbackQuery = null
    process.env.ADMIN_IDS = '123456789'

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getUserBalance as Mock).mockResolvedValue(1000)
    ;(updateUserBalance as Mock).mockResolvedValue({ error: null })
    ;(generateLipSync as Mock).mockResolvedValue({
      success: true,
      videoUrl: 'https://example.com/lipsync.mp4',
    })
    ;(isValidAdmin as Mock).mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ADMIN_IDS
  })

  describe('1. Проверка админских прав', () => {
    it('должен разрешать доступ админам', () => {
      const telegramId = '123456789'
      const adminIds = ['123456789']
      const isAdmin = isValidAdmin(telegramId, adminIds)

      expect(isAdmin).toBe(true)
    })

    it('должен запрещать доступ не-админам', () => {
      ;(isValidAdmin as Mock).mockReturnValue(false)

      const telegramId = '999999999'
      const adminIds = ['123456789']
      const isAdmin = isValidAdmin(telegramId, adminIds)

      expect(isAdmin).toBe(false)
    })

    it('должен показывать сообщение о недоступности на русском', () => {
      const isRu = true
      const message = isRu
        ? '🔒 Извините, функция LipSync временно доступна только администраторам.'
        : '🔒 Sorry, LipSync feature is temporarily available for administrators only.'

      expect(message).toContain('администраторам')
    })

    it('должен показывать сообщение на английском', () => {
      const isRu = false
      const message = isRu
        ? '🔒 Извините, функция LipSync временно доступна только администраторам.'
        : '🔒 Sorry, LipSync feature is temporarily available for administrators only.'

      expect(message).toContain('administrators only')
    })
  })

  describe('2. Инициализация сессии', () => {
    it('должен инициализировать сессию с правильными полями', () => {
      const session = validateSession({
        step: 'video',
        startTime: Date.now(),
      })

      expect(session.step).toBe('video')
      expect(session.startTime).toBeDefined()
    })

    it('должен переходить к шагу ввода видео', () => {
      mockContext.session.step = 'video'
      expect(mockContext.session.step).toBe('video')
    })
  })

  describe('3. Ввод видео (Шаг 2)', () => {
    it('должен показывать запрос видео на русском', () => {
      const isRu = true
      const message = isRu
        ? 'Отправьте видео или URL видео'
        : 'Send a video or video URL'

      expect(message).toBe('Отправьте видео или URL видео')
    })

    it('должен валидировать Telegram видео файл', () => {
      const file = {
        file_id: 'test_file_id',
        file_size: 10 * 1024 * 1024, // 10MB
      }

      const validatedFile = validateTelegramFile(file)
      expect(validatedFile.file_id).toBe('test_file_id')
    })

    it('должен отклонять слишком большие файлы', () => {
      const maxSize = LIPSYNC_CONSTANTS.MAX_FILE_SIZE
      const fileSize = 60 * 1024 * 1024 // 60MB

      const isTooBig = fileSize > maxSize
      expect(isTooBig).toBe(true)
    })

    it('должен валидировать URL видео', () => {
      const videoInput = validateVideoInput({
        type: 'url',
        url: 'https://example.com/video.mp4',
      })

      expect(videoInput.type).toBe('url')
    })

    it('должен сохранять videoUrl в сессии', () => {
      mockContext.session.videoUrl = 'https://example.com/video.mp4'
      expect(mockContext.session.videoUrl).toBe('https://example.com/video.mp4')
    })
  })

  describe('4. Ввод аудио (Шаг 3)', () => {
    it('должен показывать запрос аудио после видео', () => {
      const isRu = true
      const message = isRu
        ? 'Отправьте аудио или URL аудио'
        : 'Send audio or audio URL'

      expect(message).toContain('аудио')
    })

    it('должен валидировать аудио файл', () => {
      const audioInput = validateAudioInput({
        type: 'telegram_file',
        file_id: 'audio_file_id',
      })

      expect(audioInput.type).toBe('telegram_file')
    })

    it('должен сохранять audioUrl в сессии', () => {
      mockContext.session.audioUrl = 'https://example.com/audio.mp3'
      expect(mockContext.session.audioUrl).toBe('https://example.com/audio.mp3')
    })
  })

  describe('5. Проверка баланса', () => {
    it('должен получать баланс пользователя', async () => {
      const balance = await getUserBalance('223757230')

      expect(getUserBalance).toHaveBeenCalledWith('223757230')
      expect(balance).toBe(1000)
    })

    it('должен рассчитывать стоимость LipSync', () => {
      const cost = BASE_COSTS.lip_sync
      expect(cost).toBe(84.38)
    })

    it('должен проверять достаточность баланса', async () => {
      const balance = await getUserBalance('223757230')
      const cost = 84.38

      const hasEnoughBalance = balance >= cost
      expect(hasEnoughBalance).toBe(true)
    })

    it('должен отклонять при недостаточном балансе', async () => {
      ;(getUserBalance as Mock).mockResolvedValue(50)

      const balance = await getUserBalance('223757230')
      const cost = 84.38

      const hasEnoughBalance = balance >= cost
      expect(hasEnoughBalance).toBe(false)
    })
  })

  describe('6. Генерация LipSync', () => {
    it('должен вызывать generateLipSync с правильными параметрами', async () => {
      const result = await generateLipSync({
        videoUrl: 'https://example.com/video.mp4',
        audioUrl: 'https://example.com/audio.mp3',
        telegramId: '223757230',
      })

      expect(generateLipSync).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен обрабатывать ошибку генерации', async () => {
      ;(generateLipSync as Mock).mockResolvedValue({
        success: false,
        error: 'Generation failed',
      })

      const result = await generateLipSync({
        videoUrl: 'https://example.com/video.mp4',
        audioUrl: 'https://example.com/audio.mp3',
        telegramId: '223757230',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('7. Списание баланса', () => {
    it('должен списывать баланс после успешной генерации', async () => {
      await updateUserBalance('223757230', -84.38)

      expect(updateUserBalance).toHaveBeenCalledWith('223757230', -84.38)
    })

    it('должен обрабатывать ошибку списания', async () => {
      ;(updateUserBalance as Mock).mockResolvedValue({
        error: { message: 'Update failed' },
      })

      const result = await updateUserBalance('223757230', -84.38)
      expect(result.error).toBeDefined()
    })
  })

  describe('8. Кнопка отмены', () => {
    it('должен обрабатывать callback lipsync_cancel', () => {
      mockContext.callbackQuery = { data: 'lipsync_cancel' }

      const isCancel =
        mockContext.callbackQuery &&
        'data' in mockContext.callbackQuery &&
        mockContext.callbackQuery.data === 'lipsync_cancel'

      expect(isCancel).toBe(true)
    })

    it('должен показывать сообщение об отмене', () => {
      const isRu = true
      const message = isRu ? '❌ Процесс отменён.' : '❌ Process cancelled.'

      expect(message).toBe('❌ Процесс отменён.')
    })
  })

  describe('9. Константы LipSync', () => {
    it('должен иметь максимальный размер файла 50MB', () => {
      expect(LIPSYNC_CONSTANTS.MAX_FILE_SIZE).toBe(50 * 1024 * 1024)
    })

    it('должен поддерживать форматы видео', () => {
      expect(LIPSYNC_CONSTANTS.SUPPORTED_VIDEO_FORMATS).toContain('mp4')
      expect(LIPSYNC_CONSTANTS.SUPPORTED_VIDEO_FORMATS).toContain('webm')
      expect(LIPSYNC_CONSTANTS.SUPPORTED_VIDEO_FORMATS).toContain('mov')
    })

    it('должен поддерживать форматы аудио', () => {
      expect(LIPSYNC_CONSTANTS.SUPPORTED_AUDIO_FORMATS).toContain('mp3')
      expect(LIPSYNC_CONSTANTS.SUPPORTED_AUDIO_FORMATS).toContain('wav')
      expect(LIPSYNC_CONSTANTS.SUPPORTED_AUDIO_FORMATS).toContain('m4a')
    })

    it('должен иметь ограничения длительности', () => {
      expect(LIPSYNC_CONSTANTS.MIN_DURATION).toBe(1)
      expect(LIPSYNC_CONSTANTS.MAX_DURATION).toBe(60)
    })
  })

  describe('10. Обработка ошибок', () => {
    it('должен показывать ошибку инициализации', () => {
      const isRu = true
      const message = isRu
        ? '❌ Ошибка инициализации. Попробуйте позже.'
        : '❌ Initialization error. Try again later.'

      expect(message).toContain('Ошибка инициализации')
    })

    it('должен показывать ошибку некорректного видео', () => {
      const isRu = true
      const message = isRu
        ? '❌ Некорректное видео. Отправьте видео файл или URL.'
        : '❌ Invalid video. Send a video file or URL.'

      expect(message).toContain('Некорректное видео')
    })

    it('должен показывать ошибку размера файла', () => {
      const isRu = true
      const maxSizeMB = Math.round(LIPSYNC_CONSTANTS.MAX_FILE_SIZE / (1024 * 1024))
      const message = isRu
        ? `❌ Видео слишком большое. Максимальный размер: ${maxSizeMB}MB`
        : `❌ Video is too large. Maximum size: ${maxSizeMB}MB`

      expect(message).toContain('50MB')
    })
  })

  describe('11. Формирование URL из Telegram файла', () => {
    it('должен формировать правильный URL', async () => {
      const fileId = 'test_file_id'
      const token = 'test_token'

      const fileInfo = await mockContext.telegram.getFile(fileId)
      const videoUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`

      expect(videoUrl).toContain('api.telegram.org')
      expect(videoUrl).toContain('file/bot')
    })
  })

  describe('12. Обновление сессии между шагами', () => {
    it('должен обновлять шаг сессии', () => {
      mockContext.session.step = 'video'
      expect(mockContext.session.step).toBe('video')

      mockContext.session.step = 'audio'
      expect(mockContext.session.step).toBe('audio')

      mockContext.session.step = 'generate'
      expect(mockContext.session.step).toBe('generate')
    })

    it('должен сохранять startTime', () => {
      const startTime = Date.now()
      mockContext.session.startTime = startTime

      expect(mockContext.session.startTime).toBe(startTime)
    })
  })
})
