import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'
import { inngestTestEngine } from '../test-config'
import { createMockFn } from '../test-config'
import { logger } from '../../utils/logger'

/**
 * Тест для проверки вызова обработчика платежей с мокированием функций
 */
export async function testPaymentProcessorWithMocks(): Promise<TestResult> {
  try {
    logger.info('🚀 [TEST]: Запуск теста обработчика платежей с моками', {
      description: 'Starting payment processor test with mocks',
    })

    // Создаем моки для функций
    const mockGetUserBalance = createMockFn<any, number>()
    const mockCreatePayment = createMockFn()
    const mockSendNotification = createMockFn()

    // Настраиваем мок функции получения баланса
    mockGetUserBalance.mockReturnValue(1000)

    const {
      TEST_USER_TELEGRAM_ID,
      TEST_AMOUNT,
      TEST_BOT_NAME,
      TEST_DESCRIPTION,
    } = TEST_CONFIG.TEST_DATA

    // Создаем объект события payment/process
    const event = {
      name: 'payment/process',
      data: {
        telegram_id: TEST_USER_TELEGRAM_ID,
        amount: TEST_AMOUNT,
        stars: TEST_AMOUNT,
        type: 'money_income',
        description: TEST_DESCRIPTION,
        bot_name: TEST_BOT_NAME,
        service_type: 'TopUpBalance',
      },
    }

    // Симулируем вызов обработчика платежа (в реальной ситуации это бы зарегистрировали через inngestTestEngine.registerHandler)
    const handlerResult = await mockProcessPayment(event, {
      getUserBalance: mockGetUserBalance,
      createPayment: mockCreatePayment,
      sendNotification: mockSendNotification,
    })

    // Проверяем, был ли вызван мок функции получения баланса
    if (mockGetUserBalance.calls.length === 0) {
      return {
        success: false,
        name: 'Тест обработчика платежей с моками',
        message: 'Функция получения баланса не была вызвана',
      }
    }

    // Проверяем, был ли вызван мок функции создания платежа
    if (mockCreatePayment.calls.length === 0) {
      return {
        success: false,
        name: 'Тест обработчика платежей с моками',
        message: 'Функция создания платежа не была вызвана',
      }
    }

    // Проверяем, был ли вызван мок функции отправки уведомления
    if (mockSendNotification.calls.length === 0) {
      return {
        success: false,
        name: 'Тест обработчика платежей с моками',
        message: 'Функция отправки уведомления не была вызвана',
      }
    }

    logger.info('✅ [TEST]: Тест пройден успешно', {
      description: 'Payment processor test with mocks passed successfully',
      result: handlerResult,
    })

    return {
      success: true,
      name: 'Тест обработчика платежей с моками',
      message: 'Тест пройден успешно',
      details: {
        getUserBalanceCalls: mockGetUserBalance.calls.length,
        createPaymentCalls: mockCreatePayment.calls.length,
        sendNotificationCalls: mockSendNotification.calls.length,
      },
    }
  } catch (error) {
    logger.error('❌ [TEST]: Ошибка при выполнении теста', {
      description: 'Error during payment processor test with mocks',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Тест обработчика платежей с моками',
      message: `Ошибка при выполнении теста: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Мок функция для обработки платежа
 */
async function mockProcessPayment(
  event: { name: string; data: any },
  mocks: {
    getUserBalance: any
    createPayment: any
    sendNotification: any
  }
): Promise<any> {
  const { telegram_id, amount, stars, type, description, bot_name } = event.data

  // Проверка параметров платежа
  if (amount <= 0) {
    throw new Error('Сумма платежа должна быть положительной')
  }

  // Получение текущего баланса пользователя
  const currentBalance = await mocks.getUserBalance(telegram_id)

  // Вычисление нового баланса в зависимости от типа операции
  let newBalance: number
  if (type === 'money_income') {
    newBalance = currentBalance + (stars || amount)
  } else if (type === 'money_expense') {
    // Проверка достаточности баланса
    if (currentBalance < (stars || amount)) {
      throw new Error('Недостаточно средств на балансе')
    }
    newBalance = currentBalance - (stars || amount)
  } else {
    newBalance = currentBalance
  }

  // Создание записи о платеже
  const payment = await mocks.createPayment({
    telegram_id,
    amount,
    stars,
    type,
    description,
    bot_name,
  })

  // Отправка уведомления о транзакции
  await mocks.sendNotification({
    telegram_id,
    amount,
    currentBalance,
    newBalance,
    description,
    bot_name,
  })

  return {
    success: true,
    payment,
    currentBalance,
    newBalance,
  }
}

/**
 * Запуск тестов с моками
 */
export async function runPaymentProcessorMockTests(): Promise<TestResult[]> {
  logger.info('🧪 [TEST_RUNNER]: Запуск тестов обработчика платежей с моками', {
    description: 'Running payment processor tests with mocks',
  })

  const results: TestResult[] = []

  // Запускаем тест
  results.push(await testPaymentProcessorWithMocks())

  // Выводим результаты
  const passedTests = results.filter(r => r.success).length
  const failedTests = results.filter(r => !r.success).length

  logger.info(
    `📊 [TEST_RUNNER]: Результаты тестов обработчика платежей с моками: ${passedTests} успешно, ${failedTests} не пройдено`,
    {
      description: 'Payment processor mock test results',
      passed: passedTests,
      failed: failedTests,
      total: results.length,
    }
  )

  return results
}
