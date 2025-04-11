import { TestResult } from '../../types'
import { TEST_CONFIG } from '../../test-config'
import { createMockFn } from '../../test-config'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { TransactionType } from '@/interfaces/payments.interface'

/**
 * Модуль для тестирования платежного процессора с использованием моков
 *
 * Тесты проверяют:
 * 1. Обработку операций пополнения баланса с помощью моков
 * 2. Обработку платежей с недостаточным балансом
 *
 * @module src/test-utils/tests/payment/paymentProcessorMockTest
 */

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
        type: TransactionType.MONEY_INCOME,
        description: TEST_DESCRIPTION,
        bot_name: TEST_BOT_NAME,
        service_type: 'TopUpBalance',
      },
    }

    // Симулируем вызов обработчика платежа
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
 * Тест для проверки отклонения платежа при недостаточном балансе
 */
export async function testInsufficientBalancePayment(): Promise<TestResult> {
  try {
    logger.info('🚀 [TEST]: Запуск теста платежа с недостаточным балансом', {
      description: 'Starting insufficient balance payment test',
    })

    // Создаем моки для функций
    const mockGetUserBalance = createMockFn<any, number>()
    const mockCreatePayment = createMockFn()
    const mockSendNotification = createMockFn()

    // Настраиваем мок функции получения баланса - баланс будет меньше суммы списания
    mockGetUserBalance.mockReturnValue(10)

    const {
      TEST_USER_TELEGRAM_ID,
      TEST_AMOUNT,
      TEST_BOT_NAME,
      TEST_DESCRIPTION,
    } = TEST_CONFIG.TEST_DATA

    // Создаем объект события payment/process для списания средств
    const event = {
      name: 'payment/process',
      data: {
        telegram_id: TEST_USER_TELEGRAM_ID,
        amount: TEST_AMOUNT, // Сумма больше баланса (10)
        stars: TEST_AMOUNT,
        type: TransactionType.MONEY_EXPENSE, // Важно! Это списание средств
        description: TEST_DESCRIPTION,
        bot_name: TEST_BOT_NAME,
        service_type: 'TextToImage',
      },
    }

    try {
      // Симулируем вызов обработчика платежа - должен выдать ошибку
      await mockProcessPayment(event, {
        getUserBalance: mockGetUserBalance,
        createPayment: mockCreatePayment,
        sendNotification: mockSendNotification,
      })

      // Если нет ошибки, это проблема
      return {
        success: false,
        name: 'Тест платежа с недостаточным балансом',
        message:
          'Ожидалась ошибка о недостаточном балансе, но платеж был обработан успешно',
      }
    } catch (paymentError) {
      // Ошибка должна содержать сообщение о недостаточных средствах
      const errorMessage =
        paymentError instanceof Error
          ? paymentError.message
          : String(paymentError)

      if (errorMessage.includes('Недостаточно средств')) {
        logger.info(
          '✅ [TEST]: Получена ожидаемая ошибка о недостаточном балансе',
          {
            description: 'Received expected insufficient funds error',
            error: errorMessage,
          }
        )

        return {
          success: true,
          name: 'Тест платежа с недостаточным балансом',
          message:
            'Тест пройден успешно - получена ожидаемая ошибка о недостаточном балансе',
          details: {
            balance: 10,
            requiredAmount: TEST_AMOUNT,
            error: errorMessage,
          },
        }
      } else {
        // Получена неожидаемая ошибка
        return {
          success: false,
          name: 'Тест платежа с недостаточным балансом',
          message: `Получена неожидаемая ошибка: ${errorMessage}`,
          details: {
            error: errorMessage,
          },
        }
      }
    }
  } catch (error) {
    logger.error(
      '❌ [TEST]: Ошибка при выполнении теста платежа с недостаточным балансом',
      {
        description: 'Error during insufficient balance payment test',
        error: error instanceof Error ? error.message : String(error),
      }
    )

    return {
      success: false,
      name: 'Тест платежа с недостаточным балансом',
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
  const {
    telegram_id,
    amount,
    stars,
    type,
    description,
    bot_name,
    service_type,
  } = event.data

  // Проверка параметров платежа
  if (amount <= 0) {
    throw new Error('Сумма платежа должна быть положительной')
  }

  // Получение текущего баланса пользователя
  const currentBalance = await mocks.getUserBalance(telegram_id)

  // Проверяем баланс для списания
  if (type === TransactionType.MONEY_EXPENSE) {
    if (currentBalance < amount) {
      throw new Error(
        `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${amount}`
      )
    }
  }

  // Вычисление нового баланса в зависимости от типа операции
  let newBalance: number
  if (type === TransactionType.MONEY_INCOME) {
    newBalance = currentBalance + (stars || amount)
  } else if (type === TransactionType.MONEY_EXPENSE) {
    newBalance = currentBalance - (stars || amount)
  } else {
    newBalance = currentBalance
  }

  // Создание записи о платеже
  await mocks.createPayment({
    telegram_id,
    amount,
    stars: stars || amount,
    type,
    description,
    bot_name,
    service_type,
    status: 'COMPLETED',
    payment_method: 'balance',
    inv_id: `test-${telegram_id}-${Date.now()}-${uuidv4()}`,
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
    currentBalance,
    newBalance,
  }
}

/**
 * Запускает все тесты платежного процессора с моками
 * @returns Массив результатов тестов
 */
export async function runPaymentProcessorMockTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  logger.info('🧪 [TEST_RUNNER]: Запуск тестов обработчика платежей с моками', {
    description: 'Running payment processor tests with mocks',
  })

  try {
    // Тест стандартного платежа с моками
    const standardResult = await testPaymentProcessorWithMocks()
    results.push(standardResult)

    // Тест платежа с недостаточным балансом
    const insufficientResult = await testInsufficientBalancePayment()
    results.push(insufficientResult)

    // Собираем статистику
    const passedTests = results.filter(r => r.success).length
    const totalTests = results.length
    const failedTests = totalTests - passedTests

    logger.info(
      '📊 [TEST_RUNNER]: Результаты тестов обработчика платежей с моками:',
      {
        description: 'Payment processor mock test results',
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
      }
    )

    return results
  } catch (error) {
    logger.error(
      '❌ [TEST_RUNNER]: Ошибка при запуске тестов обработчика платежей с моками',
      {
        description: 'Error running payment processor mock tests',
        error: error instanceof Error ? error.message : String(error),
      }
    )

    return [
      {
        success: false,
        name: 'Тесты обработчика платежей с моками',
        message: `Ошибка при запуске тестов: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]
  }
}
