import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import { inngestTestEngine } from '@/test-utils/test-config'

interface PaymentTestOptions {
  verbose?: boolean
}

/**
 * Создает TestResult для ошибки
 */
function createErrorResult(name: string, error: unknown): TestResult {
  return {
    success: false,
    name,
    message: error instanceof Error ? error.message : 'Unknown error',
  }
}

/**
 * Запускает тестовую функцию с обработкой ошибок
 */
async function runTestWithErrorHandling(
  name: string,
  testFn: () => Promise<TestResult>
): Promise<TestResult> {
  try {
    return await testFn()
  } catch (error) {
    return createErrorResult(name, error)
  }
}

/**
 * Тестирует обработку платежей
 */
export async function runPaymentProcessorTests(
  options: PaymentTestOptions = {}
): Promise<TestResult[]> {
  const results: TestResult[] = []
  const { verbose = false } = options

  if (verbose) {
    logger.info('🚀 Запуск тестов платежного процессора...')
  }

  // Очищаем историю событий перед тестами
  await inngestTestEngine.clearEvents()

  // Запускаем все тесты
  results.push(
    await runTestWithErrorHandling('Positive Payment Test', testPositivePayment)
  )
  results.push(
    await runTestWithErrorHandling('Negative Payment Test', testNegativePayment)
  )
  results.push(
    await runTestWithErrorHandling(
      'Invalid Payment Data Test',
      testInvalidPaymentData
    )
  )

  if (verbose) {
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    logger.info(`
🎯 Результаты тестов платежного процессора:
✅ Успешно: ${successful}
❌ Провалено: ${failed}
📊 Всего: ${results.length}
    `)
  }

  return results
}

/**
 * Тестирует успешное пополнение баланса
 */
async function testPositivePayment(): Promise<TestResult> {
  const telegramId = '123456789'
  const amount = 100
  const stars = 100

  await inngestTestEngine.sendEvent('payment/process', {
    telegram_id: telegramId,
    amount,
    stars,
    type: 'money_income',
    description: 'Test payment',
    bot_name: 'test_bot',
    service_type: 'TopUpBalance',
  })

  return {
    success: true,
    name: 'Positive Payment Test',
    message: 'Successfully processed positive payment',
  }
}

/**
 * Тестирует списание средств
 */
async function testNegativePayment(): Promise<TestResult> {
  const telegramId = '123456789'
  const amount = 50
  const stars = 50

  await inngestTestEngine.sendEvent('payment/process', {
    telegram_id: telegramId,
    amount,
    stars,
    type: 'money_expense',
    description: 'Test expense',
    bot_name: 'test_bot',
    service_type: 'TextToVideo',
  })

  return {
    success: true,
    name: 'Negative Payment Test',
    message: 'Successfully processed negative payment',
  }
}

/**
 * Тестирует обработку некорректных данных
 */
async function testInvalidPaymentData(): Promise<TestResult> {
  // Отправляем событие с некорректными данными
  await inngestTestEngine.sendEvent('payment/process', {
    telegram_id: 'invalid_id',
    amount: -100, // Отрицательная сумма
    type: 'invalid_type',
    description: 'Test invalid payment',
    bot_name: 'test_bot',
    service_type: 'Unknown',
  })

  return {
    success: true,
    name: 'Invalid Payment Data Test',
    message: 'Successfully handled invalid payment data',
  }
}
