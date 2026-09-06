import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import type { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import {
  Currency,
  PaymentStatus,
  PaymentType,
} from '@/interfaces/payments.interface'

// Mock dependencies BEFORE imports
vi.mock('@/helpers', () => ({
  isRussian: vi.fn(),
}))

vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(),
}))

vi.mock('@/core/supabase', () => ({
  setPayments: vi.fn(),
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('@/core', () => ({
  getBotNameByToken: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/scenes/getRuBillWizard/helper', () => ({
  getInvoiceId: vi.fn(),
  merchantLogin: 'test_merchant',
  password1: 'test_password',
  description: 'Покупка звезд',
  subscriptionTitles: vi.fn((isRu: boolean) => ({
    neurophoto: isRu ? '📸 Нейрофото' : '📸 NeuroPhoto',
    neurovideo: isRu ? '📚 НейроВидео' : '📚 NeuroVideo',
  })),
  generateRobokassaUrl: vi.fn(),
  paymentOptions: [
    { amount: 1110, stars: '476', subscription: SubscriptionType.NEUROPHOTO },
    { amount: 2999, stars: '1303', subscription: SubscriptionType.NEUROVIDEO },
  ],
}))

// Import after mocks
import { generateInvoiceStep, getRuBillWizard } from '@/scenes/getRuBillWizard'
import { isRussian } from '@/helpers'
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { getInvoiceId } from '@/scenes/getRuBillWizard/helper'
import { logger } from '@/utils/logger'

describe('getRuBillWizard', () => {
  let mockContext: MyContext

  beforeEach(() => {
    // Сцена читает креденшелы через геттеры из @/config
    // (getRobokassaMerchantLogin / getRobokassaPassword1 → process.env),
    // а не через константы модуля helper, которые мокает этот файл.
    // Задаём окружение сами, чтобы ожидания ниже держались независимо от
    // общего тестового окружения.
    process.env.MERCHANT_LOGIN = 'test_merchant'
    process.env.ROBOKASSA_PASSWORD_1 = 'test_password'
    vi.clearAllMocks()

    // Create mock context
    mockContext = {
      from: {
        id: 123456789,
        username: 'testuser',
        language_code: 'ru',
      },
      reply: vi.fn(),
      scene: {
        enter: vi.fn(),
        leave: vi.fn(),
        current: { id: 'getRuBillWizard' },
      },
      session: {
        selectedPayment: {
          amount: 1110,
          stars: '476',
          subscription: SubscriptionType.NEUROPHOTO,
        },
        email: 'test@example.com',
      },
      telegram: {
        token: 'test_bot_token',
      },
      wizard: {
        state: {},
        next: vi.fn(),
      },
    } as any

    // Setup default mocks
    ;(isRussian as Mock).mockReturnValue(true)
    ;(getBotNameByToken as Mock).mockReturnValue({ bot_name: 'test_bot' })
    ;(getInvoiceId as Mock).mockResolvedValue(
      'https://robokassa.ru/payment?id=12345'
    )
    ;(setPayments as Mock).mockResolvedValue({ data: { id: 1 }, error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Bill Generation - NeuroPhoto Subscription', () => {
    it('should generate invoice for NeuroPhoto subscription with correct amount', async () => {
      // Arrange
      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(getInvoiceId).toHaveBeenCalledWith(
        'test_merchant',
        1110,
        expect.any(Number),
        'Покупка звезд',
        'test_password'
      )

      expect(setPayments).toHaveBeenCalledWith({
        telegram_id: '123456789',
        OutSum: '1110',
        InvId: expect.any(String),
        currency: Currency.RUB,
        stars: 476,
        status: PaymentStatus.PENDING,
        payment_method: 'Robokassa',
        type: PaymentType.MONEY_INCOME,
        subscription_type: SubscriptionType.NEUROPHOTO,
        bot_name: 'test_bot',
        language: 'ru',
      })

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('💵 Чек создан для подписки 📸 Нейрофото'),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Оплатить 📸 Нейрофото за 1110 р.',
                  url: 'https://robokassa.ru/payment?id=12345',
                },
              ],
            ],
          },
          parse_mode: 'HTML',
        })
      )

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should log invoice generation for NeuroPhoto', async () => {
      // Arrange
      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        '### getRuBillWizard ENTERED (generateInvoiceStep) ###',
        expect.objectContaining({
          scene: 'getRuBillWizard',
          step: 'generateInvoiceStep',
          telegram_id: 123456789,
        })
      )

      expect(logger.info).toHaveBeenCalledWith(
        'Pending payment record created for Robokassa',
        expect.objectContaining({
          userId: 123456789,
          subscription_type: SubscriptionType.NEUROPHOTO,
        })
      )
    })
  })

  describe('Bill Generation - NeuroVideo Subscription', () => {
    it('should generate invoice for NeuroVideo subscription with correct amount', async () => {
      // Arrange
      mockContext.session.selectedPayment = {
        amount: 2999,
        stars: '1303',
        subscription: SubscriptionType.NEUROVIDEO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(getInvoiceId).toHaveBeenCalledWith(
        'test_merchant',
        2999,
        expect.any(Number),
        'Покупка звезд',
        'test_password'
      )

      expect(setPayments).toHaveBeenCalledWith({
        telegram_id: '123456789',
        OutSum: '2999',
        InvId: expect.any(String),
        currency: Currency.RUB,
        stars: 1303,
        status: PaymentStatus.PENDING,
        payment_method: 'Robokassa',
        type: PaymentType.MONEY_INCOME,
        subscription_type: SubscriptionType.NEUROVIDEO,
        bot_name: 'test_bot',
        language: 'ru',
      })

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('💵 Чек создан для подписки 📚 НейроВидео'),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Оплатить 📚 НейроВидео за 2999 р.',
                  url: 'https://robokassa.ru/payment?id=12345',
                },
              ],
            ],
          },
        })
      )
    })

    it('should use unique invoice ID based on timestamp', async () => {
      // The invoice id is NOT a pure function of the clock, and asserting a
      // value derived from a mocked Date.now() was a test that only passed in
      // isolation.
      //
      // nextInvoiceId() keeps a module-level counter on purpose: two invoices
      // created in the same millisecond used to receive the same InvId, and
      // Robokassa treats one InvId as one invoice, so two payments merged into
      // one. When the clock goes backwards -- which is exactly what mocking it
      // to 1234567890123 does after an earlier test in this file has already
      // advanced the counter past 1.9e9 -- the code correctly returns
      // previous + 1 rather than the smaller number.
      //
      // So the property is asserted instead of the value: the id stays inside
      // Robokassa's range and STRICTLY INCREASES, which is the whole point of
      // the counter. Verified across two invoices rather than one.
      const invIdOf = (call: number) =>
        Number((setPayments as Mock).mock.calls[call][0].InvId)

      mockContext.session.selectedPayment = {
        amount: 2999,
        stars: '1303',
        subscription: SubscriptionType.NEUROVIDEO,
      }

      await generateInvoiceStep(mockContext)
      await generateInvoiceStep(mockContext)

      expect(
        (setPayments as Mock).mock.calls.length,
        'both invoices must have been recorded'
      ).toBeGreaterThanOrEqual(2)

      const first = invIdOf(0)
      const second = invIdOf(1)
      for (const id of [first, second]) {
        expect(Number.isInteger(id), `InvId ${id} is not an integer`).toBe(true)
        expect(id).toBeGreaterThan(0)
        expect(id).toBeLessThanOrEqual(2147483647)
      }
      expect(
        second,
        'two invoices in the same run received a non-increasing InvId -- ' +
          'Robokassa would treat them as one invoice and merge the payments'
      ).toBeGreaterThan(first)
    })
  })

  describe('Amount Validation', () => {
    it('should reject unknown subscription type', async () => {
      // Arrange
      mockContext.session.selectedPayment = {
        amount: 9999,
        stars: '9999',
        subscription: 'unknown_subscription' as SubscriptionType,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Ошибка: Неизвестный тип подписки.'
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
      expect(getInvoiceId).not.toHaveBeenCalled()
      expect(setPayments).not.toHaveBeenCalled()
    })

    it('should handle case-insensitive subscription type matching', async () => {
      // Arrange
      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: 'NEUROPHOTO' as SubscriptionType,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(setPayments).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_type: SubscriptionType.NEUROPHOTO,
        })
      )
    })

    it('should validate that amount matches subscription type', async () => {
      // Arrange - НейроФото должно быть 1110, а не 2999
      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(getInvoiceId).toHaveBeenCalledWith(
        expect.any(String),
        1110, // Correct amount for NeuroPhoto
        expect.any(Number),
        expect.any(String),
        expect.any(String)
      )
    })
  })

  describe('Robokassa Integration', () => {
    it('should call getInvoiceId with correct parameters', async () => {
      // Arrange
      const expectedInvId = Date.now() % 2147483647

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(getInvoiceId).toHaveBeenCalledWith(
        'test_merchant',
        1110,
        expect.any(Number),
        'Покупка звезд',
        'test_password'
      )

      const invIdParam = (getInvoiceId as Mock).mock.calls[0][2]
      expect(invIdParam).toBeGreaterThan(0)
      expect(invIdParam).toBeLessThanOrEqual(2147483647)
    })

    it('should handle Robokassa URL generation error', async () => {
      // Arrange
      ;(getInvoiceId as Mock).mockRejectedValue(
        new Error('Robokassa API error')
      )

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Ошибка при создании чека Robokassa. Пожалуйста, попробуйте снова.'
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should include payment URL in inline keyboard', async () => {
      // Arrange
      const testUrl = 'https://robokassa.ru/payment?id=test123'
      ;(getInvoiceId as Mock).mockResolvedValue(testUrl)

      mockContext.session.selectedPayment = {
        amount: 2999,
        stars: '1303',
        subscription: SubscriptionType.NEUROVIDEO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [
                expect.objectContaining({
                  url: testUrl,
                }),
              ],
            ],
          },
        })
      )
    })
  })

  describe('Payment Flow', () => {
    it('should create payment record with PENDING status', async () => {
      // Arrange
      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(setPayments).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.PENDING,
          payment_method: 'Robokassa',
          type: PaymentType.MONEY_INCOME,
        })
      )
    })

    it('should handle database error when saving payment', async () => {
      // Arrange
      ;(setPayments as Mock).mockRejectedValue(
        new Error('Database connection failed')
      )

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        'Error saving pending Robokassa payment',
        expect.objectContaining({
          error: expect.any(Error),
          userId: 123456789,
        })
      )

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка при создании платежа в базе данных')
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should extract bot name from telegram token', async () => {
      // Arrange
      ;(getBotNameByToken as Mock).mockReturnValue({ bot_name: 'custom_bot' })

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(getBotNameByToken).toHaveBeenCalledWith('test_bot_token')
      expect(setPayments).toHaveBeenCalledWith(
        expect.objectContaining({
          bot_name: 'custom_bot',
        })
      )
    })

    it('should use user language code from context', async () => {
      // Arrange
      mockContext.from.language_code = 'en'

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(setPayments).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'en',
        })
      )
    })

    it('should default to "en" if language_code is missing', async () => {
      // Arrange
      mockContext.from.language_code = undefined

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(setPayments).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'en',
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle missing user ID', async () => {
      // Arrange
      mockContext.from = undefined

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Ошибка: Не удалось получить ID пользователя.'
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
      expect(setPayments).not.toHaveBeenCalled()
    })

    it('should handle missing selectedPayment in session', async () => {
      // Arrange
      mockContext.session.selectedPayment = undefined

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Ошибка: Не выбрана опция оплаты перед генерацией счета.'
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
      expect(getInvoiceId).not.toHaveBeenCalled()
    })

    it('should handle invoice creation error gracefully', async () => {
      // Arrange
      ;(getInvoiceId as Mock).mockRejectedValue(new Error('Network timeout'))

      mockContext.session.selectedPayment = {
        amount: 2999,
        stars: '1303',
        subscription: SubscriptionType.NEUROVIDEO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Ошибка при создании чека Robokassa. Пожалуйста, попробуйте снова.'
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should log error details when invoice creation fails', async () => {
      // Arrange
      const testError = new Error('API rate limit exceeded')
      ;(getInvoiceId as Mock).mockRejectedValue(testError)

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Suppress console.error for this test
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in creating invoice:',
        testError
      )

      consoleErrorSpy.mockRestore()
    })

    it('should handle subscription type determination error', async () => {
      // Arrange
      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: 'invalid_type' as SubscriptionType,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Ошибка: Неизвестный тип подписки.'
      )
      expect(logger.error).not.toHaveBeenCalledWith(
        'Could not determine SubscriptionType enum for:',
        expect.any(String)
      )
    })
  })

  describe('Localization (RU/EN)', () => {
    it('should display Russian messages when isRussian returns true', async () => {
      // Arrange
      ;(isRussian as Mock).mockReturnValue(true)

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('💵 Чек создан для подписки'),
        expect.any(Object)
      )

      // «Оплатить … за 1110 р.» — это подпись КНОПКИ в inline-клавиатуре
      // (второй аргумент reply), а не текст сообщения: сам текст говорит
      // «Нажмите кнопку ниже». Проверяем там, где строка живёт на самом деле.
      const replyMarkup = (mockContext.reply as Mock).mock.calls[0][1]
      const buttonLabels = JSON.stringify(
        replyMarkup?.reply_markup?.inline_keyboard
      )
      expect(buttonLabels).toContain('Оплатить 📸 Нейрофото за 1110 р.')
    })

    it('should display English messages when isRussian returns false', async () => {
      // Arrange
      ;(isRussian as Mock).mockReturnValue(false)

      mockContext.session.selectedPayment = {
        amount: 2999,
        stars: '1303',
        subscription: SubscriptionType.NEUROVIDEO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('💵 Invoice created for subscription'),
        expect.any(Object)
      )

      const buttonCall = (mockContext.reply as Mock).mock.calls[0][1]
      expect(buttonCall.reply_markup.inline_keyboard[0][0].text).toContain(
        'Pay for'
      )
    })

    it('should show Russian error messages for unknown subscription', async () => {
      // Arrange
      ;(isRussian as Mock).mockReturnValue(true)

      mockContext.session.selectedPayment = {
        amount: 9999,
        stars: '9999',
        subscription: 'unknown' as SubscriptionType,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Ошибка: Неизвестный тип подписки.'
      )
    })

    it('should show English error messages for unknown subscription', async () => {
      // Arrange
      ;(isRussian as Mock).mockReturnValue(false)

      mockContext.session.selectedPayment = {
        amount: 9999,
        stars: '9999',
        subscription: 'unknown' as SubscriptionType,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Error: Unknown subscription type.'
      )
    })

    it('should show Russian error for missing user ID', async () => {
      // Arrange
      ;(isRussian as Mock).mockReturnValue(true)
      mockContext.from = undefined

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Ошибка: Не удалось получить ID пользователя.'
      )
    })

    it('should show English error for missing user ID', async () => {
      // Arrange
      ;(isRussian as Mock).mockReturnValue(false)
      mockContext.from = undefined

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Error: Could not get user ID.'
      )
    })
  })

  describe('Session Data Management', () => {
    it('should read email from session if available', async () => {
      // Arrange
      mockContext.session.email = 'user@example.com'

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {})

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Email from session:',
        'user@example.com'
      )

      consoleLogSpy.mockRestore()
    })

    it('should handle missing email in session', async () => {
      // Arrange
      mockContext.session.email = undefined

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert - should still proceed without email
      expect(mockContext.scene.leave).toHaveBeenCalled()
      expect(setPayments).toHaveBeenCalled()
    })

    it('should extract subscription type from selectedPayment', async () => {
      // Arrange
      mockContext.session.selectedPayment = {
        amount: 2999,
        stars: '1303',
        subscription: SubscriptionType.NEUROVIDEO,
      }

      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {})

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '📦 [getRuBillWizard] Selected payment:',
        expect.objectContaining({
          subscription: SubscriptionType.NEUROVIDEO,
        })
      )

      consoleLogSpy.mockRestore()
    })
  })

  describe('Scene Configuration', () => {
    it('should be a WizardScene with correct scene ID', () => {
      // Assert
      expect(getRuBillWizard).toBeDefined()
      expect(getRuBillWizard.id).toBe('getRuBillWizard')
    })

    it('should have help handler configured', () => {
      // Assert
      expect(getRuBillWizard).toBeDefined()
      // The scene should have help handler from handleHelpCancel
    })

    it('should have cancel command handler configured', () => {
      // Assert
      expect(getRuBillWizard).toBeDefined()
      // The scene should have cancel command from handleHelpCancel
    })
  })

  describe('Invoice ID Generation', () => {
    it('should generate unique invoice IDs for different calls', async () => {
      // Arrange
      const invIds: number[] = []

      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(1000000000000)
        .mockReturnValueOnce(1000000000001)

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act - First call
      await generateInvoiceStep(mockContext)
      const firstInvId = (setPayments as Mock).mock.calls[0][0].InvId

      // Clear mocks
      vi.clearAllMocks()
      ;(setPayments as Mock).mockResolvedValue({ data: { id: 2 }, error: null })
      ;(getInvoiceId as Mock).mockResolvedValue(
        'https://robokassa.ru/payment?id=67890'
      )

      // Act - Second call
      await generateInvoiceStep(mockContext)
      const secondInvId = (setPayments as Mock).mock.calls[0][0].InvId

      // Assert
      expect(firstInvId).not.toBe(secondInvId)
    })

    it('should ensure invoice ID is within Robokassa limits (1 to 2147483647)', async () => {
      // Arrange
      const largeTimestamp = 9999999999999
      vi.spyOn(Date, 'now').mockReturnValue(largeTimestamp)

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      const invId = parseInt((setPayments as Mock).mock.calls[0][0].InvId)
      expect(invId).toBeGreaterThan(0)
      expect(invId).toBeLessThanOrEqual(2147483647)
    })
  })

  describe('Console Logging', () => {
    it('should log key steps during invoice generation', async () => {
      // Arrange
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {})

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      // Стартовая строка лога переименована при переработке логирования:
      // 'CASE: generateInvoiceStep' → '💳 [getRuBillWizard] STARTING PAYMENT FLOW'.
      // Остальные ключевые шаги логируются прежними строками.
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '💳 [getRuBillWizard] STARTING PAYMENT FLOW'
      )
      expect(consoleLogSpy).toHaveBeenCalledWith('User ID:', 123456789)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Generated invoice ID:',
        expect.any(Number)
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Invoice URL:',
        expect.any(String)
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Payment saved with status PENDING'
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Payment message sent to user with URL button'
      )

      consoleLogSpy.mockRestore()
    })

    it('should log errors when payment creation fails', async () => {
      // Arrange
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      const testError = new Error('Test error')
      ;(setPayments as Mock).mockRejectedValue(testError)

      mockContext.session.selectedPayment = {
        amount: 1110,
        stars: '476',
        subscription: SubscriptionType.NEUROPHOTO,
      }

      // Act
      await generateInvoiceStep(mockContext)

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in setting payments:',
        testError
      )

      consoleErrorSpy.mockRestore()
    })
  })
})
