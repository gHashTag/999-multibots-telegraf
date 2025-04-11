import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { createMockFn } from '@/test-utils/mocks/telegrafMock'
import { TEST_CONFIG } from '@/test-utils/test-config'
import { inngestTestEngine } from '@/test-utils/test-config'
import { TransactionType } from '@/interfaces/payments.interface'
import { createSuccessfulPayment } from '@/inngest-functions/paymentProcessor'
import { getRandomUser } from '@/test-utils/helpers/getRandomUser'
import { generateUniqueId } from '@/test-utils/helpers/generateUniqueId'
import { getPaymentReceiptUrl } from '@/helpers/getPaymentReceiptUrl'

/**
 * Тест создания простого чека для тестирования
 * @returns TestResult - результат выполнения теста
 */
export async function testSimpleReceiptGeneration(): Promise<TestResult> {
  logger.info('🔍 Начало теста генерации простого чека', {
    description: 'Starting simple receipt generation test',
  })

  try {
    // Создаем тестового пользователя и контекст
    const user = getRandomUser()
    const ctx = createMockContext({
      user: user,
      text: '/receipt',
    })

    // Данные для тестовой оплаты
    const paymentData = {
      operation_id: generateUniqueId(),
      telegram_id: user.telegram_id,
      amount: 100,
      stars: 100,
      type: 'money_income',
      description: 'Тестовый платеж',
      payment_method: 'test',
      status: 'COMPLETED',
      bot_name: 'test_bot',
      service_type: 'TopUpBalance',
    }

    // Создаем тестовый платеж
    logger.info('💵 Создание тестового платежа', {
      description: 'Creating test payment',
      payment: paymentData,
    })

    // Создаем платеж в БД
    const payment = await createSuccessfulPayment(paymentData)

    logger.info('✅ Тестовый платеж успешно создан', {
      description: 'Test payment successfully created',
      payment_id: payment.id,
    })

    // Получаем URL чека
    const receiptUrl = await getPaymentReceiptUrl(payment.id)

    logger.info('🧾 Получен URL чека', {
      description: 'Receipt URL retrieved',
      url: receiptUrl,
    })

    // Проверяем, что URL содержит правильный формат
    if (!receiptUrl || !receiptUrl.includes('/receipt/')) {
      return {
        success: false,
        message: `Некорректный URL чека: ${receiptUrl}`,
        name: 'Тест генерации простого чека',
      }
    }

    return {
      success: true,
      message: 'Чек успешно сгенерирован',
      name: 'Тест генерации простого чека',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка в тесте генерации простого чека', {
      description: 'Error in simple receipt generation test',
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      message: `Ошибка: ${error.message}`,
      name: 'Тест генерации простого чека',
    }
  }
}
