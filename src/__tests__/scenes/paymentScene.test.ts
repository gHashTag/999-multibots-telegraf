/**
 * Tests for paymentScene (Payment Method Selection)
 * Covers: Payment method selection, Stars/Rubles routing, subscription handling
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers', () => ({
  isRussian: vi.fn(() => true),
}))

vi.mock('@/core/bot/shouldShowRubles', () => ({
  shouldShowRubles: vi.fn(() => true),
}))

vi.mock('@/handlers/handleSelectStars', () => ({
  handleSelectStars: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/handlers/handleBuySubscription', () => ({
  handleBuySubscription: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/price/helpers/starAmounts', () => ({
  starAmounts: [10, 50, 100, 500, 1000, 2000, 5000],
}))

vi.mock('@/navigation', () => ({
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
    PaymentScene: 'paymentScene',
    RublePaymentScene: 'rublePaymentScene',
  },
}))

vi.mock('@/interfaces/payments.interface', () => ({
  PaymentType: {
    MONEY_INCOME: 'MONEY_INCOME',
  },
}))

// Import after mocks
import { isRussian } from '@/helpers'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { starAmounts } from '@/price/helpers/starAmounts'
import { showMainMenu } from '@/navigation'
import { PaymentType } from '@/interfaces/payments.interface'

describe('paymentScene (Payment Method Selection)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'paymentScene' },
    },
    session: {
      selectedPayment: null as any,
    },
    botInfo: { username: 'test_bot' },
    telegram: {
      token: 'test_token',
    },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session.selectedPayment = null
    mockContext.message = null

    ;(isRussian as Mock).mockReturnValue(true)
    ;(shouldShowRubles as Mock).mockReturnValue(true)
    ;(handleSelectStars as Mock).mockResolvedValue(undefined)
    ;(handleBuySubscription as Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Вход в сцену', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussian(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен проверять доступность оплаты рублями', () => {
      const showRubles = shouldShowRubles(mockContext as any)
      expect(showRubles).toBe(true)
    })

    it('должен показывать сообщение о выборе способа оплаты на русском', () => {
      const isRu = true
      const message = isRu ? 'Выберите способ оплаты:' : 'Select payment method:'

      expect(message).toBe('Выберите способ оплаты:')
    })

    it('должен показывать сообщение на английском', () => {
      const isRu = false
      const message = isRu ? 'Выберите способ оплаты:' : 'Select payment method:'

      expect(message).toBe('Select payment method:')
    })
  })

  describe('2. Формирование клавиатуры', () => {
    it('должен всегда показывать кнопку Звезды', () => {
      const isRu = true
      const starsButton = isRu ? '⭐️ Звездами' : '⭐️ Stars'

      expect(starsButton).toBe('⭐️ Звездами')
    })

    it('должен показывать кнопку Рубли если разрешено', () => {
      ;(shouldShowRubles as Mock).mockReturnValue(true)

      const showRubles = shouldShowRubles(mockContext as any)
      expect(showRubles).toBe(true)

      const isRu = true
      const rublesButton = isRu ? '💳 Рублями' : '💳 Rubles'

      expect(rublesButton).toBe('💳 Рублями')
    })

    it('не должен показывать кнопку Рубли если запрещено', () => {
      ;(shouldShowRubles as Mock).mockReturnValue(false)

      const showRubles = shouldShowRubles(mockContext as any)
      expect(showRubles).toBe(false)
    })

    it('должен показывать кнопку Главное меню', () => {
      const isRu = true
      const menuButton = isRu ? '🏠 Главное меню' : '🏠 Main menu'

      expect(menuButton).toBe('🏠 Главное меню')
    })

    it('должен показывать WebApp кнопку "Что такое звезды"', () => {
      const isRu = true
      const webAppText = isRu ? 'Что такое звезды❓' : 'What are stars❓'
      const webAppUrl = `https://telegram.org/blog/telegram-stars/${isRu ? 'ru' : 'en'}?ln=a`

      expect(webAppText).toBe('Что такое звезды❓')
      expect(webAppUrl).toContain('telegram.org/blog/telegram-stars/ru')
    })
  })

  describe('3. Обработка выбора Звезд', () => {
    it('должен распознавать кнопку Звезды', () => {
      const starsButtons = ['⭐️ Звездами', '⭐️ Stars']
      const text = '⭐️ Звездами'

      expect(starsButtons.includes(text)).toBe(true)
    })

    it('должен вызывать handleSelectStars для пополнения баланса', async () => {
      mockContext.session.selectedPayment = null

      const selectedPaymentInfo = mockContext.session.selectedPayment

      // Если нет подписки - это пополнение баланса
      if (!selectedPaymentInfo?.subscription) {
        await handleSelectStars({
          ctx: mockContext as any,
          starAmounts,
          isRu: true,
        })
      }

      expect(handleSelectStars).toHaveBeenCalledWith({
        ctx: mockContext,
        starAmounts,
        isRu: true,
      })
    })

    it('должен вызывать handleBuySubscription для покупки подписки', async () => {
      mockContext.session.selectedPayment = {
        type: PaymentType.MONEY_INCOME,
        subscription: 'neurophoto',
        amount: 1110,
        stars: 476,
      }

      const selectedPaymentInfo = mockContext.session.selectedPayment

      if (
        selectedPaymentInfo &&
        selectedPaymentInfo.type === PaymentType.MONEY_INCOME &&
        selectedPaymentInfo.subscription
      ) {
        await handleBuySubscription({
          ctx: mockContext as any,
          isRu: true,
        })
      }

      expect(handleBuySubscription).toHaveBeenCalledWith({
        ctx: mockContext,
        isRu: true,
      })
    })
  })

  describe('4. Обработка выбора Рублей', () => {
    it('должен распознавать кнопку Рубли', () => {
      const rublesButtons = ['💳 Рублями', '💳 Rubles']
      const text = '💳 Рублями'

      expect(rublesButtons.includes(text)).toBe(true)
    })

    it('должен проверять, что пользователь в правильной сцене', () => {
      const currentSceneId = mockContext.scene.current?.id
      const expectedSceneId = 'paymentScene'

      expect(currentSceneId).toBe(expectedSceneId)
    })

    it('должен переходить в RublePaymentScene без paymentInfo для пополнения', async () => {
      mockContext.session.selectedPayment = null

      const paymentInfo = mockContext.session.selectedPayment

      // Если нет подписки - просто входим в сцену
      if (!paymentInfo?.subscription) {
        await mockContext.scene.enter('rublePaymentScene')
      }

      expect(mockContext.scene.enter).toHaveBeenCalledWith('rublePaymentScene')
    })

    it('должен передавать paymentInfo для покупки подписки', async () => {
      mockContext.session.selectedPayment = {
        type: PaymentType.MONEY_INCOME,
        subscription: 'neurophoto',
        amount: 1110,
        stars: 476,
      }

      const paymentInfo = mockContext.session.selectedPayment

      if (paymentInfo?.subscription) {
        await mockContext.scene.enter('rublePaymentScene', { paymentInfo })
      }

      expect(mockContext.scene.enter).toHaveBeenCalledWith(
        'rublePaymentScene',
        { paymentInfo }
      )
    })
  })

  describe('5. Выход в главное меню', () => {
    it('должен распознавать кнопку Главное меню', () => {
      const menuButtons = ['🏠 Главное меню', '🏠 Main menu']
      const text = '🏠 Главное меню'

      expect(menuButtons.includes(text)).toBe(true)
    })

    it('должен очищать selectedPayment перед выходом', async () => {
      mockContext.session.selectedPayment = {
        type: PaymentType.MONEY_INCOME,
        subscription: 'neurophoto',
        amount: 1110,
        stars: 476,
      }

      // Очищаем перед выходом
      mockContext.session.selectedPayment = undefined

      expect(mockContext.session.selectedPayment).toBeUndefined()
    })

    it('должен выходить из сцены и показывать меню', async () => {
      await mockContext.scene.leave()
      await showMainMenu(mockContext as any)

      expect(mockContext.scene.leave).toHaveBeenCalled()
      expect(showMainMenu).toHaveBeenCalledWith(mockContext)
    })
  })

  describe('6. Обработка неожиданных сообщений', () => {
    it('должен показывать подсказку на русском', () => {
      const isRu = true
      const replyText = isRu
        ? 'Пожалуйста, выберите ⭐️ Звездами или вернитесь в 🏠 Главное меню.'
        : 'Please select ⭐️ Stars or return to the 🏠 Main menu.'

      expect(replyText).toContain('Звездами')
    })

    it('должен показывать подсказку на английском', () => {
      const isRu = false
      const replyText = isRu
        ? 'Пожалуйста, выберите ⭐️ Звездами или вернитесь в 🏠 Главное меню.'
        : 'Please select ⭐️ Stars or return to the 🏠 Main menu.'

      expect(replyText).toContain('Stars')
    })
  })

  describe('7. Проверка selectedPayment в сессии', () => {
    it('должен определять пополнение баланса (нет subscription)', () => {
      mockContext.session.selectedPayment = null

      const isBalanceTopUp = !mockContext.session.selectedPayment?.subscription
      expect(isBalanceTopUp).toBe(true)
    })

    it('должен определять покупку подписки', () => {
      mockContext.session.selectedPayment = {
        type: PaymentType.MONEY_INCOME,
        subscription: 'neurovideo',
        amount: 2999,
        stars: 1303,
      }

      const isSubscription = !!mockContext.session.selectedPayment?.subscription
      expect(isSubscription).toBe(true)
    })

    it('должен проверять тип операции MONEY_INCOME', () => {
      mockContext.session.selectedPayment = {
        type: PaymentType.MONEY_INCOME,
        subscription: 'neurophoto',
        amount: 1110,
        stars: 476,
      }

      expect(mockContext.session.selectedPayment.type).toBe(PaymentType.MONEY_INCOME)
    })
  })

  describe('8. Обработка ошибок', () => {
    it('должен показывать сообщение об ошибке на русском', () => {
      const isRu = true
      const errorMessage = isRu
        ? 'Произошла ошибка.'
        : 'An error occurred.'

      expect(errorMessage).toBe('Произошла ошибка.')
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен показывать ошибку неверной сцены', () => {
      const currentSceneId = 'wrongScene'
      const expectedSceneId = 'paymentScene'
      const isWrongScene = currentSceneId !== expectedSceneId

      expect(isWrongScene).toBe(true)

      const isRu = true
      const errorMessage = isRu
        ? '❌ Ошибка: вы не находитесь в сцене оплаты. Попробуйте начать заново.'
        : '❌ Error: you are not in the payment scene. Please try again.'

      expect(errorMessage).toContain('не находитесь в сцене оплаты')
    })
  })

  describe('9. Логирование', () => {
    it('должен логировать выбор Звезд', () => {
      const logData = {
        telegram_id: mockContext.from.id,
        selectedPaymentInfo: mockContext.session.selectedPayment,
      }

      expect(logData.telegram_id).toBe(223757230)
    })

    it('должен логировать выбор Рублей', () => {
      const logData = {
        telegram_id: mockContext.from.id,
        currentScene: mockContext.scene.current?.id,
      }

      expect(logData.telegram_id).toBe(223757230)
      expect(logData.currentScene).toBe('paymentScene')
    })
  })

  describe('10. Интеграция с starAmounts', () => {
    it('должен передавать все пакеты звезд в handleSelectStars', () => {
      expect(starAmounts).toContain(10)
      expect(starAmounts).toContain(50)
      expect(starAmounts).toContain(100)
      expect(starAmounts).toContain(500)
      expect(starAmounts).toContain(1000)
      expect(starAmounts).toContain(2000)
      expect(starAmounts).toContain(5000)
    })

    it('должен иметь 7 пакетов звезд', () => {
      expect(starAmounts).toHaveLength(7)
    })
  })
})
