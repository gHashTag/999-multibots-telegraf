/**
 * Tests for generateNeuroPhotoDirect service
 * Covers: Fal.ai integration, Replicate fallback, payment processing, idempotency
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'
import { ModeEnum } from '../../interfaces/modes'
import type { MutableCtx } from '../helpers/mutableContext'

// Mock all dependencies BEFORE importing the module under test
vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
  },
}))

vi.mock('../../core/replicate', () => ({
  replicate: {
    run: vi.fn(),
  },
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

vi.mock('../../helpers/error/processApiResponse', () => ({
  processApiResponse: vi.fn(),
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
import { fal } from '@fal-ai/client'
import { replicate } from '../../core/replicate'
import { getUserByTelegramId, savePromptDirect } from '../../core/supabase'
import { getAspectRatio } from '../../core/supabase/ai'
import { directPaymentProcessor } from '../../core/supabase/directPayment'
import { getBotByName } from '../../core/bot'
import { calculateModeCost } from '../../price/helpers/modelsCost'
import { isRussianFromState } from '../../helpers/centralizedLanguage'
import { saveFileLocally } from '../../helpers/saveFileLocally'
import { sendMediaToPulse } from '../../helpers/pulse'
import { processApiResponse } from '../../helpers/error/processApiResponse'
import { generateNeuroPhotoDirect } from '../../services/generateNeuroPhotoDirect'
import { MyContext } from '../../interfaces'

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

    // Setup FAL_KEY env
    process.env.FAL_KEY = 'test-fal-key'
  })

  afterEach(() => {
    delete process.env.FAL_KEY
  })

  describe('1. Успешная генерация через Fal.ai', () => {
    it('должна генерировать изображение через Fal.ai с LoRA', async () => {
      const mockFalResult = {
        data: {
          images: [
            {
              url: 'https://fal.media/generated-image.jpg',
              width: 768,
              height: 1365,
            },
          ],
        },
      }

      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
      expect(result?.urls?.[0]).toBe('https://fal.media/generated-image.jpg')

      // Verify Fal.ai was called
      expect(fal.config).toHaveBeenCalledWith({ credentials: 'test-fal-key' })
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: expect.stringContaining('Beautiful sunset'),
            num_images: 1,
            loras: expect.arrayContaining([
              expect.objectContaining({
                scale: expect.any(Number),
              }),
            ]),
          }),
        })
      )
    })

    it('должна обрабатывать разные форматы ответа Fal.ai', async () => {
      // Формат 1: images напрямую
      const mockFalResult1 = {
        images: [{ url: 'https://fal.media/image1.jpg' }],
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult1)

      const result1 = await generateNeuroPhotoDirect(
        'Test prompt',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(result1?.success).toBe(true)

      // Формат 2: data.images
      vi.clearAllMocks()
      ;(getBotByName as Mock).mockReturnValue({ bot: mockBot, error: null })
      ;(getUserByTelegramId as Mock).mockResolvedValue({
        id: 'user-uuid',
        telegram_id: '144022504',
        level: 2,
      })
      ;(calculateModeCost as Mock).mockReturnValue({ stars: 7.5 })
      ;(directPaymentProcessor as Mock).mockResolvedValue({ success: true })
      ;(getAspectRatio as Mock).mockResolvedValue('1:1')
      ;(saveFileLocally as Mock).mockResolvedValue('/local/path/image.jpg')
      ;(sendMediaToPulse as Mock).mockResolvedValue(undefined)

      const mockFalResult2 = {
        data: {
          images: [{ url: 'https://fal.media/image2.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult2)

      const result2 = await generateNeuroPhotoDirect(
        'Test prompt 2',
        'https://example.com/model.safetensors',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(result2?.success).toBe(true)
    })
  })

  describe('2. Fallback на Replicate', () => {
    it('должна использовать Replicate если api="replicate"', async () => {
      const contextWithReplicate = {
        ...mockContext,
        session: {
          userModel: {
            api: 'replicate',
            model_url: 'owner/model:version',
          },
        },
      } as any

      const mockReplicateOutput = ['https://replicate.delivery/image.jpg']
      ;(replicate.run as Mock).mockResolvedValue(mockReplicateOutput)
      ;(processApiResponse as Mock).mockResolvedValue(
        'https://replicate.delivery/image.jpg'
      )

      // Провайдер выбирается как `useFal = isFalModel || !!process.env.FAL_KEY`,
      // поэтому при заданном FAL_KEY (он есть в общем тестовом окружении)
      // сервис ушёл бы в FAL даже для replicate-модели. Ветку replicate
      // проверяем, явно сняв ключ.
      const savedFalKey = process.env.FAL_KEY
      delete process.env.FAL_KEY

      // userModel — ДЕВЯТЫЙ параметр функции («✅ Add userModel parameter for
      // FAL support»), фоллбэка на ctx.session.userModel в коде нет: выбор
      // провайдера идёт по `userModel?.api === 'fal'`. Раньше тест клал модель
      // только в сессию, и она не читалась.
      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'owner/model:version',
        1,
        '144022504',
        contextWithReplicate,
        'test_bot',
        null,
        { disable_telegram_sending: true },
        { api: 'replicate', model_url: 'owner/model:version' }
      )

      if (savedFalKey !== undefined) process.env.FAL_KEY = savedFalKey

      expect(result?.success).toBe(true)
      expect(replicate.run).toHaveBeenCalled()
    })

    it('должна fallback на Replicate если Fal.ai вернул ошибку', async () => {
      ;(fal.subscribe as Mock).mockRejectedValue(new Error('Fal.ai API Error'))

      const mockReplicateOutput = ['https://replicate.delivery/fallback.jpg']
      ;(replicate.run as Mock).mockResolvedValue(mockReplicateOutput)
      ;(processApiResponse as Mock).mockResolvedValue(
        'https://replicate.delivery/fallback.jpg'
      )

      const result = await generateNeuroPhotoDirect(
        'Test prompt',
        'owner/model:version',
        1,
        '144022504',
        mockContext as MyContext,
        'test_bot',
        null,
        { disable_telegram_sending: true }
      )

      expect(result?.success).toBe(true)
      expect(replicate.run).toHaveBeenCalled()
    })
  })

  describe('3. Обработка платежей', () => {
    it('должна списывать звезды за генерацию', async () => {
      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
    })

    it('должна получать aspect ratio из БД если не передан', async () => {
      ;(getAspectRatio as Mock).mockResolvedValue('9:16')

      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
    })

    it('должна использовать 1:1 по умолчанию если БД вернула null', async () => {
      ;(getAspectRatio as Mock).mockResolvedValue(null)

      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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

      expect(result?.success).toBe(true)
    })
  })

  describe('6. Генерация нескольких изображений', () => {
    it('должна генерировать несколько изображений последовательно', async () => {
      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
      expect(fal.subscribe).toHaveBeenCalledTimes(3)
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
        'unknown_bot'
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

    it('должна возвращать null при критической ошибке API', async () => {
      ;(fal.subscribe as Mock).mockRejectedValue(new Error('API unavailable'))
      ;(replicate.run as Mock).mockRejectedValue(
        new Error('Replicate unavailable')
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

      // Should still return with success false or partial results
      // depending on implementation
      expect(result?.success).toBe(false)
    })
  })

  describe('8. Интеграция с Pulse Analytics', () => {
    it('должна отправлять данные в Pulse после генерации', async () => {
      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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

      expect(contextWithSession.session.lastNeuroPhotoImageUrl).toBe(
        'https://fal.media/image.jpg'
      )
      expect(contextWithSession.session.lastNeuroPhotoPrompt).toBe(
        'Test prompt for session'
      )
    })
  })

  describe('10. Отправка сообщений в Telegram', () => {
    it('НЕ должна отправлять сообщения если disable_telegram_sending=true', async () => {
      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
      const mockFalResult = {
        data: {
          images: [{ url: 'https://fal.media/image.jpg' }],
        },
      }
      ;(fal.subscribe as Mock).mockResolvedValue(mockFalResult)

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
        expect.objectContaining({ url: 'https://fal.media/image.jpg' }),
        expect.objectContaining({
          parse_mode: 'HTML',
        })
      )
    })
  })
})
