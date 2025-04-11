import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { getRuBillWizard } from '@/scenes/getRuBillWizard'
import { inngestMock } from '@/test-utils/mocks/telegrafMock'
import * as supabaseModule from '@/core/supabase'
import { createMockFn } from '@/test-utils/mocks/telegrafMock'
import * as helper from '@/scenes/getRuBillWizard/helper'

/**
 * Тестирует сцену создания счета RuBillWizard
 */
export async function testRuBillWizardScene(): Promise<TestResult> {
  logger.info('🚀 Начало теста RuBillWizard', {
    description: 'Starting RuBillWizard test',
  })

  // Сохраняем оригинальные функции, чтобы восстановить их после теста
  const originalCreatePayment = supabaseModule.createPayment
  const originalUpdateUserSubscription = supabaseModule.updateUserSubscription
  const originalGetInvoiceId = helper.getInvoiceId
  const originalGenerateUniqueShortInvId = helper.generateUniqueShortInvId

  try {
    // Создаем моки для использования в тесте
    const createPaymentMock = createMockFn().mockResolvedValue({
      id: 'mock-payment-id',
      created_at: new Date().toISOString(),
    })

    const updateUserSubscriptionMock = createMockFn().mockResolvedValue(true)

    const getInvoiceIdMock = createMockFn().mockResolvedValue(
      'https://mock-robokassa.test/invoice/12345'
    )

    const generateUniqueShortInvIdMock = createMockFn().mockResolvedValue(12345)

    // Заменяем реальные функции на моки
    supabaseModule.createPayment = createPaymentMock as any
    supabaseModule.updateUserSubscription = updateUserSubscriptionMock as any
    helper.getInvoiceId = getInvoiceIdMock as any
    helper.generateUniqueShortInvId = generateUniqueShortInvIdMock as any

    // 1. Тест успешного сценария
    logger.info('🧪 Тест успешного создания счета', {
      description: 'Test successful invoice creation',
    })

    // Создаем мок-контекст с нужными данными для сессии
    const mockContext = createMockContext({
      userId: 12345678,
      username: 'test_user',
      sessionData: {
        selectedPayment: {
          amount: 100,
          stars: 100,
          subscription: 'neuroblogger',
        },
        email: 'test@example.com',
      },
    })

    // Запускаем шаг сцены
    const step = getRuBillWizard.steps[0]
    await step(mockContext as any)

    // Проверяем результаты - было ли вызвано createPayment с правильными параметрами
    const createPaymentCalled = createPaymentMock.mock.calls.some(call => {
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
      throw new Error('createPayment не был вызван с ожидаемыми параметрами')
    }

    // Проверяем вызов updateUserSubscription
    const updateSubscriptionCalled = updateUserSubscriptionMock.mock.calls.some(
      call => call[0] === '12345678' && call[1] === 'neuroblogger'
    )

    if (!updateSubscriptionCalled) {
      throw new Error(
        'updateUserSubscription не был вызван с ожидаемыми параметрами'
      )
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
      throw new Error('inngest.send не был вызван с ожидаемыми параметрами')
    }

    // Проверяем отправку сообщения пользователю
    const sentReplies = (mockContext as any).sentReplies || []
    const hasPurchaseLink = sentReplies.some(
      (reply: any) =>
        reply.text.includes('🤑 Подписка') &&
        reply.extra?.reply_markup?.inline_keyboard?.[0]?.[0]?.url?.includes(
          'robokassa'
        )
    )

    if (!hasPurchaseLink) {
      throw new Error('Сообщение с ссылкой на оплату не было отправлено')
    }

    // 2. Тест обработки ошибок
    logger.info('🧪 Тест обработки ошибок при создании счета', {
      description: 'Test error handling in invoice creation',
    })

    // Очищаем мок и имитируем ошибку
    createPaymentMock.mockReset()
    createPaymentMock.mockRejectedValue(new Error('Ошибка сохранения платежа'))

    const errorMockContext = createMockContext({
      userId: 87654321,
      username: 'error_test_user',
      sessionData: {
        selectedPayment: {
          amount: 50,
          stars: 50,
        },
        email: 'error@example.com',
      },
    })

    // Запускаем шаг сцены, который должен обработать ошибку
    await step(errorMockContext as any)

    // Проверяем, что было отправлено сообщение об ошибке
    const errorSentReplies = (errorMockContext as any).sentReplies || []
    const hasErrorMessage = errorSentReplies.some((reply: any) =>
      reply.text.includes('Ошибка при создании чека')
    )

    if (!hasErrorMessage) {
      throw new Error('Сообщение об ошибке не было отправлено')
    }

    logger.info('✅ Тест RuBillWizard завершен успешно', {
      description: 'RuBillWizard test completed successfully',
    })

    return {
      success: true,
      message: 'Тест RuBillWizard успешно пройден',
      name: 'RuBillWizard Scene Test',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте RuBillWizard:', {
      description: 'Error in RuBillWizard test',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка теста RuBillWizard: ${error instanceof Error ? error.message : String(error)}`,
      name: 'RuBillWizard Scene Test',
    }
  } finally {
    // Восстанавливаем оригинальные функции
    supabaseModule.createPayment = originalCreatePayment
    supabaseModule.updateUserSubscription = originalUpdateUserSubscription
    helper.getInvoiceId = originalGetInvoiceId
    helper.generateUniqueShortInvId = originalGenerateUniqueShortInvId
  }
}
