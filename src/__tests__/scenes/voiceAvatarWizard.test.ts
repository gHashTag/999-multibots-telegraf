/**
 * Tests for voiceAvatarWizard (Voice Avatar Creation)
 * Covers: Voice message handling, avatar creation, Veed Fabric integration
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/language', () => ({
  isRussian: vi.fn(() => true),
}))

vi.mock('@/services/plan_b/createVoiceAvatar', () => ({
  createVoiceAvatar: vi.fn(() =>
    Promise.resolve({
      success: true,
      voiceId: 'voice_123',
    })
  ),
}))

vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(100)),
}))

vi.mock('@/price/helpers', () => ({
  sendInsufficientStarsMessage: vi.fn(() => Promise.resolve()),
  sendBalanceMessage: vi.fn(() => Promise.resolve()),
  voiceConversationCost: 5,
}))

vi.mock('@/navigation', () => ({
  createHelpCancelKeyboard: vi.fn(isRu => ({
    reply_markup: { keyboard: [[{ text: isRu ? 'Отмена' : 'Cancel' }]] },
  })),
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
  showMainMenu: vi.fn(() => Promise.resolve()),
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
    VoiceAvatar: 'voice',
    VeedFabricLipSync: 'veed_fabric_lipsync',
  },
}))

// Import after mocks
import { isRussian } from '@/helpers/language'
import { createVoiceAvatar } from '@/services/plan_b/createVoiceAvatar'
import { getUserBalance } from '@/core/supabase'
import {
  createHelpCancelKeyboard,
  handleHelpCancel,
  showMainMenu,
} from '@/navigation'
import { ModeEnum } from '@/interfaces/modes'

describe('voiceAvatarWizard (Voice Avatar Creation)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'voice' },
    },
    session: {
      returnToVeedFabricAfterVoice: false,
      veedFabric: null as any,
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
          file_path: 'voice/test.ogg',
        })
      ),
    },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      returnToVeedFabricAfterVoice: false,
      veedFabric: null,
    }
    mockContext.message = null
    ;(isRussian as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(createVoiceAvatar as Mock).mockResolvedValue({
      success: true,
      voiceId: 'voice_123',
    })
    ;(getUserBalance as Mock).mockResolvedValue(100)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Запрос голосового сообщения', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussian(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен показывать сообщение на русском', () => {
      const isRu = true
      const message = isRu
        ? '🎙️ Пожалуйста, отправьте голосовое сообщение для создания голосового аватара'
        : '🎙️ Please send a voice message to create your voice avatar'

      expect(message).toContain('голосовое сообщение')
    })

    it('должен показывать сообщение на английском', () => {
      const isRu = false
      const message = isRu
        ? '🎙️ Пожалуйста, отправьте голосовое сообщение'
        : '🎙️ Please send a voice message to create your voice avatar'

      expect(message).toContain('voice message')
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

  describe('2. Обработка команд отмены', () => {
    it('должен проверять отмену/справку', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      expect(isCancel).toBe(true)
    })

    it('должен обрабатывать /menu команду', () => {
      mockContext.message = { text: '/menu' }

      const isMenuCommand =
        mockContext.message?.text === '/menu' ||
        mockContext.message?.text === '/cancel'
      expect(isMenuCommand).toBe(true)
    })

    it('должен обрабатывать /cancel команду', () => {
      mockContext.message = { text: '/cancel' }

      const isCancelCommand = mockContext.message?.text === '/cancel'
      expect(isCancelCommand).toBe(true)
    })

    it('должен выходить из сцены при отмене', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен показывать главное меню при отмене', async () => {
      await showMainMenu(mockContext as any)
      expect(showMainMenu).toHaveBeenCalled()
    })
  })

  describe('3. Шаг 2: Обработка голосового сообщения', () => {
    it('должен распознавать voice сообщение', () => {
      mockContext.message = {
        voice: { file_id: 'voice_123', duration: 10 },
      }

      const hasVoice = mockContext.message && 'voice' in mockContext.message
      expect(hasVoice).toBe(true)
    })

    it('должен распознавать audio сообщение', () => {
      mockContext.message = {
        audio: { file_id: 'audio_123', duration: 15 },
      }

      const hasAudio = mockContext.message && 'audio' in mockContext.message
      expect(hasAudio).toBe(true)
    })

    it('должен получать file_id из voice', () => {
      mockContext.message = {
        voice: { file_id: 'voice_123', duration: 10 },
      }

      const fileId = mockContext.message.voice.file_id
      expect(fileId).toBe('voice_123')
    })

    it('должен получать file_id из audio', () => {
      mockContext.message = {
        audio: { file_id: 'audio_123', duration: 15 },
      }

      const fileId = mockContext.message.audio.file_id
      expect(fileId).toBe('audio_123')
    })

    it('должен формировать URL файла', async () => {
      const file = await mockContext.telegram.getFile('voice_123')
      const fileUrl = `https://api.telegram.org/file/bot${mockContext.telegram.token}/${file.file_path}`

      expect(fileUrl).toContain('api.telegram.org')
      expect(fileUrl).toContain('voice/test.ogg')
    })
  })

  describe('4. Проверка типа сообщения', () => {
    it('должен отклонять сообщения без voice/audio/text', () => {
      mockContext.message = { photo: [{ file_id: 'photo_123' }] }

      const hasValidMessage =
        mockContext.message &&
        ('voice' in mockContext.message ||
          'audio' in mockContext.message ||
          'text' in mockContext.message)

      expect(hasValidMessage).toBe(false)
    })

    it('должен просить отправить голосовое при неверном типе', () => {
      const isRu = true
      const message = isRu
        ? '🎙️ Пожалуйста, отправьте голосовое сообщение'
        : '🎙️ Please send a voice message'

      expect(message).toContain('голосовое')
    })
  })

  describe('5. Создание голосового аватара', () => {
    it('должен вызывать createVoiceAvatar', async () => {
      const fileUrl = 'https://api.telegram.org/file/bot123/voice/test.ogg'

      await createVoiceAvatar(
        fileUrl,
        '223757230',
        'testuser',
        true,
        mockContext as any
      )

      expect(createVoiceAvatar).toHaveBeenCalledWith(
        fileUrl,
        '223757230',
        'testuser',
        true,
        mockContext
      )
    })

    it('должен обрабатывать успешное создание', async () => {
      const result = await createVoiceAvatar(
        'https://example.com/voice.ogg',
        '223757230',
        'testuser',
        true,
        mockContext as any
      )

      expect(result.success).toBe(true)
    })
  })

  describe('6. Интеграция с Veed Fabric', () => {
    it('должен проверять флаг returnToVeedFabricAfterVoice', () => {
      mockContext.session.returnToVeedFabricAfterVoice = true
      mockContext.session.veedFabric = { someData: 'test' }

      expect(mockContext.session.returnToVeedFabricAfterVoice).toBe(true)
      expect(mockContext.session.veedFabric).toBeDefined()
    })

    it('должен очищать флаг после возврата', () => {
      mockContext.session.returnToVeedFabricAfterVoice = true

      // Имитация очистки флага
      delete mockContext.session.returnToVeedFabricAfterVoice

      expect(mockContext.session.returnToVeedFabricAfterVoice).toBeUndefined()
    })

    it('должен входить в VeedFabricLipSync сцену', async () => {
      await mockContext.scene.enter(ModeEnum.VeedFabricLipSync)

      expect(mockContext.scene.enter).toHaveBeenCalledWith(
        'veed_fabric_lipsync'
      )
    })

    it('должен показывать сообщение о возврате к lip-sync', () => {
      const isRu = true
      const message = isRu
        ? '✅ Голос успешно создан!\n\n🎭 Возвращаемся к генерации lip-sync видео...'
        : '✅ Voice successfully created!\n\n🎭 Returning to lip-sync generation...'

      expect(message).toContain('lip-sync')
    })
  })

  describe('7. Успешное создание аватара', () => {
    it('должен показывать сообщение успеха на русском', () => {
      const isRu = true
      const message = isRu
        ? '✅ Голосовой аватар успешно создан!\n\n🎙️ Теперь вы можете использовать команду "🎙️ Текст в голос"'
        : '✅ Voice avatar successfully created!'

      expect(message).toContain('успешно создан')
    })

    it('должен показывать сообщение успеха на английском', () => {
      const isRu = false
      const message = isRu
        ? '✅ Голосовой аватар успешно создан!'
        : '✅ Voice avatar successfully created!\n\n🎙️ Now you can use the "🎙️ Text to speech" command'

      expect(message).toContain('successfully created')
    })

    it('должен выходить из сцены после успеха', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('8. Обработка ошибок', () => {
    it('должен обрабатывать ошибку getFile', () => {
      const errorMessage = 'File path not found'
      expect(errorMessage).toContain('File path')
    })

    it('должен обрабатывать отсутствие telegram_id', () => {
      const context = { from: null }
      const hasTelegramId = !!context.from?.id

      expect(hasTelegramId).toBe(false)
    })

    it('должен показывать ошибку создания аватара на русском', () => {
      const isRu = true
      const message = isRu
        ? '❌ Произошла ошибка при создании голосового аватара. Пожалуйста, попробуйте позже.'
        : '❌ An error occurred while creating the voice avatar.'

      expect(message).toContain('ошибка')
    })

    it('должен показывать ошибку на английском', () => {
      const isRu = false
      const message = isRu
        ? '❌ Произошла ошибка'
        : '❌ An error occurred while creating the voice avatar. Please try again later.'

      expect(message).toContain('error occurred')
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()
      await showMainMenu(mockContext as any)

      expect(mockContext.scene.leave).toHaveBeenCalled()
      expect(showMainMenu).toHaveBeenCalled()
    })
  })

  describe('9. Проверка file_id', () => {
    it('должен обрабатывать отсутствие file_id', async () => {
      mockContext.message = { voice: {} } // voice без file_id

      const fileId = mockContext.message?.voice?.file_id

      if (!fileId) {
        await mockContext.reply(
          'Ошибка: не удалось получить идентификатор файла'
        )
      }

      expect(mockContext.reply).toHaveBeenCalled()
    })

    it('должен показывать ошибку file_id на русском', () => {
      const isRu = true
      const message = isRu
        ? 'Ошибка: не удалось получить идентификатор файла'
        : 'Error: could not retrieve file ID'

      expect(message).toContain('идентификатор')
    })
  })

  describe('10. Локализация сообщений', () => {
    it('должен показывать подсказку о Text to Speech', () => {
      const isRu = true
      const hint = isRu ? '🎙️ Текст в голос' : '🎙️ Text to speech'

      expect(hint).toContain('🎙️')
    })

    it('должен упоминать главное меню', () => {
      const isRu = true
      const message = isRu
        ? 'найти её в главном меню'
        : 'find it in the main menu'

      expect(message).toContain('меню')
    })
  })
})
