import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { PaymentTester } from '../utils/paymentTester'
import { TEST_PAYMENT_CONFIG } from '../utils/testConfig'
import { inngestTestEngine } from '@/test-utils/inngest/testEngine'

/**
 * Запускает тесты платежного процессора
 */
export async function runPaymentProcessorTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов платежного процессора', {
    description: 'Running payment processor tests',
  })

  try {
    const results: TestResult[] = []

    // Запуск тестов
    results.push(await testPaymentIncome())
    results.push(await testPaymentExpense())
    results.push(await testPaymentWithInsufficientBalance())
    results.push(await testDuplicatePaymentPrevention())

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
        name: 'Тесты платежного процессора',
        message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]
  }
}

/**
 * Тест пополнения баланса
 */
async function testPaymentIncome(): Promise<TestResult> {
  const testName = 'Тест пополнения баланса'

  logger.info(`🚀 Запуск теста: ${testName}`, {
    description: 'Starting payment income test',
  })

  const tester = new PaymentTester()
  const telegramId = '123456789'
  const amount = TEST_PAYMENT_CONFIG.amounts.medium
  const initialBalance = TEST_PAYMENT_CONFIG.testUser.initialBalance

  try {
    // Создаем тестового пользователя
    const userCreated = await tester.createTestUser(telegramId, initialBalance)
    if (!userCreated) {
      throw new Error('Не удалось создать тестового пользователя')
    }

    // Запускаем событие для пополнения баланса
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: telegramId,
        amount: amount,
        type: 'money_income',
        description: 'TEST: Пополнение баланса',
        bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
        service_type: 'TopUpBalance',
      },
    })

    // Ждем обработки события
    await new Promise(resolve =>
      setTimeout(resolve, TEST_PAYMENT_CONFIG.timeouts.medium)
    )

    // Проверяем, что баланс увеличился
    const expectedBalance =
      initialBalance + amount * TEST_PAYMENT_CONFIG.starConversion.rate
    const balanceUpdated = await tester.checkBalanceUpdated(
      telegramId,
      expectedBalance
    )

    if (!balanceUpdated) {
      throw new Error('Баланс не был обновлен после пополнения')
    }

    // Проверяем, что платеж был создан
    const paymentCreated = await tester.checkPaymentCreated(
      telegramId,
      amount,
      'COMPLETED'
    )

    if (!paymentCreated) {
      throw new Error('Платеж не был создан после обработки события')
    }

    // Очищаем тестовые данные
    await tester.cleanupTestData(telegramId)

    logger.info(`✅ Тест успешно пройден: ${testName}`, {
      description: 'Payment income test passed successfully',
    })

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in payment income test',
      error: error instanceof Error ? error.message : String(error),
    })

    // Попытка очистки данных даже при ошибке
    try {
      await tester.cleanupTestData(telegramId)
    } catch (cleanupError) {
      logger.error('Не удалось очистить тестовые данные', {
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      })
    }

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тест списания средств
 */
async function testPaymentExpense(): Promise<TestResult> {
  const testName = 'Тест списания средств'

  logger.info(`🚀 Запуск теста: ${testName}`, {
    description: 'Starting payment expense test',
  })

  const tester = new PaymentTester()
  const telegramId = '123456789'
  const amount = TEST_PAYMENT_CONFIG.amounts.small
  const initialBalance =
    TEST_PAYMENT_CONFIG.amounts.medium * TEST_PAYMENT_CONFIG.starConversion.rate

  try {
    // Создаем тестового пользователя
    const userCreated = await tester.createTestUser(telegramId, initialBalance)
    if (!userCreated) {
      throw new Error('Не удалось создать тестового пользователя')
    }

    // Запускаем событие для списания средств
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: telegramId,
        amount: amount,
        type: 'money_expense',
        description: 'TEST: Списание средств',
        bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
        service_type: 'TextToImage',
      },
    })

    // Ждем обработки события
    await new Promise(resolve =>
      setTimeout(resolve, TEST_PAYMENT_CONFIG.timeouts.medium)
    )

    // Проверяем, что баланс уменьшился
    const expectedBalance =
      initialBalance - amount * TEST_PAYMENT_CONFIG.starConversion.rate
    const balanceUpdated = await tester.checkBalanceUpdated(
      telegramId,
      expectedBalance
    )

    if (!balanceUpdated) {
      throw new Error('Баланс не был обновлен после списания')
    }

    // Проверяем, что платеж был создан
    const paymentCreated = await tester.checkPaymentCreated(
      telegramId,
      amount,
      'COMPLETED'
    )

    if (!paymentCreated) {
      throw new Error('Платеж не был создан после обработки события')
    }

    // Очищаем тестовые данные
    await tester.cleanupTestData(telegramId)

    logger.info(`✅ Тест успешно пройден: ${testName}`, {
      description: 'Payment expense test passed successfully',
    })

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in payment expense test',
      error: error instanceof Error ? error.message : String(error),
    })

    // Попытка очистки данных даже при ошибке
    try {
      await tester.cleanupTestData(telegramId)
    } catch (cleanupError) {
      logger.error('Не удалось очистить тестовые данные', {
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      })
    }

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тест списания средств при недостаточном балансе
 */
