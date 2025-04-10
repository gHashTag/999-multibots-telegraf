import { logger } from '@/utils/logger'
import { TEST_CONFIG } from '../../test-config'
import { TestResult } from '../../types'
import { InngestTestEngineMock } from '../../test-config'
import { ModeEnum } from '@/price/helpers/modelsCost'

/**
 * Модуль содержит тесты для функции обработки платежей (paymentProcessor)
 *
 * Тесты проверяют:
 * 1. Обработку операций пополнения баланса
 * 2. Обработку операций списания средств
 * 3. Обработку платежей с использованием моков
 *
 * Для запуска используйте:
 * - npm run test:payment
 * - npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=payment
 *
 * @module src/test-utils/tests/payment/paymentProcessorTest
 */

// Создаем экземпляр тестового движка
const inngestTestEngine = new InngestTestEngineMock()

/**
 * Тестирует пополнение баланса через процессор платежей
 * @returns Результат теста
 */
export async function testPaymentProcessorIncome(): Promise<TestResult> {
  const testName = 'Тест пополнения баланса через процессор платежей'
  const startTime = Date.now()

  logger.info('🧪 Запуск теста пополнения баланса', {
    description: 'Starting payment processor income test',
    test: testName,
  })

  try {
    // Подготовка данных для теста
    const paymentData = {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT,
      stars: TEST_CONFIG.TEST_DATA.TEST_STARS,
      type: 'money_income',
      description: 'Тестовое пополнение баланса',
      bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
      service_type: ModeEnum.TopUpBalance,
    }

    // Отправляем событие пополнения баланса
    const result = await inngestTestEngine.sendEvent(
      'payment/process',
      paymentData
    )

    // Проверяем результат
    if (!result) {
      throw new Error('Не удалось отправить событие payment/process')
    }

    const duration = Date.now() - startTime
    logger.info('✅ Тест пополнения баланса успешно выполнен', {
      description: 'Payment processor income test successfully completed',
      test: testName,
      duration,
    })

    return {
      success: true,
      name: testName,
      message: 'Пополнение баланса через процессор платежей работает корректно',
      details: {
        telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
        amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT,
        duration,
      },
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('❌ Ошибка при выполнении теста пополнения баланса', {
      description: 'Error executing payment processor income test',
      error: errorMessage,
      test: testName,
      duration,
    })

    return {
      success: false,
      name: testName,
      message: `Ошибка при пополнении баланса: ${errorMessage}`,
      details: {
        error: errorMessage,
        duration,
      },
    }
  }
}

/**
 * Тестирует списание средств через процессор платежей
 * @returns Результат теста
 */
export async function testPaymentProcessorExpense(): Promise<TestResult> {
  const testName = 'Тест списания средств через процессор платежей'
  const startTime = Date.now()

  logger.info('🧪 Запуск теста списания средств', {
    description: 'Starting payment processor expense test',
    test: testName,
  })

  try {
    // Подготовка данных для теста
    const paymentData = {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT / 2, // Используем половину суммы
      stars: TEST_CONFIG.TEST_DATA.TEST_STARS / 2, // Используем половину звезд
      type: 'money_expense',
      description: 'Тестовое списание средств',
      bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
      service_type: ModeEnum.TextToImage,
    }

    // Отправляем событие списания средств
    const result = await inngestTestEngine.sendEvent(
      'payment/process',
      paymentData
    )

    // Проверяем результат
    if (!result) {
      throw new Error('Не удалось отправить событие payment/process')
    }

    const duration = Date.now() - startTime
    logger.info('✅ Тест списания средств успешно выполнен', {
      description: 'Payment processor expense test successfully completed',
      test: testName,
      duration,
    })

    return {
      success: true,
      name: testName,
      message: 'Списание средств через процессор платежей работает корректно',
      details: {
        telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
        amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT / 2,
        duration,
      },
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('❌ Ошибка при выполнении теста списания средств', {
      description: 'Error executing payment processor expense test',
      error: errorMessage,
      test: testName,
      duration,
    })

    return {
      success: false,
      name: testName,
      message: `Ошибка при списании средств: ${errorMessage}`,
      details: {
        error: errorMessage,
        duration,
      },
    }
  }
}

/**
 * Тестирует обработку некорректного платежа (с отрицательной суммой)
 * @returns Результат теста
 */
export async function testPaymentProcessorNegativeAmount(): Promise<TestResult> {
  const testName = 'Тест обработки платежа с отрицательной суммой'
  const startTime = Date.now()

  logger.info('🧪 Запуск теста обработки некорректного платежа', {
    description: 'Starting invalid payment test',
    test: testName,
  })

  try {
    // Подготовка данных для теста с отрицательной суммой
    const paymentData = {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      amount: -50, // Отрицательная сумма
      stars: 50,
      type: 'money_income',
      description: 'Тестовый некорректный платеж',
      bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
      service_type: ModeEnum.TopUpBalance,
    }

    // Отправляем событие пополнения баланса
    const result = await inngestTestEngine.sendEvent(
      'payment/process',
      paymentData
    )

    // В этом тесте мы ожидаем ошибку, так что если результат успешный - тест не пройден
    if (result && result.success) {
      throw new Error('Платеж с отрицательной суммой был принят, это ошибка')
    }

    const duration = Date.now() - startTime
    logger.info('✅ Тест обработки некорректного платежа успешно выполнен', {
      description: 'Invalid payment test successfully completed',
      test: testName,
      duration,
    })

    return {
      success: true,
      name: testName,
      message:
        'Обработка некорректного платежа работает правильно (платеж отклонен)',
      details: {
        telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
        amount: -50,
        duration,
      },
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Проверяем, содержит ли сообщение об ошибке ожидаемый текст
    if (
      errorMessage.includes('сумма') &&
      errorMessage.includes('положительной')
    ) {
      logger.info('✅ Тест обработки некорректного платежа успешно выполнен', {
        description:
          'Invalid payment test successfully completed with expected error',
        test: testName,
        duration,
        error: errorMessage,
      })

      return {
        success: true,
        name: testName,
        message:
          'Обработка некорректного платежа работает правильно (ожидаемая ошибка получена)',
        details: {
          error: errorMessage,
          duration,
        },
      }
    }

    logger.error(
      '❌ Ошибка при выполнении теста обработки некорректного платежа',
      {
        description: 'Error executing invalid payment test',
        error: errorMessage,
        test: testName,
        duration,
      }
    )

    return {
      success: false,
      name: testName,
      message: `Неожиданная ошибка при тестировании некорректного платежа: ${errorMessage}`,
      details: {
        error: errorMessage,
        duration,
      },
    }
  }
}

/**
 * Запускает все тесты платежного процессора
 * @param options Опции запуска тестов
 * @returns Массив результатов тестов
 */
export async function runPaymentProcessorTests(
  options: { verbose?: boolean } = {}
): Promise<TestResult[]> {
  const startTime = Date.now()
  const results: TestResult[] = []

  logger.info('🚀 Запуск тестов платежного процессора', {
    description: 'Starting payment processor tests',
    verbose: options.verbose,
  })

  try {
    // Тест пополнения баланса
    const incomeResult = await testPaymentProcessorIncome()
    results.push(incomeResult)

    // Если пополнение прошло успешно, запускаем тест списания
    if (incomeResult.success) {
      const expenseResult = await testPaymentProcessorExpense()
      results.push(expenseResult)
    } else {
      logger.warn(
        '⚠️ Тест списания средств пропущен из-за ошибки в тесте пополнения',
        {
          description: 'Expense test skipped due to income test failure',
        }
      )

      // Добавляем пропущенный тест в результаты
      results.push({
        success: false,
        name: 'Тест списания средств через процессор платежей (пропущен)',
        message: 'Тест пропущен из-за ошибки в тесте пополнения баланса',
      })
    }

    // Запускаем тест обработки некорректного платежа
    const invalidResult = await testPaymentProcessorNegativeAmount()
    results.push(invalidResult)

    // Собираем статистику
    const duration = Date.now() - startTime
    const successfulTests = results.filter(r => r.success).length
    const totalTests = results.length

    logger.info('✅ Тесты платежного процессора завершены', {
      description: 'Payment processor tests completed',
      duration,
      successful: successfulTests,
      total: totalTests,
      success_rate: `${Math.round((successfulTests / totalTests) * 100)}%`,
    })

    return results
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('❌ Ошибка при запуске тестов платежного процессора', {
      description: 'Error running payment processor tests',
      error: errorMessage,
      duration,
    })

    // Возвращаем результат с ошибкой
    return [
      {
        success: false,
        name: 'Тесты платежного процессора',
        message: `Ошибка при запуске тестов: ${errorMessage}`,
      },
    ]
  }
}
