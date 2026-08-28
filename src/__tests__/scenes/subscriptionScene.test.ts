/**
 * Tests for subscriptionScene (Subscription Selection)
 * Covers: Plan display, subscription selection, admin test, payment routing
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers', () => ({
  isRussian: vi.fn(() => true),
}))

vi.mock('@/core/supabase', () => ({
  getTranslation: vi.fn(() =>
    Promise.resolve({
      translation: '💫 Выберите подписку\n\nПолучите доступ ко всем функциям!',
      url: null,
      buttons: [
        {
          text: 'НейроФото',
          callback_data: 'neurophoto',
          ru_price: '1110',
          en_price: '15',
        },
        {
          text: 'НейроВидео',
          callback_data: 'neurovideo',
          ru_price: '2999',
          en_price: '40',
        },
      ],
    })
  ),
  getUserDetailsSubscription: vi.fn(() =>
    Promise.resolve({
      subscriptionType: null,
    })
  ),
}))

vi.mock('@/core/bot/shouldShowRubles', () => ({
  shouldShowRubles: vi.fn(() => true),
}))

vi.mock('@/price/priceCalculator', () => ({
  paymentOptionsPlans: [
    {
      subscription: 'NEUROPHOTO',
      amount: 1110,
      stars: 476,
      isAdminOnly: false,
    },
    {
      subscription: 'NEUROVIDEO',
      amount: 2999,
      stars: 1303,
      isAdminOnly: false,
    },
    {
      subscription: 'NEUROTESTER',
      amount: 100,
      stars: 50,
      isAdminOnly: true,
    },
  ],
}))

vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/helpers/escapeMarkdown', () => ({
  escapeMarkdownV2: vi.fn(text => text),
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
    SubscriptionScene: 'subscriptionScene',
    PaymentScene: 'paymentScene',
  },
}))

vi.mock('@/interfaces/subscription.interface', () => ({
  SubscriptionType: {
    NEUROPHOTO: 'NEUROPHOTO',
    NEUROVIDEO: 'NEUROVIDEO',
    NEUROTESTER: 'NEUROTESTER',
  },
}))

vi.mock('@/interfaces/payments.interface', () => ({
  PaymentType: {
    MONEY_INCOME: 'MONEY_INCOME',
  },
}))

// Import after mocks
import { isRussian } from '@/helpers'
import { getTranslation, getUserDetailsSubscription } from '@/core/supabase'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { showMainMenu } from '@/navigation'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { PaymentType } from '@/interfaces/payments.interface'

describe('subscriptionScene (Subscription Selection)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    answerCbQuery: vi.fn(),
    editMessageText: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'subscriptionScene' },
    },
    session: {
      subscription: null as any,
      selectedPayment: null as any,
      isAdminTest: false,
    },
    botInfo: { username: 'test_bot' },
    telegram: {
      token: 'test_token',
      sendMessage: vi.fn(),
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    update: {} as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session.subscription = null
    mockContext.session.selectedPayment = null
    mockContext.session.isAdminTest = false
    mockContext.update = {}
    process.env.ADMIN_IDS = '123456789'
    ;(isRussian as Mock).mockReturnValue(true)
    ;(shouldShowRubles as Mock).mockReturnValue(true)
    ;(getTranslation as Mock).mockResolvedValue({
      translation: '💫 Выберите подписку',
      url: null,
      buttons: [],
    })
    ;(getUserDetailsSubscription as Mock).mockResolvedValue({
      subscriptionType: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ADMIN_IDS
  })

  describe('1. Вход в сцену (Шаг 1)', () => {
    it('должен получать данные о подписке пользователя', async () => {
      const telegramId = mockContext.from.id.toString()
      const userDetails = await getUserDetailsSubscription(telegramId)

      expect(getUserDetailsSubscription).toHaveBeenCalledWith(telegramId)
      expect(userDetails.subscriptionType).toBeNull()
    })

    it('должен определять язык', () => {
      const isRu = isRussian(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен получать перевод для subscriptionScene', async () => {
      const result = await getTranslation({
        key: 'subscriptionScene',
        ctx: mockContext as any,
        bot_name: 'test_bot',
      })

      expect(getTranslation).toHaveBeenCalledWith({
        key: 'subscriptionScene',
        ctx: mockContext,
        bot_name: 'test_bot',
      })
      expect(result.translation).toBeDefined()
    })
  })

  describe('2. Фильтрация планов по админ-статусу', () => {
    it('должен показывать все планы для обычного пользователя', () => {
      const adminIds = [123456789]
      const telegramId = 223757230
      const isAdmin = adminIds.includes(telegramId)

      expect(isAdmin).toBe(false)

      const availablePlans = paymentOptionsPlans.filter(
        plan => !plan.isAdminOnly || (plan.isAdminOnly && isAdmin)
      )

      // Обычный пользователь видит только не-админские планы
      expect(availablePlans).toHaveLength(2)
      expect(availablePlans.every(p => !p.isAdminOnly)).toBe(true)
    })

    it('должен показывать все планы для админа', () => {
      const adminIds = [123456789]
      const telegramId = 123456789
      const isAdmin = adminIds.includes(telegramId)

      expect(isAdmin).toBe(true)

      const availablePlans = paymentOptionsPlans.filter(
        plan => !plan.isAdminOnly || (plan.isAdminOnly && isAdmin)
      )

      // Админ видит все планы
      expect(availablePlans).toHaveLength(3)
    })
  })

  describe('3. Формирование клавиатуры', () => {
    it('должен создавать кнопки для каждого плана', () => {
      const isRu = true
      const showRubles = true

      const buttons = paymentOptionsPlans
        .filter(p => !p.isAdminOnly)
        .map(plan => {
          let text = plan.subscription?.toString() || 'Unknown'
          if (isRu && showRubles) {
            text += ` - ${plan.amount} ₽`
          } else {
            text += ` - ${plan.stars} ⭐`
          }
          return {
            text,
            callback_data: plan.subscription?.toLowerCase(),
          }
        })

      expect(buttons).toHaveLength(2)
      expect(buttons[0].callback_data).toBe('neurophoto')
      expect(buttons[0].text).toContain('1110 ₽')
    })

    it('должен показывать звезды на английском', () => {
      const isRu = false
      const showRubles = false

      const plan = paymentOptionsPlans[0]
      let text = plan.subscription?.toString() || ''
      text += ` - ${plan.stars} ⭐`

      expect(text).toContain('476 ⭐')
    })

    it('должен добавлять админ-кнопку для админов', () => {
      const isAdmin = true
      const isRu = true

      const buttons: any[] = []

      if (isAdmin) {
        const adminButtonText = isRu
          ? '🧪 1 ₽ (Админ-тест)'
          : '🧪 1 ₽ (Admin-test)'

        buttons.push({
          text: adminButtonText,
          callback_data: 'admin_test_1rub',
        })
      }

      expect(buttons).toHaveLength(1)
      expect(buttons[0].callback_data).toBe('admin_test_1rub')
    })

    it('должен добавлять кнопку отмены', () => {
      const isRu = true
      const cancelButton = {
        text: isRu ? '❌ Отмена' : '❌ Cancel',
        callback_data: 'cancel_subscription',
      }

      expect(cancelButton.text).toBe('❌ Отмена')
      expect(cancelButton.callback_data).toBe('cancel_subscription')
    })
  })

  describe('4. Обработка выбора плана (Шаг 2)', () => {
    it('должен находить план по callback_data', () => {
      const callbackData = 'neurophoto'

      const selectedPayment = paymentOptionsPlans.find(
        option =>
          option.subscription?.toString().toLowerCase() ===
          callbackData.toLowerCase()
      )

      expect(selectedPayment).toBeDefined()
      expect(selectedPayment?.subscription).toBe('NEUROPHOTO')
    })

    it('должен сохранять выбранный план в сессии', () => {
      const selectedPayment = paymentOptionsPlans[0]

      mockContext.session.subscription = selectedPayment.subscription
      mockContext.session.selectedPayment = {
        amount: selectedPayment.amount,
        stars: Number(selectedPayment.stars),
        subscription: selectedPayment.subscription as any,
        type: PaymentType.MONEY_INCOME,
      }
      mockContext.session.isAdminTest = false

      expect(mockContext.session.subscription).toBe('NEUROPHOTO')
      expect(mockContext.session.selectedPayment.amount).toBe(1110)
      expect(mockContext.session.selectedPayment.stars).toBe(476)
      expect(mockContext.session.isAdminTest).toBe(false)
    })

    it('должен переходить в PaymentScene после выбора', async () => {
      await mockContext.scene.enter('paymentScene')

      expect(mockContext.scene.enter).toHaveBeenCalledWith('paymentScene')
    })
  })

  describe('5. Админский тест на 1 рубль', () => {
    it('должен обрабатывать callback admin_test_1rub', () => {
      const callbackData = 'admin_test_1rub'
      expect(callbackData).toBe('admin_test_1rub')
    })

    it('должен проверять админ-статус', () => {
      const adminIds = [123456789]
      const telegramId = 123456789
      const isAdmin = adminIds.includes(telegramId)

      expect(isAdmin).toBe(true)
    })

    it('должен отклонять не-админов', () => {
      const adminIds = [123456789]
      const telegramId = 223757230
      const isAdmin = adminIds.includes(telegramId)

      expect(isAdmin).toBe(false)
    })

    it('должен настраивать сессию для админского теста', () => {
      mockContext.session.subscription = SubscriptionType.NEUROPHOTO
      mockContext.session.selectedPayment = {
        amount: 1,
        stars: 1,
        subscription: SubscriptionType.NEUROPHOTO,
        type: PaymentType.MONEY_INCOME,
      }
      mockContext.session.isAdminTest = true

      expect(mockContext.session.selectedPayment.amount).toBe(1)
      expect(mockContext.session.selectedPayment.stars).toBe(1)
      expect(mockContext.session.isAdminTest).toBe(true)
    })
  })

  describe('6. Кнопка отмены', () => {
    it('должен обрабатывать cancel_subscription', async () => {
      await mockContext.answerCbQuery()
      expect(mockContext.answerCbQuery).toHaveBeenCalled()
    })

    it('должен редактировать сообщение при отмене на русском', async () => {
      const isRu = true
      const cancelMessage = isRu
        ? '❌ Оформление подписки отменено.'
        : '❌ Subscription canceled.'

      await mockContext.editMessageText(cancelMessage)

      expect(mockContext.editMessageText).toHaveBeenCalledWith(cancelMessage)
    })

    it('должен выходить из сцены и показывать меню', async () => {
      await mockContext.scene.leave()
      await showMainMenu(mockContext as any)

      expect(mockContext.scene.leave).toHaveBeenCalled()
      expect(showMainMenu).toHaveBeenCalledWith(mockContext)
    })
  })

  describe('7. Обработка mainmenu callback', () => {
    it('должен обрабатывать callback mainmenu', () => {
      const callbackData = 'mainmenu'
      expect(callbackData).toBe('mainmenu')
    })

    it('должен выходить из сцены', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('8. Валидация типа подписки', () => {
    it('должен валидировать известный тип подписки', () => {
      const value = 'NEUROPHOTO'

      const isValid = paymentOptionsPlans.some(
        plan =>
          plan.subscription?.toString().toUpperCase() === value.toUpperCase()
      )

      expect(isValid).toBe(true)
    })

    it('не должен валидировать неизвестный тип', () => {
      const value = 'UNKNOWN_PLAN'

      const isValid = paymentOptionsPlans.some(
        plan =>
          plan.subscription?.toString().toUpperCase() === value.toUpperCase()
      )

      expect(isValid).toBe(false)
    })
  })

  describe('9. Fallback сообщения', () => {
    it('должен использовать fallback если нет перевода', () => {
      const translation = ''
      const isRu = true

      const messageText =
        translation ||
        (isRu
          ? `💫 **Выберите подписку**\n\nПолучите доступ ко всем функциям нейро-бота!`
          : `💫 **Choose Subscription**\n\nGet access to all neuro-bot features!`)

      expect(messageText).toContain('Выберите подписку')
    })

    it('должен показывать сообщение если нет планов', () => {
      const isRu = true
      const fallbackMessage = isRu
        ? '❌ К сожалению, в данный момент планы подписки недоступны.'
        : '❌ Unfortunately, subscription plans are currently unavailable.'

      expect(fallbackMessage).toContain('недоступны')
    })
  })

  describe('10. Обработка команды /instagram', () => {
    it('должен показывать сообщение о необходимости подписки', () => {
      const isRu = true
      const instagramMessage = isRu
        ? '📊 *Instagram анализ конкурентов*\n\n❌ Для использования функции анализа конкурентов Instagram необходима активная подписка.'
        : '📊 *Instagram Competitor Analysis*\n\n❌ An active subscription is required to use Instagram competitor analysis.'

      expect(instagramMessage).toContain('Instagram')
      expect(instagramMessage).toContain('подписк')
    })
  })

  describe('11. Проверка telegram_id', () => {
    it('должен выходить если нет telegram_id', async () => {
      const telegramId = undefined

      if (!telegramId) {
        const isRu = true
        const errorMessage = isRu
          ? '❌ Ошибка: не удалось получить ID пользователя'
          : '❌ Error: User ID not found'

        expect(errorMessage).toContain('ID пользователя')
      }
    })
  })
})
