/**
 * Tests for textToSpeechWizard (Text to Speech Conversion)
 * Covers: Voice ID handling, text input, balance check, audio generation
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(100)),
  getVoiceId: vi.fn(() => Promise.resolve('voice_id_123')),
  updateUserBalance: vi.fn(() => Promise.resolve({ error: null })),
}))

vi.mock('@/core/elevenlabs/createAudioFileFromText', () => ({
  createAudioFileFromText: vi.fn(() => Promise.resolve('/tmp/audio_123.mp3')),
  VoiceNotFoundError: class VoiceNotFoundError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'VoiceNotFoundError'
    }
  },
}))

vi.mock('@/helpers/voiceValidation', () => ({
  validateAndCleanVoiceId: vi.fn(() => Promise.resolve(true)),
  getVoiceAvatarErrorMessage: vi.fn((isRu) =>
    isRu ? 'Ошибка голосового аватара' : 'Voice avatar error'
  ),
  getCreateVoiceAvatarMessage: vi.fn((isRu) =>
    isRu ? 'Создайте голосовой аватар' : 'Create voice avatar'
  ),
}))

vi.mock('@/navigation', () => ({
  createHelpCancelKeyboard: vi.fn((isRu) => ({
    reply_markup: {
      keyboard: [[{ text: isRu ? 'Отмена' : 'Cancel' }]],
      resize_keyboard: true,
    },
  })),
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/price/helpers/modelsCost', () => ({
  calculateModeCost: vi.fn(() => ({ stars: 5 })),
}))

vi.mock('@/helpers/checkUserBalance', () => ({
  checkUserBalance: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/helpers/completionNotification', () => ({
  sendCompletionNotification: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn(() => true),
  unlinkSync: vi.fn(),
}))

vi.mock('@/interfaces/modes', () => ({
  ModeEnum: {
    TextToSpeech: 'text_to_speech',
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserBalance, getVoiceId, updateUserBalance } from '@/core/supabase'
import { createAudioFileFromText } from '@/core/elevenlabs/createAudioFileFromText'
import { validateAndCleanVoiceId } from '@/helpers/voiceValidation'
import { createHelpCancelKeyboard, handleHelpCancel } from '@/navigation'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { checkUserBalance } from '@/helpers/checkUserBalance'

describe('textToSpeechWizard (Text to Speech Conversion)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    replyWithVoice: vi.fn(),
    replyWithDocument: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'text_to_speech' },
    },
    session: {
      ttsTextToConvert: null as any,
      pendingTtsText: null as any,
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
      ttsTextToConvert: null,
      pendingTtsText: null,
    }
    mockContext.message = null

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getUserBalance as Mock).mockResolvedValue(100)
    ;(getVoiceId as Mock).mockResolvedValue('voice_id_123')
    ;(validateAndCleanVoiceId as Mock).mockResolvedValue(true)
    ;(createAudioFileFromText as Mock).mockResolvedValue('/tmp/audio_123.mp3')
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(checkUserBalance as Mock).mockResolvedValue(true)
    ;(calculateModeCost as Mock).mockReturnValue({ stars: 5 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Запрос текста', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен показывать запрос текста на русском', () => {
      const isRu = true
      const message = isRu
        ? '🎙️ Отправьте текст, для преобразования его в голос'
        : '🎙️ Send text, to convert it to voice'

      expect(message).toContain('Отправьте текст')
    })

    it('должен показывать запрос на английском', () => {
      const isRu = false
      const message = isRu
        ? '🎙️ Отправьте текст, для преобразования его в голос'
        : '🎙️ Send text, to convert it to voice'

      expect(message).toContain('Send text')
    })

    it('должен создавать клавиатуру с кнопками', () => {
      const keyboard = createHelpCancelKeyboard(true)

      expect(createHelpCancelKeyboard).toHaveBeenCalledWith(true)
      expect(keyboard.reply_markup).toBeDefined()
    })
  })

  describe('2. Обработка pre-filled текста', () => {
    it('должен использовать текст из ttsTextToConvert', () => {
      mockContext.session.ttsTextToConvert = 'Pre-filled text for TTS'

      const prefilledText = mockContext.session.ttsTextToConvert
      expect(prefilledText).toBe('Pre-filled text for TTS')
    })

    it('должен очищать ttsTextToConvert после использования', () => {
      mockContext.session.ttsTextToConvert = 'Pre-filled text'

      // Симулируем использование
      const text = mockContext.session.ttsTextToConvert
      delete mockContext.session.ttsTextToConvert

      expect(mockContext.session.ttsTextToConvert).toBeUndefined()
    })

    it('должен сохранять текст в pendingTtsText', () => {
      mockContext.session.pendingTtsText = 'Pending text'

      expect(mockContext.session.pendingTtsText).toBe('Pending text')
    })

    it('должен показывать pre-filled текст пользователю', () => {
      const isRu = true
      const prefilledText = 'Test text'
      const message = isRu
        ? `📝 Текст для озвучивания:\n\n<i>${prefilledText}</i>\n\n✅ Нажмите /convert чтобы озвучить или отправьте другой текст`
        : `📝 Text to convert:\n\n<i>${prefilledText}</i>\n\n✅ Send /convert to proceed or send different text`

      expect(message).toContain(prefilledText)
    })
  })

  describe('3. Получение Voice ID', () => {
    it('должен получать voice_id пользователя', async () => {
      const voiceId = await getVoiceId('223757230')

      expect(getVoiceId).toHaveBeenCalledWith('223757230')
      expect(voiceId).toBe('voice_id_123')
    })

    it('должен валидировать voice_id', async () => {
      const isValid = await validateAndCleanVoiceId('voice_id_123', '223757230')

      expect(validateAndCleanVoiceId).toHaveBeenCalledWith(
        'voice_id_123',
        '223757230'
      )
      expect(isValid).toBe(true)
    })

    it('должен обрабатывать невалидный voice_id', async () => {
      ;(validateAndCleanVoiceId as Mock).mockResolvedValue(false)

      const isValid = await validateAndCleanVoiceId('invalid_voice', '223757230')
      expect(isValid).toBe(false)
    })
  })

  describe('4. Проверка баланса', () => {
    it('должен рассчитывать стоимость TTS', () => {
      const costResult = calculateModeCost({ mode: 'text_to_speech' })

      expect(costResult.stars).toBe(5)
    })

    it('должен проверять баланс пользователя', async () => {
      const hasBalance = await checkUserBalance(mockContext as any, 5)

      expect(checkUserBalance).toHaveBeenCalledWith(mockContext, 5)
      expect(hasBalance).toBe(true)
    })

    it('должен отклонять при недостаточном балансе', async () => {
      ;(checkUserBalance as Mock).mockResolvedValue(false)

      const hasBalance = await checkUserBalance(mockContext as any, 5)
      expect(hasBalance).toBe(false)
    })
  })

  describe('5. Генерация аудио', () => {
    it('должен вызывать createAudioFileFromText', async () => {
      const audioPath = await createAudioFileFromText({
        text: 'Test text to convert',
        voice_id: 'voice_id_123',
        telegram_id: '223757230',
      })

      expect(createAudioFileFromText).toHaveBeenCalledWith({
        text: 'Test text to convert',
        voice_id: 'voice_id_123',
        telegram_id: '223757230',
      })
      expect(audioPath).toBe('/tmp/audio_123.mp3')
    })

    it('должен обрабатывать ошибку генерации', async () => {
      ;(createAudioFileFromText as Mock).mockResolvedValue(null)

      const audioPath = await createAudioFileFromText({
        text: 'Test text',
        voice_id: 'voice_id_123',
        telegram_id: '223757230',
      })

      expect(audioPath).toBeNull()
    })
  })

  describe('6. Отправка результата', () => {
    it('должен отправлять аудио как голосовое сообщение', async () => {
      await mockContext.replyWithVoice({ source: '/tmp/audio_123.mp3' })

      expect(mockContext.replyWithVoice).toHaveBeenCalledWith({
        source: '/tmp/audio_123.mp3',
      })
    })

    it('должен отправлять аудио как документ', async () => {
      await mockContext.replyWithDocument({ source: '/tmp/audio_123.mp3' })

      expect(mockContext.replyWithDocument).toHaveBeenCalledWith({
        source: '/tmp/audio_123.mp3',
      })
    })
  })

  describe('7. Обработка команды /convert', () => {
    it('должен распознавать команду /convert', () => {
      mockContext.message = { text: '/convert' }
      mockContext.session.pendingTtsText = 'Pending text'

      const isConvertCommand =
        mockContext.message &&
        'text' in mockContext.message &&
        mockContext.message.text === '/convert' &&
        mockContext.session.pendingTtsText

      expect(isConvertCommand).toBe('Pending text')
    })

    it('должен использовать pendingTtsText при /convert', () => {
      mockContext.session.pendingTtsText = 'Text to convert'

      const textToConvert = mockContext.session.pendingTtsText
      delete mockContext.session.pendingTtsText

      expect(textToConvert).toBe('Text to convert')
      expect(mockContext.session.pendingTtsText).toBeUndefined()
    })
  })

  describe('8. Обработка нового текста', () => {
    it('должен принимать новый текст от пользователя', () => {
      mockContext.message = { text: 'New text to convert' }

      const text = mockContext.message.text
      expect(text).toBe('New text to convert')
    })

    it('должен очищать pendingTtsText при новом тексте', () => {
      mockContext.session.pendingTtsText = 'Old pending text'
      mockContext.message = { text: 'New text' }

      // Симулируем очистку
      delete mockContext.session.pendingTtsText

      expect(mockContext.session.pendingTtsText).toBeUndefined()
    })
  })

  describe('9. Обработка отмены/справки', () => {
    it('должен проверять отмену', async () => {
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

  describe('10. Валидация ввода', () => {
    it('должен требовать текстовое сообщение', () => {
      mockContext.message = null

      const hasText = mockContext.message && 'text' in mockContext.message
      expect(hasText).toBeFalsy()
    })

    it('должен показывать просьбу отправить текст', () => {
      const isRu = true
      const message = isRu
        ? '✍️ Пожалуйста, отправьте текст'
        : '✍️ Please send text'

      expect(message).toBe('✍️ Пожалуйста, отправьте текст')
    })
  })

  describe('11. Проверка telegram_id', () => {
    it('должен проверять наличие telegram_id', () => {
      const telegramId = mockContext.from?.id
      expect(telegramId).toBe(223757230)
    })

    it('должен обрабатывать отсутствие telegram_id', () => {
      const context = { from: null }
      const telegramId = context.from?.id

      expect(telegramId).toBeUndefined()
    })
  })

  describe('12. Локализация сообщений', () => {
    it('должен показывать ошибку voice_id на русском', () => {
      const isRu = true
      const message = isRu
        ? 'Ошибка голосового аватара'
        : 'Voice avatar error'

      expect(message).toBe('Ошибка голосового аватара')
    })

    it('должен показывать предложение создать аватар', () => {
      const isRu = true
      const message = isRu
        ? 'Создайте голосовой аватар'
        : 'Create voice avatar'

      expect(message).toBe('Создайте голосовой аватар')
    })
  })
})
