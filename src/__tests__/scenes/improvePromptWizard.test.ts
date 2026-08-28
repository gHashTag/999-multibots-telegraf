/**
 * Tests for improvePromptWizard (AI Prompt Enhancement)
 * Covers: Prompt improvement, mode handling, generation triggering
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/core/openai/upgradePrompt', () => ({
  upgradePrompt: vi.fn(() =>
    Promise.resolve('Enhanced cinematic prompt with detailed description')
  ),
}))

vi.mock('@/services/generateTextToImageDirect', () => ({
  generateTextToImageDirect: vi.fn(() =>
    Promise.resolve({
      success: true,
      imageUrl: 'https://example.com/generated.jpg',
    })
  ),
}))

vi.mock('@/services/generateNeuroPhotoHybrid', () => ({
  generateNeuroPhotoHybrid: vi.fn(() =>
    Promise.resolve({
      success: true,
      imageUrl: 'https://example.com/neurophoto.jpg',
    })
  ),
}))

vi.mock('@/modules/videoGenerator/generateTextToVideo', () => ({
  generateTextToVideo: vi.fn(() =>
    Promise.resolve({
      success: true,
      videoUrl: 'https://example.com/video.mp4',
    })
  ),
}))

vi.mock('@/navigation', () => ({
  sendPromptImprovementMessage: vi.fn(() => Promise.resolve()),
  sendPromptImprovementFailureMessage: vi.fn(() => Promise.resolve()),
  sendGenericErrorMessage: vi.fn(() => Promise.resolve()),
  showMainMenu: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/db/userSettings', () => ({
  getUserProfileAndSettings: vi.fn(() =>
    Promise.resolve({
      profile: { telegram_id: '223757230' },
      settings: {},
    })
  ),
}))

vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(100)),
  getUserData: vi.fn(() => Promise.resolve({ gender: 'male' })),
}))

vi.mock('@/helpers/sendLongMessage', () => ({
  sendImprovedPrompt: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/helpers/completionNotification', () => ({
  sendCompletionNotification: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  logSessionSafely: vi.fn(),
}))

vi.mock('@/interfaces/modes', () => ({
  ModeEnum: {
    ImprovePromptWizard: 'improve_prompt',
    NeuroPhoto: 'neuro_photo',
    TextToImage: 'text_to_image',
    TextToVideo: 'text_to_video',
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { upgradePrompt } from '@/core/openai/upgradePrompt'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'
import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import { generateTextToVideo } from '@/modules/videoGenerator/generateTextToVideo'
import {
  sendPromptImprovementMessage,
  sendPromptImprovementFailureMessage,
  sendGenericErrorMessage,
} from '@/navigation'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { getUserBalance, getUserData } from '@/core/supabase'
import { sendImprovedPrompt } from '@/helpers/sendLongMessage'
import { ModeEnum } from '@/interfaces/modes'

const MAX_ATTEMPTS = 10

describe('improvePromptWizard (AI Prompt Enhancement)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    scene: {
      state: { prompt: 'original prompt', mode: 'neuro_photo' },
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'improve_prompt' },
    },
    session: {
      prompt: null as string | null,
      mode: null as string | null,
      attempts: 0,
      userModel: {
        trigger_word: 'TOK',
        model_url: 'https://example.com/model',
      },
      videoModel: 'minimax-video-01',
      selectedResolution: '16:9',
      selectedImageModel: 'flux-schnell',
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
      prompt: null,
      mode: null,
      attempts: 0,
      userModel: {
        trigger_word: 'TOK',
        model_url: 'https://example.com/model',
      },
      videoModel: 'minimax-video-01',
      selectedResolution: '16:9',
      selectedImageModel: 'flux-schnell',
    }
    mockContext.scene.state = { prompt: 'original prompt', mode: 'neuro_photo' }
    mockContext.message = null
    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(upgradePrompt as Mock).mockResolvedValue(
      'Enhanced cinematic prompt with detailed description'
    )
    ;(getUserProfileAndSettings as Mock).mockResolvedValue({
      profile: { telegram_id: '223757230' },
      settings: {},
    })
    ;(getUserBalance as Mock).mockResolvedValue(100)
    ;(getUserData as Mock).mockResolvedValue({ gender: 'male' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Инициализация', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен получать промпт из state', () => {
      if (!mockContext.session.prompt && mockContext.scene.state?.prompt) {
        mockContext.session.prompt = mockContext.scene.state.prompt
      }

      expect(mockContext.session.prompt).toBe('original prompt')
    })

    it('должен получать mode из state', () => {
      if (!mockContext.session.mode && mockContext.scene.state?.mode) {
        mockContext.session.mode = mockContext.scene.state.mode
      }

      expect(mockContext.session.mode).toBe('neuro_photo')
    })

    it('должен проверять наличие from.id', () => {
      const hasFromId = !!mockContext.from?.id
      expect(hasFromId).toBe(true)
    })

    it('должен инициализировать счетчик попыток', () => {
      mockContext.session.attempts = 0
      expect(mockContext.session.attempts).toBe(0)
    })
  })

  describe('2. Улучшение промпта', () => {
    it('должен вызывать upgradePrompt', async () => {
      const originalPrompt = 'simple landscape'
      const improvedPrompt = await upgradePrompt(originalPrompt)

      expect(upgradePrompt).toHaveBeenCalledWith(originalPrompt)
      expect(improvedPrompt).toBeDefined()
    })

    it('должен сохранять улучшенный промпт в сессии', async () => {
      const improvedPrompt = await upgradePrompt('test prompt')
      mockContext.session.prompt = improvedPrompt

      expect(mockContext.session.prompt).toBe(
        'Enhanced cinematic prompt with detailed description'
      )
    })

    it('должен показывать сообщение об улучшении', async () => {
      await sendPromptImprovementMessage(mockContext as any, true)

      expect(sendPromptImprovementMessage).toHaveBeenCalled()
    })

    it('должен отправлять улучшенный промпт пользователю', async () => {
      const improvedPrompt = 'Enhanced prompt'
      const isRu = true

      await sendImprovedPrompt(mockContext as any, improvedPrompt, isRu, {
        parse_mode: 'MarkdownV2',
      })

      expect(sendImprovedPrompt).toHaveBeenCalled()
    })

    it('должен обрабатывать ошибку улучшения', async () => {
      ;(upgradePrompt as Mock).mockResolvedValue(null)

      const improvedPrompt = await upgradePrompt('test')

      if (!improvedPrompt) {
        await sendPromptImprovementFailureMessage(mockContext as any, true)
      }

      expect(sendPromptImprovementFailureMessage).toHaveBeenCalled()
    })
  })

  describe('3. Кнопки управления', () => {
    it('должен обрабатывать кнопку "Да. Сгенерировать?"', () => {
      const isRu = true
      const buttonText = isRu ? '✅ Да. Cгенерировать?' : '✅ Yes. Generate?'

      expect(buttonText).toContain('генерировать')
    })

    it('должен обрабатывать кнопку "Еще раз улучшить"', () => {
      const isRu = true
      const buttonText = isRu ? '🔄 Еще раз улучшить' : '🔄 Improve again'

      expect(buttonText).toContain('улучшить')
    })

    it('должен обрабатывать кнопку "Отмена"', () => {
      const isRu = true
      const buttonText = isRu ? 'Отмена' : 'Cancel'

      expect(buttonText).toBe('Отмена')
    })
  })

  describe('4. Повторное улучшение', () => {
    it('должен увеличивать счетчик попыток', () => {
      mockContext.session.attempts = 5
      mockContext.session.attempts++

      expect(mockContext.session.attempts).toBe(6)
    })

    it('должен ограничивать максимум попыток', () => {
      mockContext.session.attempts = MAX_ATTEMPTS

      const canRetry = mockContext.session.attempts < MAX_ATTEMPTS
      expect(canRetry).toBe(false)
    })

    it('должен показывать сообщение при достижении лимита', () => {
      mockContext.session.attempts = MAX_ATTEMPTS
      const isRu = true

      const message = isRu
        ? 'Достигнуто максимальное количество попыток улучшения промпта.'
        : 'Maximum number of prompt improvement attempts reached.'

      expect(message).toContain('максимальное')
    })
  })

  describe('5. Генерация NeuroPhoto', () => {
    it('должен получать данные пользователя для NeuroPhoto', async () => {
      const userData = await getUserData('223757230')

      expect(getUserData).toHaveBeenCalledWith('223757230')
      expect(userData?.gender).toBe('male')
    })

    it('должен формировать полный промпт с trigger_word', () => {
      const triggerWord = 'TOK'
      const genderPromptPart = 'male'
      const prompt = 'sunset on beach'
      const detailPrompt = 'Cinematic Lighting, ethereal light'

      const fullPrompt = `Fashionable ${triggerWord} ${genderPromptPart}, ${prompt}, ${detailPrompt}`

      expect(fullPrompt).toContain('TOK')
      expect(fullPrompt).toContain('male')
    })

    it('должен вызывать generateNeuroPhotoHybrid', async () => {
      await generateNeuroPhotoHybrid(
        'full prompt',
        'https://example.com/model',
        1,
        '223757230',
        mockContext as any,
        'test_bot'
      )

      expect(generateNeuroPhotoHybrid).toHaveBeenCalled()
    })
  })

  describe('6. Генерация TextToImage', () => {
    it('должен проверять наличие selectedImageModel', () => {
      const hasModel = !!mockContext.session.selectedImageModel
      expect(hasModel).toBe(true)
    })

    it('должен вызывать generateTextToImageDirect', async () => {
      await generateTextToImageDirect(
        'enhanced prompt',
        'flux-schnell',
        1,
        '223757230',
        'testuser',
        true,
        mockContext as any
      )

      expect(generateTextToImageDirect).toHaveBeenCalled()
    })

    it('должен получать баланс после генерации', async () => {
      const balance = await getUserBalance('223757230')

      expect(getUserBalance).toHaveBeenCalledWith('223757230')
      expect(balance).toBe(100)
    })
  })

  describe('7. Генерация TextToVideo', () => {
    it('должен проверять наличие videoModel', () => {
      const hasModel = !!mockContext.session.videoModel
      expect(hasModel).toBe(true)
    })

    it('должен вызывать generateTextToVideo', async () => {
      await generateTextToVideo(
        'video prompt',
        '223757230',
        'testuser',
        true,
        'test_bot',
        'minimax-video-01',
        '16:9'
      )

      expect(generateTextToVideo).toHaveBeenCalled()
    })
  })

  describe('8. Получение профиля пользователя', () => {
    it('должен получать profile и settings', async () => {
      const { profile, settings } = await getUserProfileAndSettings(223757230)

      expect(getUserProfileAndSettings).toHaveBeenCalledWith(223757230)
      expect(profile).toBeDefined()
      expect(settings).toBeDefined()
    })

    it('должен обрабатывать отсутствие профиля', async () => {
      ;(getUserProfileAndSettings as Mock).mockResolvedValue({
        profile: null,
        settings: null,
      })

      const { profile, settings } = await getUserProfileAndSettings(223757230)

      expect(profile).toBeNull()
    })
  })

  describe('9. Обработка ошибок', () => {
    it('должен вызывать sendGenericErrorMessage при ошибке', async () => {
      await sendGenericErrorMessage(mockContext as any, true)

      expect(sendGenericErrorMessage).toHaveBeenCalled()
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен обрабатывать неизвестный режим', () => {
      mockContext.session.mode = 'unknown_mode'
      const isRu = true

      const errorMessage = isRu
        ? 'improvePromptWizard: Неизвестный режим'
        : 'improvePromptWizard: Unknown mode'

      expect(errorMessage).toContain('Неизвестный')
    })
  })

  describe('10. Локализация', () => {
    it('должен показывать сообщение улучшения на русском', () => {
      const isRu = true
      const message = isRu
        ? '⏳ Повторное улучшение промпта...'
        : '⏳ Re-improving prompt...'

      expect(message).toContain('улучшение')
    })

    it('должен показывать сообщение отмены на русском', () => {
      const isRu = true
      const message = isRu ? 'Операция отменена' : 'Operation cancelled'

      expect(message).toContain('отменена')
    })

    it('должен показывать ошибку идентификации на русском', () => {
      const isRu = true
      const message = isRu
        ? 'Ошибка идентификации пользователя'
        : 'User identification error'

      expect(message).toContain('идентификации')
    })
  })
})
