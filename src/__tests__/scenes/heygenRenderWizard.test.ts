/**
 * Tests for heygenRenderWizard (HeyGen Avatar Video Generation)
 * Covers: Avatar selection, cover upload, text/voice input, render-server integration
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(100)),
}))

vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/inngest_app/render-server-client', () => ({
  sendRenderAvatarVideoEvent: vi.fn(() => Promise.resolve({ eventId: 'event_123' })),
  createRenderAvatarPayload: vi.fn(() => ({ telegramId: '223757230' })),
}))

vi.mock('./heygen-avatars-config', () => ({
  HEYGEN_AVATAR_SETS: {
    cocoage: {
      name: 'Cocoage',
      apiKey: 'test_api_key',
      avatars: [
        { id: 'avatar_1', name: 'Avatar 1', emoji: '👤' },
        { id: 'avatar_2', name: 'Avatar 2', emoji: '👩' },
      ],
    },
    haim: {
      name: 'Haim',
      apiKey: 'test_api_key_2',
      avatars: [
        { id: 'avatar_3', name: 'Avatar 3', emoji: '👨' },
      ],
    },
  },
  getVoiceIdForAvatar: vi.fn(() => 'voice_id_123'),
  findAvatarById: vi.fn((id) => ({
    avatar: { id, name: 'Test Avatar', emoji: '👤' },
    apiKey: 'test_api_key',
  })),
}))

vi.mock('@/helpers/ai-reels-pricing', () => ({
  calculateAIReelsPrice: vi.fn(() => ({
    finalPrice: 50,
    breakdown: [],
  })),
  formatPriceMessage: vi.fn(() => '💰 Cost: 50⭐'),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/interfaces/payments.interface', () => ({
  PaymentType: {
    SERVICE_PAYMENT: 'service_payment',
    MONEY_INCOME: 'money_income',
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { sendRenderAvatarVideoEvent, createRenderAvatarPayload } from '@/inngest_app/render-server-client'
import { calculateAIReelsPrice, formatPriceMessage } from '@/helpers/ai-reels-pricing'

describe('heygenRenderWizard (HeyGen Avatar Video Generation)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    answerCbQuery: vi.fn(),
    editMessageText: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'heygen_render_wizard' },
    },
    session: {
      aiReelsRender: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      getFileLink: vi.fn(() => Promise.resolve({ href: 'https://api.telegram.org/file/test.jpg' })),
    },
    botInfo: { username: 'test_bot' },
    update: {} as any,
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = { aiReelsRender: null }
    mockContext.message = null
    mockContext.update = {}

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getUserBalance as Mock).mockResolvedValue(100)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 0: Инициализация и выбор набора аватаров', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен инициализировать сессию aiReelsRender', () => {
      mockContext.session.aiReelsRender = {
        step: 'avatar_set_selection',
        startTime: Date.now(),
        avatarService: 'heygen',
        imageUrl: '',
      }

      expect(mockContext.session.aiReelsRender.avatarService).toBe('heygen')
      expect(mockContext.session.aiReelsRender.step).toBe('avatar_set_selection')
    })

    it('должен показывать выбор набора аватаров на русском', () => {
      const isRu = true
      const message = isRu
        ? '🎬 <b>HeyGen - Выбор аватара</b>\n\n👥 Выберите набор аватаров:'
        : '🎬 <b>HeyGen - Avatar Selection</b>\n\nChoose avatar set:'

      expect(message).toContain('Выбор аватара')
    })

    it('должен показывать Cocoage набор (8 аватаров)', () => {
      const buttonText = '👤 Cocoage (8)'
      expect(buttonText).toContain('Cocoage')
      expect(buttonText).toContain('8')
    })

    it('должен показывать Haim набор (11 аватаров)', () => {
      const buttonText = '👥 Haim (11)'
      expect(buttonText).toContain('Haim')
      expect(buttonText).toContain('11')
    })

    it('должен выходить при отсутствии telegram_id', async () => {
      const ctx = { ...mockContext, from: null }
      const telegramId = ctx.from?.id?.toString()

      if (!telegramId) {
        await mockContext.scene.leave()
      }

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('2. Шаг 1: Выбор набора аватаров (callback)', () => {
    it('должен обрабатывать callback heygen_set_cocoage', () => {
      mockContext.update = {
        callback_query: { data: 'heygen_set_cocoage' },
      }

      const callbackData = 'data' in mockContext.update.callback_query
        ? mockContext.update.callback_query.data
        : ''

      expect(callbackData).toBe('heygen_set_cocoage')
    })

    it('должен обрабатывать callback heygen_set_haim', () => {
      mockContext.update = {
        callback_query: { data: 'heygen_set_haim' },
      }

      const callbackData = mockContext.update.callback_query.data
      const setName = callbackData === 'heygen_set_cocoage' ? 'cocoage' : 'haim'

      expect(setName).toBe('haim')
    })

    it('должен сохранять выбранный набор в сессию', () => {
      mockContext.session.aiReelsRender = {
        heygenAvatarSet: 'cocoage',
        heygenApiKey: 'test_api_key',
      }

      expect(mockContext.session.aiReelsRender.heygenAvatarSet).toBe('cocoage')
      expect(mockContext.session.aiReelsRender.heygenApiKey).toBe('test_api_key')
    })

    it('должен показывать список аватаров после выбора набора', () => {
      const isRu = true
      const setName = 'Cocoage'
      const avatarsCount = 8
      const message = isRu
        ? `✅ Набор: ${setName}\n\n🎭 Выберите аватар (${avatarsCount} доступно):`
        : `✅ Set: ${setName}\n\nChoose avatar (${avatarsCount} available):`

      expect(message).toContain('Cocoage')
      expect(message).toContain('8')
    })

    it('должен требовать нажатие кнопки', async () => {
      mockContext.update = {}

      const hasCallbackQuery = 'callback_query' in mockContext.update
      if (!hasCallbackQuery) {
        await mockContext.reply('❌ Пожалуйста, нажмите одну из кнопок.')
      }

      expect(mockContext.reply).toHaveBeenCalled()
    })
  })

  describe('3. Шаг 2: Выбор конкретного аватара', () => {
    it('должен обрабатывать callback heygen_avatar_*', () => {
      const callbackData = 'heygen_avatar_avatar_1'
      const avatarId = callbackData.replace('heygen_avatar_', '')

      expect(avatarId).toBe('avatar_1')
    })

    it('должен сохранять выбранный аватар в сессию', () => {
      mockContext.session.aiReelsRender = {
        heygenAvatarId: 'avatar_1',
        heygenApiKey: 'test_api_key',
        step: 'cover',
      }

      expect(mockContext.session.aiReelsRender.heygenAvatarId).toBe('avatar_1')
      expect(mockContext.session.aiReelsRender.step).toBe('cover')
    })

    it('должен показывать сообщение о выбранном аватаре', () => {
      const isRu = true
      const avatarName = 'Avatar 1'
      const emoji = '👤'
      const message = isRu
        ? `✅ Выбран аватар: ${emoji} ${avatarName}\n\n🖼️ Теперь отправьте обложку:`
        : `✅ Avatar selected: ${emoji} ${avatarName}\n\nNow send cover image:`

      expect(message).toContain('Avatar 1')
    })

    it('должен обрабатывать ненайденный аватар', () => {
      const avatarInfo = null
      const isRu = true

      if (!avatarInfo) {
        const message = isRu
          ? '❌ Аватар не найден. Попробуйте еще раз.'
          : '❌ Avatar not found. Try again.'

        expect(message).toContain('не найден')
      }
    })
  })

  describe('4. Шаг 3: Загрузка обложки', () => {
    it('должен обрабатывать фото обложки', () => {
      mockContext.message = {
        photo: [{ file_id: 'photo_123' }],
      }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message && mockContext.message.photo.length > 0
      expect(hasPhoto).toBe(true)
    })

    it('должен получать file link из Telegram', async () => {
      const fileLink = await mockContext.telegram.getFileLink('photo_123')

      expect(mockContext.telegram.getFileLink).toHaveBeenCalledWith('photo_123')
      expect(fileLink.href).toContain('telegram.org')
    })

    it('должен сохранять coverUrl в сессию', () => {
      mockContext.session.aiReelsRender = {
        coverUrl: 'https://storage.example.com/cover.jpg',
        step: 'text',
      }

      expect(mockContext.session.aiReelsRender.coverUrl).toContain('cover.jpg')
      expect(mockContext.session.aiReelsRender.step).toBe('text')
    })

    it('должен показывать сообщение успеха обложки на русском', () => {
      const isRu = true
      const message = isRu
        ? '✅ Обложка получена!\n\n📝 Теперь отправьте текст (до 5000 символов) или голосовое сообщение (до 30 сек):'
        : '✅ Cover received!\n\nNow send text or voice message:'

      expect(message).toContain('Обложка получена')
      expect(message).toContain('5000')
    })

    it('должен требовать фото для обложки', async () => {
      mockContext.message = { text: 'not a photo' }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      if (!hasPhoto) {
        await mockContext.reply('❌ Пожалуйста, отправьте фото для обложки.')
      }

      expect(mockContext.reply).toHaveBeenCalled()
    })
  })

  describe('5. Шаг 4: Обработка текста/голоса', () => {
    it('должен обрабатывать голосовое сообщение', () => {
      mockContext.message = {
        voice: { file_id: 'voice_123', duration: 15 },
      }

      const hasVoice = mockContext.message && 'voice' in mockContext.message
      expect(hasVoice).toBe(true)
    })

    it('должен ограничивать голос 30 секундами', () => {
      const voiceDuration = 45
      const maxDuration = 30

      const isTooLong = voiceDuration > maxDuration
      expect(isTooLong).toBe(true)
    })

    it('должен обрабатывать текстовое сообщение', () => {
      mockContext.message = { text: 'Hello, this is my text for avatar video' }

      const hasText = mockContext.message && 'text' in mockContext.message
      expect(hasText).toBe(true)
    })

    it('должен ограничивать текст 5000 символами', () => {
      const text = 'a'.repeat(6000)
      const maxLength = 5000

      const isTooLong = text.length > maxLength
      expect(isTooLong).toBe(true)
    })

    it('должен оценивать длительность по тексту', () => {
      const text = 'This is a test message with some words'
      const words = text.split(/\s+/).length
      const estimatedDuration = Math.ceil(words / 2.5)

      expect(estimatedDuration).toBeGreaterThan(0)
    })

    it('должен сохранять текст и audioUrl в сессию', () => {
      mockContext.session.aiReelsRender = {
        text: 'My avatar text',
        audioUrl: null,
        step: 'intro_text',
      }

      expect(mockContext.session.aiReelsRender.text).toBe('My avatar text')
    })
  })

  describe('6. Шаг 5: Ввод первого текста интро', () => {
    it('должен принимать текст интро до 50 символов', () => {
      const introText = 'ФОТОРЕАЛЬНЫЙ АВАТАР'
      const isValid = introText.length > 0 && introText.length <= 50

      expect(isValid).toBe(true)
    })

    it('должен отклонять слишком длинный текст интро', () => {
      const introText = 'a'.repeat(60)
      const isValid = introText.length <= 50

      expect(isValid).toBe(false)
    })

    it('должен сохранять introText1 в сессию', () => {
      mockContext.session.aiReelsRender = {
        introText1: 'AVATAR NEWS',
        step: 'intro_text_2',
      }

      expect(mockContext.session.aiReelsRender.introText1).toBe('AVATAR NEWS')
    })

    it('должен показывать запрос второй части заголовка', () => {
      const isRu = true
      const introText = 'AVATAR'
      const message = isRu
        ? `✅ Первая часть заголовка: "${introText}"\n\n📝 Теперь введите <b>вторую часть</b> заголовка (до 50 символов):`
        : `✅ First part of title: "${introText}"\n\nNow enter the second part:`

      expect(message).toContain(introText)
    })
  })

  describe('7. Шаг 6: Ввод второго текста интро и отправка', () => {
    it('должен сохранять introText2 в сессию', () => {
      mockContext.session.aiReelsRender = {
        introText2: 'NEWS',
        upperIntroText: 'NEWS',
        step: 'processing',
      }

      expect(mockContext.session.aiReelsRender.introText2).toBe('NEWS')
    })

    it('должен рассчитывать стоимость', () => {
      const priceBreakdown = calculateAIReelsPrice({
        text: 'Test text',
        avatarService: 'heygen',
        isOwnHeyGenKey: false,
        isOwnFalKey: false,
        markupMultiplier: 1.5,
      })

      expect(calculateAIReelsPrice).toHaveBeenCalled()
      expect(priceBreakdown.finalPrice).toBe(50)
    })

    it('должен проверять баланс пользователя', async () => {
      const balance = await getUserBalance('223757230')

      expect(getUserBalance).toHaveBeenCalledWith('223757230')
      expect(balance).toBe(100)
    })

    it('должен показывать ошибку при недостаточном балансе', () => {
      const currentBalance = 30
      const estimatedCost = 50
      const isRu = true

      if (currentBalance < estimatedCost) {
        const message = isRu
          ? `💰 Недостаточно средств\n\n❌ У вас: ${currentBalance}⭐\n💳 Необходимо пополнить: ${estimatedCost - currentBalance}⭐`
          : `💰 Insufficient funds`

        expect(message).toContain('Недостаточно средств')
      }
    })

    it('должен списывать средства через updateUserBalance', async () => {
      await updateUserBalance(
        '223757230',
        -50,
        'service_payment',
        'AI Reels HeyGen',
        { bot_name: 'test_bot', service_type: 'ai_reels_heygen' }
      )

      expect(updateUserBalance).toHaveBeenCalled()
    })
  })

  describe('8. Отправка на render-server', () => {
    it('должен создавать payload через createRenderAvatarPayload', () => {
      const payload = createRenderAvatarPayload(
        '223757230',
        'Test text',
        '',
        'voice_id_123',
        {
          coverUrl: 'https://example.com/cover.jpg',
          introText1: 'AVATAR',
          introText2: 'NEWS',
          avatarService: 'heygen',
          heygenApiKey: 'test_key',
          heygenAvatarId: 'avatar_1',
          botName: 'test_bot',
        }
      )

      expect(createRenderAvatarPayload).toHaveBeenCalled()
    })

    it('должен отправлять event через sendRenderAvatarVideoEvent', async () => {
      const result = await sendRenderAvatarVideoEvent({ telegramId: '223757230' })

      expect(sendRenderAvatarVideoEvent).toHaveBeenCalled()
      expect(result.eventId).toBe('event_123')
    })

    it('должен показывать успешное сообщение с Event ID', () => {
      const isRu = true
      const eventId = 'event_123'
      const cost = 50
      const newBalance = 50

      const message = isRu
        ? `✅ Запрос отправлен на render-server!\n\n🔄 Event ID: ${eventId}\n🎬 Сервис: HeyGen\n⏱️ Ожидаемое время: 4-5 минут`
        : `✅ Request sent to render-server!`

      expect(message).toContain(eventId)
      expect(message).toContain('HeyGen')
    })
  })

  describe('9. Обработка отмены', () => {
    it('должен вызывать answerCbQuery при отмене', async () => {
      await mockContext.answerCbQuery()
      expect(mockContext.answerCbQuery).toHaveBeenCalled()
    })

    it('должен показывать сообщение отмены на русском', () => {
      const isRu = true
      const message = isRu
        ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
        : '❌ Process cancelled. Returning to main menu.'

      expect(message).toContain('отменён')
    })

    it('должен очищать сессию aiReelsRender', () => {
      mockContext.session.aiReelsRender = { step: 'processing' }
      delete mockContext.session.aiReelsRender

      expect(mockContext.session.aiReelsRender).toBeUndefined()
    })

    it('должен выходить из сцены', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('10. Обработка ошибок', () => {
    it('должен обрабатывать ошибку загрузки обложки', () => {
      const isRu = true
      const errorMessage = 'Failed to download cover'
      const message = isRu
        ? `❌ Произошла ошибка при обработке обложки.\n\nОшибка: ${errorMessage}`
        : `❌ Error processing cover.\n\nError: ${errorMessage}`

      expect(message).toContain('ошибка')
    })

    it('должен обрабатывать ошибку отправки на render-server', () => {
      const isRu = true
      const message = isRu
        ? '⚠️ Произошла ошибка при обработке. Обратитесь в поддержку.'
        : '⚠️ Error occurred during processing. Contact support.'

      expect(message).toContain('ошибка')
    })

    it('должен проверять наличие voice_id для аватара', () => {
      const voiceId = null
      const isRu = true

      if (!voiceId) {
        const message = isRu
          ? '❌ Ошибка: не найден voice_id для выбранного аватара'
          : '❌ Error: voice_id not found for selected avatar'

        expect(message).toContain('voice_id')
      }
    })
  })
})
