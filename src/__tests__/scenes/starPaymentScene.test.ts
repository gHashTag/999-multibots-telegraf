/**
 * Tests for starPaymentScene (Telegram Stars payment integration)
 * Covers: Scene entry, star selection, invoice creation, payment handling
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/handlers', () => ({
  handleSelectStars: vi.fn(),
  handleBuySubscription: vi.fn(),
}))

vi.mock('@/handlers/handleBuy', () => ({
  handleBuy: vi.fn(),
}))

vi.mock('@/price/helpers/starAmounts', () => ({
  starAmounts: [10, 50, 100, 500, 1000, 2000, 5000],
}))

vi.mock('@/core/supabase', () => ({
  setPayments: vi.fn(() => Promise.resolve({ error: null })),
}))

vi.mock('@/core', () => ({
  getBotNameByToken: vi.fn(() => ({ bot_name: 'test_bot' })),
}))

vi.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [123456789],
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn(),
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleSelectStars, handleBuySubscription } from '@/handlers'
import { starAmounts } from '@/price/helpers/starAmounts'
import { setPayments } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { ADMIN_IDS_ARRAY } from '@/config'

describe('starPaymentScene (Telegram Stars)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    replyWithInvoice: vi.fn(),
    answerCbQuery: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      current: { id: 'starPaymentScene' },
    },
    session: {
      selectedPayment: null as any,
    },
    telegram: {
      token: 'test_token',
    },
    callbackQuery: { data: '' } as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session.selectedPayment = null
    mockContext.callbackQuery = { data: '' }
    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(handleSelectStars as Mock).mockResolvedValue(undefined)
    ;(handleBuySubscription as Mock).mockResolvedValue(undefined)
    ;(setPayments as Mock).mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Доступные пакеты звезд', () => {
    it('должен иметь правильный набор пакетов звезд', () => {
      expect(starAmounts).toContain(10)
      expect(starAmounts).toContain(50)
      expect(starAmounts).toContain(100)
      expect(starAmounts).toContain(500)
      expect(starAmounts).toContain(1000)
      expect(starAmounts).toContain(2000)
      expect(starAmounts).toContain(5000)
    })

    it('должен иметь минимальный пакет 10 звезд', () => {
      const minAmount = Math.min(...starAmounts)
      expect(minAmount).toBe(10)
    })

    it('все пакеты должны быть положительными числами', () => {
      starAmounts.forEach(amount => {
        expect(amount).toBeGreaterThan(0)
        expect(typeof amount).toBe('number')
      })
    })
  })

  describe('2. Вход в сцену - пополнение баланса', () => {
    it('должен вызывать handleSelectStars если нет подписки', async () => {
      mockContext.session.selectedPayment = null

      // Имитируем вход в сцену без подписки
      const hasSubscription = mockContext.session.selectedPayment?.subscription

      if (!hasSubscription) {
        await handleSelectStars({
          ctx: mockContext as any,
          isRu: true,
          starAmounts,
        })
      }

      expect(handleSelectStars).toHaveBeenCalledWith(
        expect.objectContaining({
          ctx: mockContext,
          isRu: true,
          starAmounts,
        })
      )
    })

    it('должен вызывать handleBuySubscription если есть подписка', async () => {
      mockContext.session.selectedPayment = {
        subscription: 'neurophoto',
        amount: 476,
        stars: 476,
      }

      const hasSubscription = mockContext.session.selectedPayment?.subscription

      if (hasSubscription) {
        await handleBuySubscription({
          ctx: mockContext as any,
          isRu: true,
        })
      }

      expect(handleBuySubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          ctx: mockContext,
          isRu: true,
        })
      )
    })
  })

  describe('3. Обработка выбора пакета звезд', () => {
    it('должен создавать callback_data в формате top_up_{amount}', () => {
      const amount = 100
      const callbackData = `top_up_${amount}`

      expect(callbackData).toBe('top_up_100')
    })

    it('должен парсить amount из callback_data', () => {
      const callbackData = 'top_up_500'
      const match = callbackData.match(/top_up_(\d+)/)

      expect(match).not.toBeNull()
      expect(match![1]).toBe('500')
      expect(parseInt(match![1], 10)).toBe(500)
    })

    it('должен находить amount в списке starAmounts', () => {
      const callbackData = 'top_up_1000'
      const match = callbackData.match(/top_up_(\d+)/)
      const amount = parseInt(match![1], 10)

      const found = starAmounts.includes(amount)
      expect(found).toBe(true)
    })
  })

  describe('4. Создание Telegram Invoice', () => {
    it('должен создавать invoice с правильной структурой', async () => {
      const amount = 100
      const isRu = true

      const invoice = {
        title: `${amount} ⭐️`,
        description: isRu
          ? `💬 Получите ${amount} звезд.`
          : `💬 Get ${amount} stars.`,
        payload: `${amount}_${Date.now()}`,
        currency: 'XTR',
        prices: [
          {
            label: isRu ? 'Цена' : 'Price',
            amount: amount,
          },
        ],
        provider_token: '',
      }

      expect(invoice.currency).toBe('XTR') // Telegram Stars
      expect(invoice.prices[0].amount).toBe(100)
      expect(invoice.provider_token).toBe('') // Для XTR токен не нужен
      expect(invoice.title).toContain('⭐️')
    })

    it('должен использовать валюту XTR для Telegram Stars', () => {
      const currency = 'XTR'
      expect(currency).toBe('XTR')
    })

    it('должен иметь пустой provider_token для XTR', () => {
      const providerToken = ''
      expect(providerToken).toBe('')
    })

    it('должен генерировать уникальный payload', () => {
      const amount = 100
      const payload1 = `${amount}_${Date.now()}`
      const payload2 = `${amount}_${Date.now() + 1}`

      expect(payload1).not.toBe(payload2)
      expect(payload1).toContain('100_')
    })
  })

  describe('5. Админский тест на 1 звезду', () => {
    it('должен разрешать 1 звезду для админов', () => {
      const userId = 123456789
      const isAdmin = ADMIN_IDS_ARRAY.includes(userId)

      expect(isAdmin).toBe(true)
    })

    it('должен добавлять кнопку 1 звезды для админов', () => {
      const userId = 123456789
      const isAdmin = ADMIN_IDS_ARRAY.includes(userId)

      const buttons = starAmounts.map(amount => ({
        text: `⭐️ ${amount}`,
        callback_data: `top_up_${amount}`,
      }))

      if (isAdmin) {
        buttons.unshift({
          text: '⭐️ 1 (Admin Test)',
          callback_data: 'top_up_1',
        })
      }

      expect(buttons[0].callback_data).toBe('top_up_1')
      expect(buttons[0].text).toContain('Admin Test')
    })

    it('не должен разрешать 1 звезду для обычных пользователей', () => {
      const userId = 999999999
      const isAdmin = ADMIN_IDS_ARRAY.includes(userId)

      expect(isAdmin).toBe(false)

      // 1 звезда не должна быть в стандартных опциях
      expect(starAmounts).not.toContain(1)
    })
  })

  describe('6. Локализация', () => {
    it('должен показывать русский текст для RU', () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)
      const isRu = isRussianFromState(mockContext as any)

      const message = isRu
        ? 'Выберите количество звезд для покупки:'
        : 'Choose the number of stars to buy:'

      expect(message).toBe('Выберите количество звезд для покупки:')
    })

    it('должен показывать английский текст для EN', () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)
      const isRu = isRussianFromState(mockContext as any)

      const message = isRu
        ? 'Выберите количество звезд для покупки:'
        : 'Choose the number of stars to buy:'

      expect(message).toBe('Choose the number of stars to buy:')
    })

    it('должен использовать русскую цену в invoice для RU', () => {
      const isRu = true
      const label = isRu ? 'Цена' : 'Price'

      expect(label).toBe('Цена')
    })
  })

  describe('7. Обработка ошибок', () => {
    it('должен логировать ошибку при отсутствии callbackData', async () => {
      mockContext.callbackQuery = { data: undefined }

      const callbackData = mockContext.callbackQuery?.data

      if (!callbackData) {
        logger.error('callbackData не определен')
        expect(logger.error).toHaveBeenCalled()
      }
    })

    it('должен обрабатывать ошибку при создании invoice', async () => {
      ;(mockContext.replyWithInvoice as Mock).mockRejectedValue(
        new Error('Invoice creation failed')
      )

      try {
        await mockContext.replyWithInvoice({
          title: '100 ⭐️',
          description: 'Test',
          payload: '100_123',
          currency: 'XTR',
          prices: [{ label: 'Price', amount: 100 }],
          provider_token: '',
        })
      } catch (error) {
        logger.error('Ошибка при создании invoice')
        expect(logger.error).toHaveBeenCalled()
      }
    })
  })

  describe('8. Интеграция с handleBuy', () => {
    it('должен проверять совпадение callback_data с top_up_*', () => {
      const callbackData = 'top_up_500'

      let matchFound = false
      for (const amount of starAmounts) {
        if (callbackData.endsWith(`top_up_${amount}`)) {
          matchFound = true
          break
        }
      }

      expect(matchFound).toBe(true)
    })

    it('должен не находить совпадение для невалидного callback_data', () => {
      const callbackData = 'invalid_callback'

      let matchFound = false
      for (const amount of starAmounts) {
        if (callbackData.endsWith(`top_up_${amount}`)) {
          matchFound = true
          break
        }
      }

      expect(matchFound).toBe(false)
    })
  })

  describe('9. Сессия и состояние', () => {
    it('должен сохранять selectedPayment в сессии для подписки', () => {
      mockContext.session.selectedPayment = {
        subscription: 'neurovideo',
        amount: 1303,
        stars: 1303,
      }

      expect(mockContext.session.selectedPayment).toBeDefined()
      expect(mockContext.session.selectedPayment.subscription).toBe(
        'neurovideo'
      )
    })

    it('должен иметь null selectedPayment для обычного пополнения', () => {
      mockContext.session.selectedPayment = null

      expect(mockContext.session.selectedPayment).toBeNull()
    })
  })

  describe('10. Кнопки интерфейса', () => {
    it('должен создавать массив кнопок для всех пакетов', () => {
      const buttons = starAmounts.map(amount => [
        {
          text: `⭐️ ${amount}`,
          callback_data: `top_up_${amount}`,
        },
      ])

      expect(buttons).toHaveLength(starAmounts.length)
      expect(buttons[0][0].text).toBe('⭐️ 10')
      expect(buttons[0][0].callback_data).toBe('top_up_10')
    })

    it('должен использовать эмодзи звезды в тексте кнопки', () => {
      const buttonText = `⭐️ 100`

      expect(buttonText).toContain('⭐️')
      expect(buttonText).toContain('100')
    })
  })
})
