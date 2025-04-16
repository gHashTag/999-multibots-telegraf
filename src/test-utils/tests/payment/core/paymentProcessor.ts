import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { PaymentTester } from '../utils/paymentTester'
import { TEST_PAYMENT_CONFIG } from '../test-config'
import { TransactionType } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Запускает тесты платежного процессора
 */
export async function runPaymentProcessorTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов платежного процессора', {
    description: 'Running payment processor tests',
  })

  const results: TestResult[] = []

  try {
    // Запускаем все тесты
    results.push(await testBasicPaymentProcessing())
    results.push(await testDuplicatePaymentHandling())
    results.push(await testInvalidAmountHandling())
    results.push(await testBalanceCheck())

    // Отчет о результатах
    const passedTests = results.filter(r => r.success).length
    const totalTests = results.length

    logger.info(
      `✅ Завершено ${passedTests}/${totalTests} тестов платежного процессора`,
      {
        description: 'Payment processor tests completed',
        passedTests,
        totalTests,
      }
    )

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов платежного процессора', {
      description: 'Error running payment processor tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return [
      {
        success: false,
        name: 'Payment Processor Tests',
        message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]
  }
}

async function testBasicPaymentProcessing(): Promise<TestResult> {
  const testName = 'Базовая обработка платежа'
  const tester = new PaymentTester()

  try {
    const telegramId = '123456789'
    const amount = TEST_PAYMENT_CONFIG.amounts.small

    // Создаем тестового пользователя
    await tester.createTestUser(telegramId, 0)

    // Создаем платеж
    const payment = await tester.createPayment({
      telegram_id: telegramId,
      amount,
      type: TransactionType.MONEY_INCOME,
      description: 'Test payment',
      bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
      service_type: ModeEnum.TopUpBalance,
    })

    // Проверяем создание платежа
    const isPaymentCreated = await tester.checkPaymentCreated(
      telegramId,
      amount
    )
    if (!isPaymentCreated) {
      throw new Error('Платеж не был создан')
    }

    // Проверяем обновление баланса
    const newBalance = await tester.checkBalance(telegramId)
    if (newBalance !== amount) {
      throw new Error(
        `Неверный баланс после платежа: ${newBalance}, ожидалось: ${amount}`
      )
    }

    // Очищаем тестовые данные
    await tester.cleanupTestData(telegramId)

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function testDuplicatePaymentHandling(): Promise<TestResult> {
  const testName = 'Обработка дубликатов платежей'
  const tester = new PaymentTester()

  try {
    const telegramId = '123456789'
    const amount = TEST_PAYMENT_CONFIG.amounts.small
    const operationId = 'test-operation-id'

    // Создаем тестового пользователя
    await tester.createTestUser(telegramId, 0)

    // Создаем первый платеж
    const payment1 = await tester.createPayment({
      telegram_id: telegramId,
      amount,
      type: TransactionType.MONEY_INCOME,
      description: 'Test payment 1',
      bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
      service_type: ModeEnum.TopUpBalance,
      inv_id: operationId,
    })

    // Пытаемся создать дубликат платежа
    const payment2 = await tester.createPayment({
      telegram_id: telegramId,
      amount,
      type: TransactionType.MONEY_INCOME,
      description: 'Test payment 2',
      bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
      service_type: ModeEnum.TopUpBalance,
      inv_id: operationId,
    })

    // Проверяем, что баланс увеличился только один раз
    const balance = await tester.checkBalance(telegramId)
    if (balance !== amount) {
      throw new Error(
        `Неверный баланс после дубликата: ${balance}, ожидалось: ${amount}`
      )
    }

    // Очищаем тестовые данные
    await tester.cleanupTestData(telegramId)

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function testInvalidAmountHandling(): Promise<TestResult> {
  const testName = 'Обработка некорректной суммы'
  const tester = new PaymentTester()

  try {
    const telegramId = '123456789'
    const invalidAmount = -100

    // Создаем тестового пользователя
    await tester.createTestUser(telegramId, 0)

    // Пытаемся создать платеж с отрицательной суммой
    try {
      await tester.createPayment({
        telegram_id: telegramId,
        amount: invalidAmount,
        type: TransactionType.MONEY_INCOME,
        description: 'Invalid amount test',
        bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
        service_type: ModeEnum.TopUpBalance,
      })
      throw new Error('Платеж с отрицательной суммой был создан')
    } catch (error) {
      // Ожидаем ошибку
      if (!(error instanceof Error) || !error.message.includes('сумма')) {
        throw error
      }
    }

    // Проверяем, что баланс не изменился
    const balance = await tester.checkBalance(telegramId)
    if (balance !== 0) {
      throw new Error(`Баланс изменился после неверного платежа: ${balance}`)
    }

    // Очищаем тестовые данные
    await tester.cleanupTestData(telegramId)

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function testBalanceCheck(): Promise<TestResult> {
  const testName = 'Проверка баланса при списании'
  const tester = new PaymentTester()

  try {
    const telegramId = '123456789'
    const initialBalance = TEST_PAYMENT_CONFIG.amounts.small
    const expenseAmount = TEST_PAYMENT_CONFIG.amounts.medium

    // Создаем тестового пользователя с начальным балансом
    await tester.createTestUser(telegramId, initialBalance)

    // Пытаемся списать сумму больше баланса
    try {
      await tester.createPayment({
        telegram_id: telegramId,
        amount: expenseAmount,
        type: TransactionType.MONEY_EXPENSE,
        description: 'Balance check test',
        bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
        service_type: ModeEnum.TextToVideo,
      })
      throw new Error('Списание с недостаточным балансом было выполнено')
    } catch (error) {
      // Ожидаем ошибку
      if (
        !(error instanceof Error) ||
        !error.message.includes('Недостаточно средств')
      ) {
        throw error
      }
    }

    // Проверяем, что баланс не изменился
    const balance = await tester.checkBalance(telegramId)
    if (balance !== initialBalance) {
      throw new Error(`Баланс изменился после неудачного списания: ${balance}`)
    }

    // Очищаем тестовые данные
    await tester.cleanupTestData(telegramId)

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