async function testPaymentWithInsufficientBalance(): Promise<TestResult> {
  const testName = 'Тест списания средств при недостаточном балансе'

  logger.info(`🚀 Запуск теста: ${testName}`, {
    description: 'Starting payment with insufficient balance test',
  })

  const tester = new PaymentTester()
  const telegramId = '123456789'
  const amount = TEST_PAYMENT_CONFIG.amounts.large
  const initialBalance =
    TEST_PAYMENT_CONFIG.amounts.small * TEST_PAYMENT_CONFIG.starConversion.rate

  try {
    // Создаем тестового пользователя с малым балансом
    const userCreated = await tester.createTestUser(telegramId, initialBalance)
    if (!userCreated) {
      throw new Error('Не удалось создать тестового пользователя')
    }

    // Запускаем событие для списания средств
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: telegramId,
        amount: amount,
        type: 'money_expense',
        description: 'TEST: Списание средств при недостаточном балансе',
        bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
        service_type: 'TextToImage',
      },
    })

    // Ждем обработки события
    await new Promise(resolve =>
      setTimeout(resolve, TEST_PAYMENT_CONFIG.timeouts.medium)
    )

    // Проверяем, что баланс не изменился
    const balanceUnchanged = await tester.checkBalanceUpdated(
      telegramId,
      initialBalance
    )

    if (!balanceUnchanged) {
      throw new Error('Баланс был изменен, хотя средств недостаточно')
    }

    // Очищаем тестовые данные
    await tester.cleanupTestData(telegramId)

    logger.info(`✅ Тест успешно пройден: ${testName}`, {
      description: 'Payment with insufficient balance test passed successfully',
    })

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in payment with insufficient balance test',
      error: error instanceof Error ? error.message : String(error),
    })

    // Попытка очистки данных даже при ошибке
    try {
      await tester.cleanupTestData(telegramId)
    } catch (cleanupError) {
      logger.error('Не удалось очистить тестовые данные', {
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      })
    }

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тест предотвращения дублирующихся платежей
 */
async function testDuplicatePaymentPrevention(): Promise<TestResult> {
  const testName = 'Тест предотвращения дублирующихся платежей'

  logger.info(`🚀 Запуск теста: ${testName}`, {
    description: 'Starting duplicate payment prevention test',
  })

  const tester = new PaymentTester()
  const telegramId = '123456789'
  const amount = TEST_PAYMENT_CONFIG.amounts.medium
  const initialBalance = TEST_PAYMENT_CONFIG.testUser.initialBalance
  const operationId = `test-operation-${Date.now()}`

  try {
    // Создаем тестового пользователя
    const userCreated = await tester.createTestUser(telegramId, initialBalance)
    if (!userCreated) {
      throw new Error('Не удалось создать тестового пользователя')
    }

    // Создаем платеж напрямую в базе данных
    const { error: createError } = await supabase.from('payments_v2').insert({
      telegram_id: telegramId,
      amount: amount,
      stars: amount * TEST_PAYMENT_CONFIG.starConversion.rate,
      type: 'money_income',
      status: 'COMPLETED',
      description: 'TEST: Первый платеж',
      operation_id: operationId,
      bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
      payment_method: 'Test',
    })

    if (createError) {
      throw new Error(
        `Не удалось создать тестовый платеж: ${createError.message}`
      )
    }

    // Запускаем событие с тем же operation_id
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: telegramId,
        amount: amount,
        type: 'money_income',
        description: 'TEST: Дублирующийся платеж',
        bot_name: TEST_PAYMENT_CONFIG.testUser.botName,
        service_type: 'TopUpBalance',
        operation_id: operationId,
      },
    })

    // Ждем обработки события
    await new Promise(resolve =>
      setTimeout(resolve, TEST_PAYMENT_CONFIG.timeouts.medium)
    )

    // Проверяем, что не был создан второй платеж с тем же operation_id
    const { count } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: false })
      .eq('operation_id', operationId)

    if (count !== 1) {
      throw new Error(
        `Был создан дублирующийся платеж: найдено ${count} платежей с operation_id ${operationId}`
      )
    }

    // Очищаем тестовые данные
    await tester.cleanupTestData(telegramId)

    // Удаляем тестовый платеж
    await supabase.from('payments_v2').delete().eq('operation_id', operationId)

    logger.info(`✅ Тест успешно пройден: ${testName}`, {
      description: 'Duplicate payment prevention test passed successfully',
    })

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in duplicate payment prevention test',
      error: error instanceof Error ? error.message : String(error),
    })

    // Попытка очистки данных даже при ошибке
    try {
      await tester.cleanupTestData(telegramId)
      await supabase
        .from('payments_v2')
        .delete()
        .eq('operation_id', operationId)
    } catch (cleanupError) {
      logger.error('Не удалось очистить тестовые данные', {
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      })
    }

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
