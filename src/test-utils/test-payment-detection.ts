import { isRubPayment } from '../price/helpers/costHelpers'
import { logger } from '../utils/logger'

/**
 * Тестирование функции определения рублёвых платежей
 */
const testPaymentDetection = async () => {
  logger.info('🚀 Запуск теста определения рублёвых платежей:', {
    description: 'Starting payment detection test',
  })

  // Создаем тестовые платежи разных типов
  const testPayments = [
    {
      id: 1,
      description: 'Явное пополнение в рублях',
      payment: {
        amount: 1000,
        stars: 434,
        currency: 'RUB',
        payment_method: null,
      },
      expectedResult: true,
    },
    {
      id: 2,
      description: 'Пополнение через Robokassa',
      payment: {
        amount: 500,
        stars: 217,
        currency: 'STARS',
        payment_method: 'Robokassa',
      },
      expectedResult: true,
    },
    {
      id: 3,
      description: 'Прямое пополнение звезд',
      payment: {
        amount: 1000,
        stars: 1000,
        currency: 'STARS',
        payment_method: null,
      },
      expectedResult: false,
    },
    {
      id: 4,
      description: 'Бонусное начисление',
      payment: {
        amount: 100,
        stars: 100,
        currency: 'STARS',
        payment_method: 'system',
      },
      expectedResult: false,
    },
    {
      id: 5,
      description: 'Звёзды по стандартному курсу, но без маркировки RUB',
      payment: {
        amount: 1000,
        stars: 434,
        currency: 'STARS',
        payment_method: null,
      },
      expectedResult: false, // Теперь это будет false, так как мы не проверяем соотношение
    },
  ]

  // Проверяем каждый тестовый платеж
  let passedTests = 0
  let failedTests = 0

  for (const test of testPayments) {
    const result = isRubPayment(test.payment)
    const passed = result === test.expectedResult

    if (passed) {
      passedTests++
      logger.info(`✅ Тест #${test.id} пройден:`, {
        description: `Test #${test.id} passed`,
        testCase: test.description,
        expected: test.expectedResult,
        actual: result,
      })
    } else {
      failedTests++
      logger.error(`❌ Тест #${test.id} не пройден:`, {
        description: `Test #${test.id} failed`,
        testCase: test.description,
        expected: test.expectedResult,
        actual: result,
        payment: test.payment,
      })
    }
  }

  logger.info(`🏁 Результаты тестирования:`, {
    description: 'Test results',
    total: testPayments.length,
    passed: passedTests,
    failed: failedTests,
    success_rate: `${((passedTests / testPayments.length) * 100).toFixed(2)}%`,
  })
}

// Запуск теста
testPaymentDetection().catch(error => {
  logger.error('❌ Ошибка при выполнении теста:', {
    description: 'Error running test',
    error: error instanceof Error ? error.message : String(error),
  })
})
