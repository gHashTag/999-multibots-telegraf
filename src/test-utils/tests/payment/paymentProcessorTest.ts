import { InngestFunctionTester } from '../../testers/InngestFunctionTester'
import assert from '../../core/assert'
import {
  InngestTestMethod,
  InngestTestResult,
} from '../../testers/InngestFunctionTester'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/price/helpers/modelsCost'

/**
 * Модуль содержит тесты для функции обработки платежей (paymentProcessor)
 *
 * Тесты проверяют:
 * 1. Обработку операций пополнения баланса
 * 2. Обработку операций списания средств
 *
 * Для запуска используйте:
 * - npm run test:payment
 * - npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=payment
 *
 * @module src/test-utils/tests/payment/paymentProcessorTest
 */

// Создание тестера
const tester = new InngestFunctionTester({
  verbose: true,
})

/**
 * Тест функции пополнения баланса
 *
 * Проверяет работу paymentProcessor с операцией типа 'money_income'
 * Используется для тестирования пополнения баланса
 */
export async function testPaymentProcessorIncome(): Promise<InngestTestResult> {
  logger.info({
    message: '🧪 Запуск теста функции пополнения баланса',
    description: 'Testing payment processor income function',
  })

  const result = await tester.runTest({
    method: InngestTestMethod.PaymentProcessorIncome,
    data: {
      service_type: ModeEnum.TopUpBalance,
    },
  })

  assert.assert(result.success, 'Тест пополнения баланса должен быть успешным')

  return result
}

/**
 * Тест функции списания средств
 *
 * Проверяет работу paymentProcessor с операцией типа 'money_expense'
 * Используется для тестирования списания средств с баланса
 */
export async function testPaymentProcessorExpense(): Promise<InngestTestResult> {
  logger.info({
    message: '🧪 Запуск теста функции списания средств',
    description: 'Testing payment processor expense function',
  })

  const result = await tester.runTest({
    method: InngestTestMethod.PaymentProcessorExpense,
    data: {
      service_type: ModeEnum.TextToImage,
    },
  })

  assert.assert(result.success, 'Тест списания средств должен быть успешным')

  return result
}

/**
 * Запуск всех тестов платежного процессора
 *
 * Запускает все тесты для платежного процессора и собирает результаты.
 * Используется для интеграции с основной системой тестирования.
 *
 * @returns Массив результатов тестов
 */
export async function runPaymentProcessorTests(): Promise<InngestTestResult[]> {
  logger.info({
    message: '🧪 Запуск всех тестов платежного процессора',
    description: 'Running all payment processor tests',
  })

  const startTime = Date.now()
  const results: InngestTestResult[] = []

  try {
    // Запускаем тест пополнения баланса
    results.push(await testPaymentProcessorIncome())

    // Запускаем тест списания средств
    results.push(await testPaymentProcessorExpense())

    // Считаем статистику
    const successCount = results.filter(r => r.success).length
    const totalCount = results.length
    const duration = Date.now() - startTime

    logger.info({
      message: `✅ Тесты платежного процессора завершены: ${successCount}/${totalCount} успешно`,
      description: 'Payment processor tests completed',
      success: successCount,
      total: totalCount,
      duration,
    })
  } catch (error) {
    const duration = Date.now() - startTime

    logger.error({
      message: '❌ Ошибка при выполнении тестов платежного процессора',
      description: 'Error running payment processor tests',
      error: error instanceof Error ? error.message : String(error),
      duration,
    })

    results.push({
      success: false,
      message: 'Ошибка при выполнении тестов платежного процессора',
      error: error instanceof Error ? error : String(error),
    })
  }

  return results
}
