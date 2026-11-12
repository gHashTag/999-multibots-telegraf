/**
 * Tests for generateNeuroPhotoDirect service
 * Covers: kie.ai generation (the one provider, owner's kie-only rule
 * 2026-10-02), payment processing, idempotency, refunds
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { ModeEnum } from '../../interfaces/modes'
import type { MutableCtx } from '../helpers/mutableContext'

// Mock all dependencies BEFORE importing the module under test.
// The fal/Replicate mocks that used to live here are gone with the providers
// themselves: generation goes through kie.ai and nothing else.

vi.mock('../../services/generateNeuroPhotoKie', () => ({
  generateNeuroPhotoViaKie: vi.fn(),
}))

vi.mock('../../core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
  getUserByTelegramId: vi.fn(),
  updateUserLevelPlusOne: vi.fn(),
  savePromptDirect: vi.fn(),
}))

vi.mock('../../core/supabase/ai', () => ({
  getAspectRatio: vi.fn(),
}))

vi.mock('../../core/supabase/directPayment', () => ({
  directPaymentProcessor: vi.fn(),
}))

vi.mock('../../core/bot', () => ({
  getBotByName: vi.fn(),
}))

vi.mock('../../price/helpers/modelsCost', () => ({
  calculateModeCost: vi.fn(),
}))

vi.mock('../../helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(),
}))

vi.mock('../../helpers/saveFileLocally', () => ({
  saveFileLocally: vi.fn(),
}))

vi.mock('../../helpers/pulse', () => ({
  sendMediaToPulse: vi.fn(),
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import mocked modules
import { generateNeuroPhotoViaKie } from '../../services/generateNeuroPhotoKie'
import { getUserByTelegramId, savePromptDirect } from '../../core/supabase'
import { getAspectRatio } from '../../core/supabase/ai'
import { directPaymentProcessor } from '../../core/supabase/directPayment'
import { getBotByName } from '../../core/bot'
import { calculateModeCost } from '../../price/helpers/modelsCost'
import { isRussianFromState } from '../../helpers/centralizedLanguage'
import { saveFileLocally } from '../../helpers/saveFileLocally'
import { sendMediaToPulse } from '../../helpers/pulse'
import { generateNeuroPhotoDirect } from '../../services/generateNeuroPhotoDirect'
import { MyContext } from '../../interfaces'

const KIE_URL = 'https://kie.example/generated-image.jpg'

describe('generateNeuroPhotoDirect', () => {
  let mockContext: MutableCtx
  let mockBot: any
  let mockTelegram: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock Telegram API
    mockTelegram = {
      sendMessage: vi.fn().mockResolvedValue({}),
      sendPhoto: vi.fn().mockResolvedValue({}),
    }

    // Setup mock bot
    mockBot = {
      telegram: mockTelegram,
    }

    // Setup mock context
    mockContext = {
      // Сервис отправляет через ctx.telegram (переход с getBotByName),
      // поэтому мок должен висеть на контексте, а не только на mockBot.
      telegram: mockTelegram,
      from: { id: 144022504, username: 'testuser' },
      session: {
        userModel: {
          id: 'test_model',
          model_url: 'https://example.com/model.safetensors',
          api: 'fal',
        },
      },
      reply: vi.fn().mockResolvedValue({}),
    } as any

    // Setup default mock returns
    ;(generateNeuroPhotoViaKie as Mock).mockResolvedValue(KIE_URL)
    ;(getBotByName as Mock).mockReturnValue({ bot: mockBot, error: null })
    ;(getUserByTelegramId as Mock).mockResolvedValue({
      id: 'user-uuid',
      telegram_id: '144022504',
      level: 1,
      balance: 1000,
    })
    ;(calculateModeCost as Mock).mockReturnValue({ stars: 7.5 })
    ;(directPaymentProcessor as Mock).mockResolvedValue({ success: true })
    ;(getAspectRatio as Mock).mockResolvedValue('1:1')
    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(saveFileLocally as Mock).mockResolvedValue('/local/path/image.jpg')
    ;(sendMediaToPulse as Mock).mockResolvedValue(undefined)
    ;(savePromptDirect as Mock).mockResolvedValue(undefined)
  })

  describe('1. Успешная генерация через kie.ai', () => {
    it('должна генерировать изображение через kie.ai с промптом и аспектом', async () => {
      const result = await generateNeuroPhotoDirect(
        'Beautiful sunset over mountains',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(result).toBeDefined()
      expect(result?.success).toBe(true)
      expect(result?.urls).toHaveLength(1)
      expect(result?.urls?.[0]).toBe(KIE_URL)

      // Verify kie.ai was called with the prompt and the resolved ratio
      expect(generateNeuroPhotoViaKie).toHaveBeenCalledWith(
        'Beautiful sunset over mountains',
        '1:1'
      )
    })

    it('должна сохранять промпт с провайдером kie', async () => {
      await generateNeuroPhotoDirect(
        'Beautiful sunset over mountains',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(savePromptDirect).toHaveBeenCalledWith(
        'Beautiful sunset over mountains',
        'kie',
        ModeEnum.NeuroPhoto,
        KIE_URL,
        '144022504',
        'success'
      )
    })
  })

  describe('2. Один провайдер — kie-only, без фоллбэка', () => {
    it('при ошибке kie.ai делает возврат и НЕ уходит в другой провайдер', async () => {
      ;(generateNeuroPhotoViaKie as Mock).mockRejectedValue(
        new Error('kie.ai neurophoto job failed')
      )

      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      // No image was delivered, so the run reports failure...
      expect(result?.success).toBe(false)
      expect(result?.data).toBe('API returned no images')

      // ...the charge happened first, then the refund for the failed image
      const paymentTypes = (directPaymentProcessor as Mock).mock.calls.map(
        ([arg]) => arg.type
      )
      expect(paymentTypes).toContain('MONEY_OUTCOME')
      expect(paymentTypes).toContain('REFUND')
      const refundCall = (directPaymentProcessor as Mock).mock.calls.find(
        ([arg]) => arg.type === 'REFUND'
      )
      expect(refundCall?.[0]).toMatchObject({
        telegram_id: '144022504',
        amount: 7.5,
      })
    })

    it('userModel с api="fal" больше не ведёт на fal — генерация идёт через kie', async () => {
      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true },
        // The legacy fal-trained model used to swap in LoRA weights; kie.ai
        // has no LoRA path, so it must be ignored, not routed to.
        { api: 'fal', model_url: 'https://example.com/model.safetensors' }
      )

      expect(result?.success).toBe(true)
      expect(generateNeuroPhotoViaKie).toHaveBeenCalledTimes(1)
    })
  })

  describe('3. Обработка платежей', () => {
    it('должна списывать звезды за генерацию', async () => {
      await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        2,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(directPaymentProcessor).toHaveBeenCalledWith(
        expect.objectContaining({
          telegram_id: '144022504',
          amount: 15, // 7.5 * 2 images
          type: 'MONEY_OUTCOME',
          service_type: ModeEnum.NeuroPhoto,
        })
      )
    })

    it('должна возвращать ошибку при недостаточном балансе', async () => {
      ;(directPaymentProcessor as Mock).mockResolvedValue({
        success: false,
        error: 'Insufficient balance',
      })

      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(result?.success).toBe(false)
      expect(result?.data).toBe('Payment failed')
    })

    it('должна поддерживать bypass_payment_check', async () => {
      await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true, bypass_payment_check: true }
      )

      expect(directPaymentProcessor).toHaveBeenCalledWith(
        expect.objectContaining({
          bypass_payment_check: true,
        })
      )
    })

    it('НЕ пробрасывает устаревший session bypass (защита от 0-cost, #1335)', async () => {
      // A stale flag left by the AvatarTransform lead magnet (never cleared on
      // cancel) must NOT bypass the balance check on a normal paid run.
      ;(mockContext as any).session.bypass_payment_check = true

      await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true, bypass_payment_check: false }
      )

      expect(directPaymentProcessor).toHaveBeenCalledWith(
        expect.objectContaining({ bypass_payment_check: false })
      )
    })
  })

  describe('4. Валидация входных данных', () => {
    it('должна выбрасывать ошибку при отсутствии prompt', async () => {
      const result = await generateNeuroPhotoDirect(
        '',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot'
      )

      expect(result).toBeNull()
    })

    it('должна выбрасывать ошибку при отсутствии model_url', async () => {
      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        '',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot'
      )

      expect(result).toBeNull()
    })

    it('должна использовать numImages=1 если передано 0 или отрицательное', async () => {
      await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        0,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      // Should calculate cost for 1 image, not 0.
      // Сервис зовёт calculateModeCost из '@/price/helpers/modelsCost' —
      // он принимает { mode, steps, numImages }, и количество изображений
      // передаётся как numImages, а не steps (steps относится к тренировке
      // аватара). Проверяемое свойство прежнее: ноль превращается в единицу.
      expect(calculateModeCost).toHaveBeenCalledWith(
        expect.objectContaining({
          numImages: 1,
        })
      )
    })
  })

  describe('5. Aspect Ratio', () => {
    it('должна использовать явный aspect ratio если передан', async () => {
      await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        '16:9',
        { disable_telegram_sending: true }
      )

      // Should not call getAspectRatio when explicit ratio provided
      expect(getAspectRatio).not.toHaveBeenCalled()
      expect(generateNeuroPhotoViaKie).toHaveBeenCalledWith(
        'Test prompt',
        '16:9'
      )
    })

    it('должна получать aspect ratio из БД если не передан', async () => {
      ;(getAspectRatio as Mock).mockResolvedValue('9:16')

      await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(getAspectRatio).toHaveBeenCalledWith(144022504)
      expect(generateNeuroPhotoViaKie).toHaveBeenCalledWith(
        'Test prompt',
        '9:16'
      )
    })

    it('должна использовать портретный дефолт если БД вернула null', async () => {
      ;(getAspectRatio as Mock).mockResolvedValue(null)

      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      // DEFAULT_ASPECT_RATIO from @/config/aspectRatio is the portrait 9:16
      expect(result?.success).toBe(true)
      expect(generateNeuroPhotoViaKie).toHaveBeenCalledWith(
        'Test prompt',
        '9:16'
      )
    })
  })

  describe('6. Генерация нескольких изображений', () => {
    it('должна генерировать несколько изображений последовательно', async () => {
      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        3,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(result?.success).toBe(true)
      expect(result?.urls).toHaveLength(3)
      expect(generateNeuroPhotoViaKie).toHaveBeenCalledTimes(3)
    })
  })

  describe('7. Обработка ошибок', () => {
    // Сценарий «бот не найден» стал НЕДОСТИЖИМ: сервис больше не ищет бота
    // через getBotByName, а берёт ctx.telegram напрямую — см. комментарий в
    // generateNeuroPhotoDirect.ts: «✅ ИСПРАВЛЕНИЕ: Используем ctx.telegram
    // напрямую вместо getBotByName. Это более надежно и не зависит от
    // регистрации ботов в глобальной коллекции». Проверяем то, что этой
    // правкой и достигалось: пустой ответ getBotByName генерацию не ломает.
    it('не зависит от getBotByName: генерация идёт через ctx.telegram', async () => {
      ;(getBotByName as Mock).mockReturnValue({
        bot: null,
        error: 'Bot not found',
      })

      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot'
      )

      expect(result?.success).toBe(true)
    })

    it('должна обрабатывать ошибку если пользователь не найден', async () => {
      ;(getUserByTelegramId as Mock).mockResolvedValue(null)

      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot'
      )

      expect(result).toBeNull()
    })

    it('при недоступном kie.ai возвращает неудачу с возвратом средств', async () => {
      ;(generateNeuroPhotoViaKie as Mock).mockRejectedValue(
        new Error('API unavailable')
      )

      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      // No provider stands behind kie.ai (kie-only): every image failed,
      // every image was refunded, the run reports failure.
      expect(result?.success).toBe(false)
      expect(generateNeuroPhotoViaKie).toHaveBeenCalledTimes(1)
    })
  })

  describe('8. Интеграция с Pulse Analytics', () => {
    it('должна отправлять данные в Pulse после генерации', async () => {
      await generateNeuroPhotoDirect(
        'Beautiful landscape',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(sendMediaToPulse).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'photo',
          telegramId: '144022504',
          serviceType: ModeEnum.NeuroPhoto,
          prompt: 'Beautiful landscape',
        })
      )
    })
  })

  describe('9. Сохранение в сессию для upscaler', () => {
    it('должна сохранять URL и prompt в сессию', async () => {
      const contextWithSession = {
        ...mockContext,
        session: {
          ...mockContext.session,
        },
      } as any

      await generateNeuroPhotoDirect(
        'Test prompt for session',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        contextWithSession,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(contextWithSession.session.lastNeuroPhotoImageUrl).toBe(KIE_URL)
      expect(contextWithSession.session.lastNeuroPhotoPrompt).toBe(
        'Test prompt for session'
      )
    })
  })

  describe('10. Отправка сообщений в Telegram', () => {
    it('НЕ должна отправлять сообщения если disable_telegram_sending=true', async () => {
      await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(mockTelegram.sendPhoto).not.toHaveBeenCalled()
      expect(mockTelegram.sendMessage).not.toHaveBeenCalled()
    })

    it('должна отправлять фото в Telegram по умолчанию', async () => {
      await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot'
      )

      expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
        // Сервис передаёт telegram_id как получил его — строкой.
        '144022504',
        expect.objectContaining({ url: KIE_URL }),
        expect.objectContaining({
          parse_mode: 'HTML',
        })
      )
    })
  })
})
