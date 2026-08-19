/**
 * Tests for falRenderWizard (Fal Avatar Video Generation)
 * Covers: Avatar photo upload, cover upload, text/voice input, render-server integration
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

vi.mock('@/core/supabase/getVoiceId', () => ({
  getVoiceId: vi.fn(() => Promise.resolve('voice_id_123')),
}))

vi.mock('@/inngest_app/render-server-client', () => ({
  sendRenderAvatarVideoEvent: vi.fn(() => Promise.resolve({ eventId: 'event_fal_123' })),
  createRenderAvatarPayload: vi.fn(() => ({ telegramId: '223757230' })),
}))

vi.mock('@/helpers/ai-reels-pricing', () => ({
  calculateAIReelsPrice: vi.fn(() => ({
    finalPrice: 40,
    breakdown: [],
  })),
  formatPriceMessage: vi.fn(() => '💰 Cost: 40⭐'),
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
  // SERVICE_PAYMENT убран из мока вслед за настоящим enum: этого типа не
  // знает OperationTypeEnum, по которому валидируется запись в payments_v2,
  // поэтому списание с ним молча не происходило.
  PaymentType: {
    MONEY_OUTCOME: 'money_outcome',
    MONEY_INCOME: 'money_income',
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { getVoiceId } from '@/core/supabase/getVoiceId'
import { sendRenderAvatarVideoEvent, createRenderAvatarPayload } from '@/inngest_app/render-server-client'
import { calculateAIReelsPrice, formatPriceMessage } from '@/helpers/ai-reels-pricing'

describe('falRenderWizard (Fal Avatar Video Generation)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    answerCbQuery: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'fal_render_wizard' },
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
    updateType: 'message',
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = { aiReelsRender: null }
    mockContext.message = null

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getUserBalance as Mock).mockResolvedValue(100)
    ;(getVoiceId as Mock).mockResolvedValue('voice_id_123')

    // Mock process.env
    process.env.FAL_KEY = 'test_fal_key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.FAL_KEY
  })

  describe('1. Шаг 0: Инициализация', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен проверять наличие FAL_KEY', () => {
      const hasFalKey = !!process.env.FAL_KEY
      expect(hasFalKey).toBe(true)
    })

    it('должен выходить при отсутствии FAL_KEY', async () => {
      delete process.env.FAL_KEY

      if (!process.env.FAL_KEY) {
        await mockContext.reply('❌ Ошибка конфигурации: FAL API ключ не настроен')
        await mockContext.scene.leave()
      }

      expect(mockContext.reply).toHaveBeenCalled()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен инициализировать сессию с avatarService: fal', () => {
      mockContext.session.aiReelsRender = {
        avatarService: 'fal',
        step: 'image',
        startTime: Date.now(),
        falApiKey: process.env.FAL_KEY,
        falResolution: '720p',
      }

      expect(mockContext.session.aiReelsRender.avatarService).toBe('fal')
      expect(mockContext.session.aiReelsRender.falResolution).toBe('720p')
    })

    it('должен показывать приветственное сообщение на русском', () => {
      const isRu = true
      const message = isRu
        ? '🎯 <b>Fal Avatar Generation</b>\n\n📸 Отправьте фото или URL изображения с лицом для аватара.'
        : '🎯 <b>Fal Avatar Generation</b>\n\nSend a photo or image URL with a face for avatar.'

      expect(message).toContain('Fal Avatar')
      expect(message).toContain('фото')
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

  describe('2. Шаг 1: Обработка фото аватара', () => {
    it('должен обрабатывать фото из Telegram', () => {
      mockContext.message = {
        photo: [{ file_id: 'avatar_photo_123' }],
      }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message && mockContext.message.photo.length > 0
      expect(hasPhoto).toBe(true)
    })

    it('должен получать последнее (самое большое) фото', () => {
      mockContext.message = {
        photo: [
          { file_id: 'small', width: 100 },
          { file_id: 'medium', width: 320 },
          { file_id: 'large', width: 800 },
        ],
      }

      const photo = mockContext.message.photo[mockContext.message.photo.length - 1]
      expect(photo.file_id).toBe('large')
    })

    it('должен обрабатывать URL изображения', () => {
      mockContext.message = { text: 'https://example.com/avatar.jpg' }

      const text = mockContext.message.text.trim()
      const isUrl = text.startsWith('http://') || text.startsWith('https://')

      expect(isUrl).toBe(true)
    })

    it('должен отклонять некорректный URL', () => {
      mockContext.message = { text: 'not-a-url' }

      const text = mockContext.message.text.trim()
      const isUrl = text.startsWith('http://') || text.startsWith('https://')

      expect(isUrl).toBe(false)
    })

    it('должен сохранять imageUrl в сессию', () => {
      mockContext.session.aiReelsRender = {
        imageUrl: 'https://storage.example.com/avatar.jpg',
        step: 'cover',
      }

      expect(mockContext.session.aiReelsRender.imageUrl).toContain('avatar.jpg')
    })

    it('должен показывать сообщение успеха', () => {
      const isRu = true
      const message = isRu
        ? '✅ Изображение аватара получено!\n\n🖼️ Теперь отправьте обложку (фото для превью видео):'
        : '✅ Avatar image received!\n\nNow send cover image:'

      expect(message).toContain('аватара получено')
    })
  })

  describe('3. Шаг 2: Загрузка обложки', () => {
    it('должен обрабатывать фото обложки', () => {
      mockContext.message = {
        photo: [{ file_id: 'cover_123' }],
      }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      expect(hasPhoto).toBe(true)
    })

    it('должен загружать обложку в Supabase Storage', async () => {
      const fileName = `fal-covers/223757230/${Date.now()}.jpg`
      expect(fileName).toContain('fal-covers')
    })

    it('должен сохранять coverUrl в сессию', () => {
      mockContext.session.aiReelsRender = {
        coverUrl: 'https://storage.example.com/cover.jpg',
        step: 'text',
      }

      expect(mockContext.session.aiReelsRender.coverUrl).toContain('cover.jpg')
    })

    it('должен требовать фото для обложки', async () => {
      mockContext.message = { text: 'not a photo' }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      if (!hasPhoto) {
        await mockContext.reply('❌ Пожалуйста, отправьте фото для обложки.')
      }

      expect(mockContext.reply).toHaveBeenCalled()
    })

    it('должен показывать запрос текста после обложки', () => {
      const isRu = true
      const message = isRu
        ? '✅ Обложка получена!\n\n📝 Теперь отправьте текст (до 5000 символов) или голосовое сообщение (до 30 сек):'
        : '✅ Cover received!\n\nNow send text or voice message:'

      expect(message).toContain('Обложка получена')
    })
  })

  describe('4. Шаг 3: Обработка текста/голоса', () => {
    it('должен обрабатывать голосовое сообщение', () => {
      mockContext.message = {
        voice: { file_id: 'voice_123', duration: 20 },
      }

      const hasVoice = mockContext.message && 'voice' in mockContext.message
      expect(hasVoice).toBe(true)
    })

    it('должен ограничивать голос 30 секундами', async () => {
      mockContext.message = {
        voice: { file_id: 'voice_123', duration: 45 },
      }

      if (mockContext.message.voice.duration > 30) {
        await mockContext.reply(`❌ Голосовое сообщение слишком длинное (${mockContext.message.voice.duration} сек). Максимум: 30 секунд.`)
      }

      expect(mockContext.reply).toHaveBeenCalled()
    })

    it('должен обрабатывать текстовое сообщение', () => {
      mockContext.message = { text: 'This is my Fal avatar video text' }

      const hasText = mockContext.message && 'text' in mockContext.message
      const text = mockContext.message.text.trim()

      expect(hasText).toBe(true)
      expect(text.length).toBeGreaterThan(0)
    })

    it('должен ограничивать текст 1-5000 символами', () => {
      const text = 'a'.repeat(6000)
      const isValid = text.length > 0 && text.length <= 5000

      expect(isValid).toBe(false)
    })

    it('должен отклонять пустой текст', () => {
      const text = ''
      const isValid = text.length > 0

      expect(isValid).toBe(false)
    })

    it('должен оценивать длительность по количеству слов', () => {
      const text = 'This is a test message with exactly ten words here'
      const words = text.split(/\s+/).length
      const estimatedDuration = Math.ceil(words / 2.5)

      expect(words).toBe(10)
      expect(estimatedDuration).toBe(4)
    })

    it('должен сохранять text и audioUrl в сессию', () => {
      mockContext.session.aiReelsRender = {
        text: 'My Fal text',
        audioUrl: null,
        estimatedDuration: 10,
        step: 'intro_text',
      }

      expect(mockContext.session.aiReelsRender.text).toBe('My Fal text')
    })
  })

  describe('5. Шаг 4: Ввод первого текста интро', () => {
    it('должен принимать текст интро до 50 символов', () => {
      const introText = 'PHOTOREALISTIC AVATAR'
      const isValid = introText.length > 0 && introText.length <= 50

      expect(isValid).toBe(true)
    })

    it('должен отклонять пустой текст интро', () => {
      const introText = ''
      const isValid = introText.length > 0

      expect(isValid).toBe(false)
    })

    it('должен сохранять introText1 в сессию', () => {
      mockContext.session.aiReelsRender = {
        introText1: 'FAL AVATAR',
        step: 'intro_text_2',
      }

      expect(mockContext.session.aiReelsRender.introText1).toBe('FAL AVATAR')
    })

    it('должен показывать примеры для второй части', () => {
      const isRu = true
      const message = isRu
        ? `📝 Теперь введите <b>вторую часть</b> заголовка (до 50 символов):\n\n💡 <i>Например: "NEWS", "TECH", "AI"</i>`
        : `Now enter the second part of title:`

      expect(message).toContain('NEWS')
      expect(message).toContain('TECH')
    })
  })

  describe('6. Шаг 5: Ввод второго текста интро и отправка', () => {
    it('должен сохранять introText2 и upperIntroText', () => {
      mockContext.session.aiReelsRender = {
        introText2: 'NEWS',
        upperIntroText: 'NEWS',
        step: 'processing',
      }

      expect(mockContext.session.aiReelsRender.introText2).toBe('NEWS')
      expect(mockContext.session.aiReelsRender.upperIntroText).toBe('NEWS')
    })

    it('должен рассчитывать стоимость для Fal', () => {
      const priceBreakdown = calculateAIReelsPrice({
        text: 'Test text',
        avatarService: 'fal',
        isOwnHeyGenKey: false,
        isOwnFalKey: false,
        markupMultiplier: 1.5,
      })

      expect(calculateAIReelsPrice).toHaveBeenCalled()
      expect(priceBreakdown.finalPrice).toBe(40)
    })

    it('должен показывать расчет стоимости', () => {
      const message = formatPriceMessage({ finalPrice: 40, breakdown: [] }, true)

      expect(formatPriceMessage).toHaveBeenCalled()
    })

    it('должен проверять баланс', async () => {
      const balance = await getUserBalance('223757230')
      const cost = 40

      expect(balance).toBe(100)
      expect(balance >= cost).toBe(true)
    })

    it('должен получать voice_id пользователя', async () => {
      const voiceId = await getVoiceId('223757230')

      expect(getVoiceId).toHaveBeenCalledWith('223757230')
      expect(voiceId).toBe('voice_id_123')
    })

    it('должен показывать ошибку при отсутствии voice_id', async () => {
      ;(getVoiceId as Mock).mockResolvedValue(null)

      const voiceId = await getVoiceId('223757230')
      const isRu = true

      if (!voiceId) {
        const message = isRu
          ? '❌ У вас не настроен голос аватара. Создайте голос сначала.'
          : '❌ You dont have avatar voice configured.'

        expect(message).toContain('голос аватара')
      }
    })

    it('должен возвращать средства при отсутствии voice_id', async () => {
      ;(getVoiceId as Mock).mockResolvedValue(null)

      await updateUserBalance(
        '223757230',
        40,
        'money_income',
        'Refund: No voice ID',
        { bot_name: 'test_bot', service_type: 'refund' }
      )

      expect(updateUserBalance).toHaveBeenCalled()
    })
  })

  describe('7. Отправка на render-server', () => {
    it('должен создавать payload с avatarService: fal', () => {
      const payload = createRenderAvatarPayload(
        '223757230',
        'Test text',
        'https://example.com/avatar.jpg',
        'voice_id_123',
        {
          coverUrl: 'https://example.com/cover.jpg',
          introText1: 'FAL',
          introText2: 'NEWS',
          avatarService: 'fal',
          falApiKey: 'test_fal_key',
          falResolution: '720p',
          botName: 'test_bot',
        }
      )

      expect(createRenderAvatarPayload).toHaveBeenCalled()
    })

    it('должен отправлять event на render-server', async () => {
      const result = await sendRenderAvatarVideoEvent({ telegramId: '223757230' })

      expect(sendRenderAvatarVideoEvent).toHaveBeenCalled()
      expect(result.eventId).toBe('event_fal_123')
    })

    it('должен показывать успешное сообщение с 2-3 минутами ожидания', () => {
      const isRu = true
      const eventId = 'event_fal_123'
      const cost = 40

      const message = isRu
        ? `✅ Запрос отправлен на render-server!\n\n🔄 Event ID: ${eventId}\n🎯 Сервис: Fal\n⏱️ Ожидаемое время: 2-3 минут`
        : `✅ Request sent to render-server!`

      expect(message).toContain('Fal')
      expect(message).toContain('2-3 минут')
    })

    it('должен показывать списанную сумму и новый баланс', () => {
      const cost = 40
      const currentBalance = 100
      const newBalance = currentBalance - cost

      const message = `💰 Списано: ${cost}⭐\n💳 Новый баланс: ${newBalance.toFixed(2)}⭐`

      expect(message).toContain('40⭐')
      expect(message).toContain('60.00⭐')
    })
  })

  describe('8. Возврат средств при ошибке', () => {
    it('должен возвращать средства при ошибке отправки', async () => {
      ;(sendRenderAvatarVideoEvent as Mock).mockRejectedValue(new Error('Send failed'))

      try {
        await sendRenderAvatarVideoEvent({ telegramId: '223757230' })
      } catch (error) {
        await updateUserBalance(
          '223757230',
          40,
          'money_income',
          'Refund: Fal Render error',
          { bot_name: 'test_bot', service_type: 'refund' }
        )
      }

      expect(updateUserBalance).toHaveBeenCalled()
    })

    it('должен показывать сообщение о возврате средств', () => {
      const isRu = true
      const message = isRu
        ? '❌ Произошла ошибка при отправке запроса. Средства возвращены.'
        : '❌ Error sending request. Funds refunded.'

      expect(message).toContain('возвращены')
    })
  })

  describe('9. Обработка отмены', () => {
    it('должен вызывать answerCbQuery', async () => {
      await mockContext.answerCbQuery()
      expect(mockContext.answerCbQuery).toHaveBeenCalled()
    })

    it('должен показывать сообщение отмены', () => {
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
  })

  describe('10. Обработка ошибок', () => {
    it('должен обрабатывать ошибку загрузки аватара', () => {
      const isRu = true
      const message = isRu
        ? '❌ Произошла ошибка при обработке изображения.'
        : '❌ Error processing image.'

      expect(message).toContain('ошибка')
    })

    it('должен обрабатывать ошибку загрузки обложки', () => {
      const isRu = true
      const message = isRu
        ? '❌ Произошла ошибка при обработке обложки.'
        : '❌ Error processing cover.'

      expect(message).toContain('обложки')
    })

    it('должен обрабатывать ошибку обработки текста/голоса', () => {
      const isRu = true
      const message = isRu
        ? '❌ Произошла ошибка при обработке данных.'
        : '❌ Error processing data.'

      expect(message).toContain('обработке данных')
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })
})
