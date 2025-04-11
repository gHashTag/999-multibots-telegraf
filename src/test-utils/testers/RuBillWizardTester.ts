import { TelegramSceneTester } from '../core/TelegramSceneTester'
import { getRuBillWizard } from '@/scenes/getRuBillWizard'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { createMockFn } from '../mocks/telegrafMock'
import { logger } from '@/utils/logger'
import { inngestMock } from '../mocks/telegrafMock'

/**
 * Тестер для сцены RuBillWizard
 */
export class RuBillWizardTester extends TelegramSceneTester {
  // Моки для функций
  createPaymentMock = createMockFn()
  updateUserSubscriptionMock = createMockFn()
  getInvoiceIdMock = createMockFn()
  generateUniqueShortInvIdMock = createMockFn()

  constructor() {
    super(getRuBillWizard)

    // Настраиваем моки по умолчанию
    this.createPaymentMock.mockResolvedValue({
      id: 'mock-payment-id',
      created_at: new Date().toISOString(),
    })

    this.updateUserSubscriptionMock.mockResolvedValue(true)

    this.getInvoiceIdMock.mockResolvedValue(
      'https://mock-robokassa.test/invoice/12345'
    )

    this.generateUniqueShortInvIdMock.mockResolvedValue(12345)

    // Сохраняем оригинальные функции, чтобы восстановить их после тестов
    this.setupMocks()
  }

  /**
   * Настраивает моки для тестирования
   */
  private setupMocks(): void {
    try {
      // Используем динамический импорт для мокирования модулей
      jest.mock('@/core/supabase', () => ({
        createPayment: this.createPaymentMock,
        updateUserSubscription: this.updateUserSubscriptionMock,
      }))

      jest.mock('@/scenes/getRuBillWizard/helper', () => ({
        ...jest.requireActual('@/scenes/getRuBillWizard/helper'),
        getInvoiceId: this.getInvoiceIdMock,
        generateUniqueShortInvId: this.generateUniqueShortInvIdMock,
        merchantLogin: 'test-merchant',
        password1: 'test-password',
        useTestMode: true,
      }))
    } catch (error) {
      logger.error('❌ Ошибка при настройке моков:', {
        description: 'Error setting up mocks',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Создает тестовый контекст с данными для создания счета
   * @param options Дополнительные параметры контекста
   * @returns Мок-контекст
   */
  createInvoiceContext(
    options: {
      userId?: number
      amount?: number
      stars?: number
      subscription?: string
      email?: string
    } = {}
  ): MyContext {
    const {
      userId = 12345678,
      amount = 100,
      stars = 100,
      subscription = 'neuroblogger',
      email = 'test@example.com',
    } = options

    return this.createContext({
      userId,
      username: 'test_user',
      sessionData: {
        selectedPayment: {
          amount,
          stars,
          subscription,
        },
        email,
      },
    })
  }

  /**
   * Тестирует успешный сценарий создания счета
   */
  async testSuccessfulInvoice(): Promise<boolean> {
    const context = this.createInvoiceContext()

    // Запускаем первый шаг сцены (генерация счета)
    await this.runStep(0, context)

    // Проверяем вызовы функций
    const createPaymentCalled = this.createPaymentMock.mock.calls.some(call => {
      const args = call[0] || {}
      return (
        args.telegram_id === '12345678' &&
        args.amount === 100 &&
        args.stars === 100 &&
        args.subscription === 'neuroblogger' &&
        args.status === 'PENDING'
      )
    })

    if (!createPaymentCalled) {
      logger.error('❌ createPayment не был вызван с ожидаемыми параметрами', {
        description: 'createPayment was not called with expected parameters',
        calls: this.createPaymentMock.mock.calls,
      })
      return false
    }

    // Проверяем вызов updateUserSubscription
    const updateSubscriptionCalled =
      this.updateUserSubscriptionMock.mock.calls.some(
        call => call[0] === '12345678' && call[1] === 'neuroblogger'
      )

    if (!updateSubscriptionCalled) {
      logger.error(
        '❌ updateUserSubscription не был вызван с ожидаемыми параметрами',
        {
          description:
            'updateUserSubscription was not called with expected parameters',
          calls: this.updateUserSubscriptionMock.mock.calls,
        }
      )
      return false
    }

    // Проверяем вызов inngest.send
    const inngestSendCalled = inngestMock.send.mock.calls.some(call => {
      const args = call[0] || {}
      return (
        args.name === 'payment/process' &&
        args.data?.telegram_id === '12345678' &&
        args.data?.amount === 100 &&
        args.data?.stars === 100 &&
        args.data?.type === 'money_income'
      )
    })

    if (!inngestSendCalled) {
      logger.error('❌ inngest.send не был вызван с ожидаемыми параметрами', {
        description: 'inngest.send was not called with expected parameters',
        calls: inngestMock.send.mock.calls,
      })
      return false
    }

    // Проверяем отправку сообщения пользователю с ссылкой на оплату
    if (!this.hasUrlButton(context, 'robokassa')) {
      logger.error('❌ Сообщение с ссылкой на оплату не было отправлено', {
        description: 'Payment link message was not sent',
        sentReplies: (context as any).sentReplies,
      })
      return false
    }

    logger.info('✅ Тест успешного создания счета пройден', {
      description: 'Successful invoice test passed',
    })

    return true
  }

  /**
   * Тестирует сценарий обработки ошибки при создании счета
   */
  async testErrorHandling(): Promise<boolean> {
    // Очищаем мок и имитируем ошибку
    this.createPaymentMock.mockReset()
    this.createPaymentMock.mockRejectedValue(
      new Error('Ошибка сохранения платежа')
    )

    const context = this.createInvoiceContext({
      userId: 87654321,
      amount: 50,
      stars: 50,
    })

    // Запускаем шаг сцены, который должен обработать ошибку
    await this.runStep(0, context)

    // Проверяем, что было отправлено сообщение об ошибке
    if (!this.hasMessageWithText(context, 'Ошибка при создании чека')) {
      logger.error('❌ Сообщение об ошибке не было отправлено', {
        description: 'Error message was not sent',
        sentReplies: (context as any).sentReplies,
      })
      return false
    }

    logger.info('✅ Тест обработки ошибки пройден', {
      description: 'Error handling test passed',
    })

    return true
  }

  /**
   * Очищает все моки и состояние тестера
   */
  cleanup(): void {
    // Сбрасываем состояние моков
    this.createPaymentMock.mockReset()
    this.updateUserSubscriptionMock.mockReset()
    this.getInvoiceIdMock.mockReset()
    this.generateUniqueShortInvIdMock.mockReset()

    // Сбрасываем Jest моки
    jest.resetModules()
    jest.resetAllMocks()
  }
}
