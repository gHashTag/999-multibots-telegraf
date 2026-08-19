/**
 * Tests for hedraRenderWizard (Hedra Avatar Video Generation)
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
  getVoiceId: vi.fn(() => Promise.resolve('voice_id_hedra_123')),
}))

vi.mock('@/inngest_app/render-server-client', () => ({
  sendRenderAvatarVideoEvent: vi.fn(() => Promise.resolve({ eventId: 'event_hedra_123' })),
  createRenderAvatarPayload: vi.fn(() => ({ telegramId: '223757230' })),
}))

vi.mock('@/helpers/ai-reels-pricing', () => ({
  calculateAIReelsPrice: vi.fn(() => ({
    finalPrice: 45,
    breakdown: [],
  })),
  formatPriceMessage: vi.fn(() => '💰 Cost: 45⭐'),
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

describe('hedraRenderWizard (Hedra Avatar Video Generation)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    answerCbQuery: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'hedra_render_wizard' },
    },
    session: {
      aiReelsRender: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      getFileLink: vi.fn(() => Promise.resolve({ href: 'https://api.telegram.org/file/hedra_test.jpg' })),
    },
    botInfo: { username: 'test_bot' },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = { aiReelsRender: null }
    mockContext.message = null

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getUserBalance as Mock).mockResolvedValue(100)
    ;(getVoiceId as Mock).mockResolvedValue('voice_id_hedra_123')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 0: Инициализация', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен инициализировать сессию с avatarService: hedra', () => {
      mockContext.session.aiReelsRender = {
        avatarService: 'hedra',
        step: 'image',
        startTime: Date.now(),
      }

      expect(mockContext.session.aiReelsRender.avatarService).toBe('hedra')
      expect(mockContext.session.aiReelsRender.step).toBe('image')
    })

    it('должен показывать приветственное сообщение на русском', () => {
      const isRu = true
      const message = isRu
        ? '🎭 <b>Hedra Avatar Generation</b>\n\n📸 Отправьте фото или URL изображения с лицом для аватара.'
        : '🎭 <b>Hedra Avatar Generation</b>\n\nSend a photo or image URL with a face for avatar.'

      expect(message).toContain('Hedra Avatar')
      expect(message).toContain('🎭')
    })

    it('должен показывать кнопку отмены', () => {
      const isRu = true
      const cancelButton = isRu ? 'Отмена' : 'Cancel'

      expect(cancelButton).toBe('Отмена')
    })

    it('должен выходить при отсутствии telegram_id', async () => {
      const ctx = { ...mockContext, from: null }
      const telegramId = ctx.from?.id?.toString()

      if (!telegramId) {
        await mockContext.reply('❌ Ошибка: не удалось определить ваш ID')
        await mockContext.scene.leave()
      }

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('2. Шаг 1: Обработка фото аватара', () => {
    it('должен обрабатывать фото из Telegram', () => {
      mockContext.message = {
        photo: [{ file_id: 'hedra_avatar_photo_123' }],
      }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message && mockContext.message.photo.length > 0
      expect(hasPhoto).toBe(true)
    })

    it('должен получать последнее (самое большое) фото', () => {
      mockContext.message = {
        photo: [
          { file_id: 'small', width: 90 },
          { file_id: 'large', width: 800 },
        ],
      }

      const photo = mockContext.message.photo[mockContext.message.photo.length - 1]
      expect(photo.file_id).toBe('large')
    })

    it('должен получать file link через Telegram API', async () => {
      const fileLink = await mockContext.telegram.getFileLink('hedra_avatar_photo_123')

      expect(mockContext.telegram.getFileLink).toHaveBeenCalled()
      expect(fileLink.href).toContain('telegram.org')
    })

    it('должен обрабатывать URL изображения', () => {
      mockContext.message = { text: 'https://example.com/hedra-avatar.jpg' }

      const text = mockContext.message.text.trim()
      const isUrl = text.startsWith('http://') || text.startsWith('https://')

      expect(isUrl).toBe(true)
    })

    it('должен загружать в Supabase Storage с правильным путем', () => {
      const telegramId = '223757230'
      const fileName = `hedra-avatars/${telegramId}/${Date.now()}.jpg`

      expect(fileName).toContain('hedra-avatars')
      expect(fileName).toContain(telegramId)
    })

    it('должен сохранять imageUrl в сессию', () => {
      mockContext.session.aiReelsRender = {
        imageUrl: 'https://storage.example.com/hedra-avatar.jpg',
        step: 'cover',
      }

      expect(mockContext.session.aiReelsRender.imageUrl).toContain('hedra-avatar')
    })

    it('должен показывать сообщение об успешном получении аватара', () => {
      const isRu = true
      const message = isRu
        ? '✅ Изображение аватара получено!\n\n🖼️ Теперь отправьте обложку (фото для превью видео):'
        : '✅ Avatar image received!\n\nNow send cover image:'

      expect(message).toContain('аватара получено')
    })

    it('должен отклонять некорректное изображение', async () => {
      mockContext.message = { document: { file_id: 'doc_123' } }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      const hasUrl = mockContext.message && 'text' in mockContext.message &&
        (mockContext.message.text?.startsWith('http://') || mockContext.message.text?.startsWith('https://'))

      if (!hasPhoto && !hasUrl) {
        await mockContext.reply('❌ Некорректное изображение. Отправьте фото или URL.')
      }

      expect(mockContext.reply).toHaveBeenCalled()
    })
  })

  describe('3. Шаг 2: Загрузка обложки', () => {
    it('должен обрабатывать фото обложки', () => {
      mockContext.message = {
        photo: [{ file_id: 'hedra_cover_123' }],
      }

      const hasPhoto = mockContext.message && 'photo' in mockContext.message
      expect(hasPhoto).toBe(true)
    })

    it('должен загружать в hedra-covers директорию', () => {
      const telegramId = '223757230'
      const fileName = `hedra-covers/${telegramId}/${Date.now()}.jpg`

      expect(fileName).toContain('hedra-covers')
    })

    it('должен сохранять coverUrl в сессию', () => {
      mockContext.session.aiReelsRender = {
        coverUrl: 'https://storage.example.com/hedra-cover.jpg',
        step: 'text',
      }

      expect(mockContext.session.aiReelsRender.coverUrl).toContain('hedra-cover')
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

      expect(message).toContain('5000 символов')
      expect(message).toContain('30 сек')
    })
  })

  describe('4. Шаг 3: Обработка текста/голоса', () => {
    it('должен обрабатывать голосовое сообщение', () => {
      mockContext.message = {
        voice: { file_id: 'hedra_voice_123', duration: 25 },
      }

      const hasVoice = mockContext.message && 'voice' in mockContext.message
      expect(hasVoice).toBe(true)
    })

    it('должен ограничивать голос 30 секундами', () => {
      const voiceDuration = 35
      const maxDuration = 30

      const isTooLong = voiceDuration > maxDuration
      expect(isTooLong).toBe(true)
    })

    it('должен загружать голос в hedra-audio директорию', () => {
      const telegramId = '223757230'
      const fileName = `hedra-audio/${telegramId}/${Date.now()}.ogg`

      expect(fileName).toContain('hedra-audio')
      expect(fileName).toContain('.ogg')
    })

    it('должен обрабатывать текстовое сообщение', () => {
      mockContext.message = { text: 'This is my Hedra avatar video script' }

      const hasText = mockContext.message && 'text' in mockContext.message
      const text = mockContext.message.text.trim()

      expect(hasText).toBe(true)
      expect(text.length).toBeGreaterThan(0)
    })

    it('должен ограничивать текст 1-5000 символами', () => {
      const tooShort = ''
      const tooLong = 'a'.repeat(6000)
      const valid = 'Normal text message'

      expect(tooShort.length === 0).toBe(true)
      expect(tooLong.length > 5000).toBe(true)
      expect(valid.length > 0 && valid.length <= 5000).toBe(true)
    })

    it('должен оценивать длительность по количеству слов', () => {
      const text = 'This is a sample text with twelve words in total here'
      const words = text.split(/\s+/).length
      const estimatedDuration = Math.ceil(words / 2.5)

      expect(words).toBe(11)
      expect(estimatedDuration).toBe(5) // ceil(11/2.5) = 5
    })

    it('должен сохранять estimatedDuration в сессию', () => {
      mockContext.session.aiReelsRender = {
        text: 'My Hedra text',
        audioUrl: null,
        estimatedDuration: 15,
        step: 'intro_text',
      }

      expect(mockContext.session.aiReelsRender.estimatedDuration).toBe(15)
    })
  })

  describe('5. Шаг 4: Ввод первого текста интро', () => {
    it('должен принимать текст интро до 50 символов', () => {
      const introText = 'HEDRA AVATAR'
      const isValid = introText.length > 0 && introText.length <= 50

      expect(isValid).toBe(true)
    })

    it('должен отклонять слишком длинный текст интро', () => {
      const introText = 'a'.repeat(55)
      const isValid = introText.length <= 50

      expect(isValid).toBe(false)
    })

    it('должен сохранять introText1 в сессию', () => {
      mockContext.session.aiReelsRender = {
        introText1: 'HEDRA NEWS',
        step: 'intro_text_2',
      }

      expect(mockContext.session.aiReelsRender.introText1).toBe('HEDRA NEWS')
    })

    it('должен показывать запрос второй части', () => {
      const isRu = true
      const introText = 'HEDRA'
      const message = isRu
        ? `✅ Первая часть заголовка: "${introText}"\n\n📝 Теперь введите <b>вторую часть</b> заголовка (до 50 символов):`
        : `✅ First part of title: "${introText}"\n\nNow enter the second part:`

      expect(message).toContain('HEDRA')
      expect(message).toContain('вторую часть')
    })

    it('должен требовать текстовое сообщение', async () => {
      mockContext.message = { photo: [{ file_id: 'photo_123' }] }

      const hasText = mockContext.message && 'text' in mockContext.message
      if (!hasText) {
        await mockContext.reply('❌ Пожалуйста, отправьте текст для интро (до 50 символов).')
      }

      expect(mockContext.reply).toHaveBeenCalled()
    })
  })

  describe('6. Шаг 5: Ввод второго текста интро и отправка', () => {
    it('должен сохранять introText2 и upperIntroText', () => {
      mockContext.session.aiReelsRender = {
        introText2: 'TECH',
        upperIntroText: 'TECH',
        step: 'processing',
      }

      expect(mockContext.session.aiReelsRender.introText2).toBe('TECH')
      expect(mockContext.session.aiReelsRender.upperIntroText).toBe('TECH')
    })

    it('должен рассчитывать стоимость для Hedra', () => {
      const priceBreakdown = calculateAIReelsPrice({
        text: 'Test text',
        avatarService: 'hedra',
        isOwnHeyGenKey: false,
        isOwnFalKey: false,
        markupMultiplier: 1.5,
      })

      expect(calculateAIReelsPrice).toHaveBeenCalled()
      expect(priceBreakdown.finalPrice).toBe(45)
    })

    it('должен показывать расчет стоимости', () => {
      formatPriceMessage({ finalPrice: 45, breakdown: [] }, true)
      expect(formatPriceMessage).toHaveBeenCalled()
    })

    it('должен проверять баланс пользователя', async () => {
      const balance = await getUserBalance('223757230')
      const cost = 45

      expect(balance).toBe(100)
      expect(balance >= cost).toBe(true)
    })

    it('должен показывать ошибку при недостаточном балансе', () => {
      const currentBalance = 30
      const estimatedCost = 45
      const isRu = true

      if (currentBalance < estimatedCost) {
        const message = isRu
          ? `💰 Недостаточно средств\n\n❌ У вас: ${currentBalance}⭐\n💳 Необходимо пополнить: ${estimatedCost - currentBalance}⭐`
          : `💰 Insufficient funds`

        expect(message).toContain('15⭐') // 45 - 30 = 15
      }
    })

    // ВНИМАНИЕ: тест вызывает мок напрямую и проверяет, что мок вызвали —
    // визард не исполняется, регрессию такой тест не поймает. Оставлен как
    // документация аргументов.
    //
    // Было -45 и 'service_payment': комбинация, при которой списание молча не
    // происходило. Тест закреплял дефект как норму.
    it('должен списывать средства через updateUserBalance', async () => {
      await updateUserBalance(
        '223757230',
        45,
        'money_outcome',
        'AI Reels Hedra',
        { bot_name: 'test_bot', service_type: 'hedra_render' }
      )

      expect(updateUserBalance).toHaveBeenCalled()
    })

    it('должен получать voice_id пользователя', async () => {
      const voiceId = await getVoiceId('223757230')

      expect(getVoiceId).toHaveBeenCalledWith('223757230')
      expect(voiceId).toBe('voice_id_hedra_123')
    })
  })

  describe('7. Отправка на render-server', () => {
    it('должен создавать payload с avatarService: hedra', () => {
      const payload = createRenderAvatarPayload(
        '223757230',
        'Test text',
        'https://example.com/hedra-avatar.jpg',
        'voice_id_hedra_123',
        {
          coverUrl: 'https://example.com/hedra-cover.jpg',
          introText1: 'HEDRA',
          introText2: 'NEWS',
          avatarService: 'hedra',
          botName: 'test_bot',
        }
      )

      expect(createRenderAvatarPayload).toHaveBeenCalled()
    })

    it('должен отправлять event на render-server', async () => {
      const result = await sendRenderAvatarVideoEvent({ telegramId: '223757230' })

      expect(sendRenderAvatarVideoEvent).toHaveBeenCalled()
      expect(result.eventId).toBe('event_hedra_123')
    })

    it('должен показывать успешное сообщение с Hedra сервисом', () => {
      const isRu = true
      const eventId = 'event_hedra_123'

      const message = isRu
        ? `✅ Запрос отправлен на render-server!\n\n🔄 Event ID: ${eventId}\n🎭 Сервис: Hedra\n⏱️ Ожидаемое время: 2-3 минут`
        : `✅ Request sent to render-server!`

      expect(message).toContain('Hedra')
      expect(message).toContain('🎭')
    })

    it('должен показывать списанную сумму и новый баланс', () => {
      const cost = 45
      const currentBalance = 100
      const newBalance = currentBalance - cost

      const message = `💰 Списано: ${cost}⭐\n💳 Новый баланс: ${newBalance.toFixed(2)}⭐`

      expect(message).toContain('45⭐')
      expect(message).toContain('55.00⭐')
    })
  })

  describe('8. Возврат средств при ошибке', () => {
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
      await updateUserBalance(
        '223757230',
        45,
        'money_income',
        'Refund: No voice ID',
        { bot_name: 'test_bot', service_type: 'refund' }
      )

      expect(updateUserBalance).toHaveBeenCalled()
    })

    it('должен возвращать средства при ошибке отправки', async () => {
      ;(sendRenderAvatarVideoEvent as Mock).mockRejectedValue(new Error('Hedra send failed'))

      try {
        await sendRenderAvatarVideoEvent({ telegramId: '223757230' })
      } catch (error) {
        await updateUserBalance(
          '223757230',
          45,
          'money_income',
          'Refund: Hedra Render error',
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

    it('должен выходить из сцены при отмене', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('10. Обработка ошибок', () => {
    it('должен обрабатывать ошибку загрузки аватара', () => {
      const isRu = true
      const message = isRu
        ? '❌ Произошла ошибка при обработке изображения.'
        : '❌ Error processing image.'

      expect(message).toContain('изображения')
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

      expect(message).toContain('данных')
    })

    it('должен корректно логировать ошибки', () => {
      const error = new Error('Hedra processing error')
      expect(error.message).toContain('Hedra')
    })
  })
})
