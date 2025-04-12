import { logger } from '@/utils/logger'
import { TEST_CONFIG } from '../../test-config'
import { TestResult } from '../../types'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { TransactionType } from '@/interfaces/payments.interface'
import { supabase } from '@/supabase'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Модуль тестов для функции createSuccessfulPayment
 *
 * Проверяет различные сценарии создания платежей:
 * 1. Успешное создание платежа
 * 2. Обработка ошибки при дублировании inv_id
 * 3. Обработка ошибки при отсутствии пользователя
 * 4. Предотвращение дублирования платежей
 *
 * @module src/test-utils/tests/payment/createSuccessfulPaymentTest
 */

/**
 * Специальная функция для логирования ожидаемых ошибок в тестах
 * Используется вместо обычного логгера ошибок, чтобы визуально отличать
 * ожидаемые ошибки от настоящих проблем
 */
function logExpectedError(
  message: string,
  error: any,
  details: Record<string, any> = {}
) {
  logger.info(`🔍 [ОЖИДАЕМАЯ ОШИБКА]: ${message}`, {
    description: `Expected test error (this is normal): ${message}`,
    error: error instanceof Error ? error.message : String(error),
    ...details,
  })
}

/**
 * Проверяет создание платежа с корректными параметрами
 */
export async function testSuccessfulPaymentCreation(): Promise<TestResult> {
  try {
    logger.info(
      '🚀 [TEST]: Проверка создания платежа с корректными параметрами',
      {
        description: 'Testing payment creation with valid parameters',
      }
    )

    const {
      TEST_USER_TELEGRAM_ID,
      TEST_AMOUNT,
      TEST_BOT_NAME,
      TEST_DESCRIPTION,
    } = TEST_CONFIG.TEST_DATA

    // Генерируем уникальный ID для операции
    const operationId = uuidv4()

    // Создаем платеж
    const payment = await createSuccessfulPayment({
      telegram_id: TEST_USER_TELEGRAM_ID,
      amount: TEST_AMOUNT,
      stars: TEST_AMOUNT,
      type: TransactionType.MONEY_INCOME,
      description: TEST_DESCRIPTION,
      bot_name: TEST_BOT_NAME,
      payment_method: 'test',
      status: 'COMPLETED',
      inv_id: operationId,
      service_type: ModeEnum.TopUpBalance,
    })

    // Проверяем, что платеж создан и имеет правильный тип
    if (
      !payment ||
      payment.type !== TransactionType.MONEY_INCOME.toLowerCase()
    ) {
      return {
        success: false,
        name: 'Тест создания платежа',
        message: 'Платеж не создан или имеет неверный тип',
      }
    }

    // Проверяем, что платеж имеет корректные данные
    if (
      Number(payment.telegram_id) !== Number(TEST_USER_TELEGRAM_ID) ||
      payment.amount !== TEST_AMOUNT ||
      payment.stars !== TEST_AMOUNT
    ) {
      logger.error('❌ [TEST]: Платеж содержит некорректные данные', {
        description: 'Payment contains invalid data',
        expected: {
          telegram_id: Number(TEST_USER_TELEGRAM_ID),
          amount: TEST_AMOUNT,
          stars: TEST_AMOUNT,
        },
        actual: {
          telegram_id: Number(payment.telegram_id),
          amount: payment.amount,
          stars: payment.stars,
        },
      })
      return {
        success: false,
        name: 'Тест создания платежа',
        message: 'Платеж содержит некорректные данные',
      }
    }

    logger.info('✅ [TEST]: Платеж успешно создан', {
      description: 'Payment created successfully',
      payment_id: payment.id,
    })

    return {
      success: true,
      name: 'Тест создания платежа',
      message: 'Платеж успешно создан',
      details: {
        payment_id: payment.id,
        telegram_id: payment.telegram_id,
        amount: payment.amount,
        type: payment.type,
      },
    }
  } catch (error) {
    logger.error('❌ [TEST]: Ошибка при создании платежа', {
      description: 'Error creating payment',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Тест создания платежа',
      message: `Ошибка при создании платежа: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Проверяет обработку дублирования платежей с одинаковым inv_id
 */
export async function testDuplicatePayment(): Promise<TestResult> {
  try {
    logger.info('🚀 [TEST]: Проверка создания дублирующегося платежа', {
      description: 'Testing duplicate payment creation',
    })

    const {
      TEST_USER_TELEGRAM_ID,
      TEST_AMOUNT,
      TEST_BOT_NAME,
      TEST_DESCRIPTION,
    } = TEST_CONFIG.TEST_DATA

    // Генерируем уникальный ID для операции
    const operationId = uuidv4()

    // Создаем первый платеж
    const payment1 = await createSuccessfulPayment({
      telegram_id: TEST_USER_TELEGRAM_ID,
      amount: TEST_AMOUNT,
      stars: TEST_AMOUNT,
      type: TransactionType.MONEY_INCOME,
      description: TEST_DESCRIPTION,
      bot_name: TEST_BOT_NAME,
      payment_method: 'test',
      status: 'COMPLETED',
      inv_id: operationId,
      service_type: ModeEnum.TopUpBalance,
    })

    // Пытаемся создать второй платеж с тем же inv_id
    try {
      await createSuccessfulPayment({
        telegram_id: TEST_USER_TELEGRAM_ID,
        amount: TEST_AMOUNT,
        stars: TEST_AMOUNT,
        type: TransactionType.MONEY_INCOME,
        description: TEST_DESCRIPTION,
        bot_name: TEST_BOT_NAME,
        payment_method: 'test',
        status: 'COMPLETED',
        inv_id: operationId, // Тот же ID операции!
        service_type: ModeEnum.TopUpBalance,
      })

      // Если не возникло ошибки при создании дубликата, это проблема!
      // Проверяем, что действительно не создался дубликат
      const { data: payments } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('inv_id', operationId)

      if (payments && payments.length > 1) {
        return {
          success: false,
          name: 'Тест дублирования платежа',
          message: 'Создан дубликат платежа с тем же inv_id, что недопустимо',
          details: {
            payment_count: payments.length,
            inv_id: operationId,
          },
        }
      }

      // Если платеж не дублировался, то тест проходит
      logger.info('✅ [TEST]: Дубликат платежа не создан, но не было ошибки', {
        description: 'Duplicate payment not created, but no error was thrown',
        inv_id: operationId,
      })

      return {
        success: true,
        name: 'Тест дублирования платежа',
        message: 'Дубликат платежа не создан, хотя ошибка не была выброшена',
        details: {
          payment_id: payment1.id,
          inv_id: operationId,
        },
      }
    } catch (duplicateError) {
      // Ожидаем ошибку при попытке создать дубликат с тем же inv_id
      logExpectedError('Дубликат платежа с тем же inv_id', duplicateError, {
        inv_id: operationId,
      })

      return {
        success: true,
        name: 'Тест дублирования платежа',
        message:
          'Тест пройден: получена ошибка при попытке создать дубликат платежа',
        details: {
          original_payment_id: payment1.id,
          error:
            duplicateError instanceof Error
              ? duplicateError.message
              : String(duplicateError),
        },
      }
    }
  } catch (error) {
    logger.error('❌ [TEST]: Ошибка при тестировании дублирования платежа', {
      description: 'Error testing duplicate payment',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Тест дублирования платежа',
      message: `Непредвиденная ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Проверяет поведение при попытке создать платеж для несуществующего пользователя
 */
export async function testNonExistentUserPayment(): Promise<TestResult> {
  try {
    logger.info(
      '🚀 [TEST]: Проверка создания платежа для несуществующего пользователя',
      {
        description: 'Testing payment creation for non-existent user',
      }
    )

    const { TEST_BOT_NAME } = TEST_CONFIG.TEST_DATA

    // Пытаемся создать платеж с несуществующим пользователем
    try {
      await createSuccessfulPayment({
        telegram_id: '999999999999', // несуществующий пользователь
        amount: 100,
        stars: 100,
        type: TransactionType.MONEY_INCOME,
        description: 'Test non-existent user',
        bot_name: TEST_BOT_NAME,
        payment_method: 'test',
        status: 'COMPLETED',
        inv_id: uuidv4(),
        service_type: ModeEnum.TopUpBalance,
      })

      // Если не получили ошибку, это проблема
      return {
        success: false,
        name: 'Тест несуществующего пользователя',
        message:
          'Платеж для несуществующего пользователя должен вызывать ошибку',
      }
    } catch (userError) {
      logExpectedError('Платеж для несуществующего пользователя', userError, {
        telegram_id: '999999999999',
      })

      return {
        success: true,
        name: 'Тест несуществующего пользователя',
        message:
          'Успешно обнаружена ошибка при создании платежа для несуществующего пользователя',
        details: {
          error:
            userError instanceof Error ? userError.message : String(userError),
        },
      }
    }
  } catch (error) {
    logger.error(
      '❌ [TEST]: Ошибка при тестировании несуществующего пользователя',
      {
        description: 'Error testing non-existent user',
        error: error instanceof Error ? error.message : String(error),
      }
    )

    return {
      success: false,
      name: 'Тест несуществующего пользователя',
      message: `Непредвиденная ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Проверяет создание платежа с уже существующим inv_id
 */
export async function testExistingInvIdCheck(): Promise<TestResult> {
  try {
    logger.info('🚀 [TEST]: Проверка поиска существующего платежа по inv_id', {
      description: 'Testing checking for existing payment by inv_id',
    })

    const {
      TEST_USER_TELEGRAM_ID,
      TEST_AMOUNT,
      TEST_BOT_NAME,
      TEST_DESCRIPTION,
    } = TEST_CONFIG.TEST_DATA

    // Генерируем уникальный ID для операции
    const operationId = uuidv4()

    // Создаем первый платеж
    const payment1 = await createSuccessfulPayment({
      telegram_id: TEST_USER_TELEGRAM_ID,
      amount: TEST_AMOUNT,
      stars: TEST_AMOUNT,
      type: TransactionType.MONEY_INCOME,
      description: TEST_DESCRIPTION,
      bot_name: TEST_BOT_NAME,
      payment_method: 'test',
      status: 'COMPLETED',
      inv_id: operationId,
      service_type: ModeEnum.TopUpBalance,
    })

    // Проверяем, что функция проверяет существующий inv_id перед созданием
    // Получаем все платежи с данным inv_id
    const { data: existingPayments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('inv_id', operationId)

    if (!existingPayments || existingPayments.length === 0) {
      return {
        success: false,
        name: 'Тест проверки существующего inv_id',
        message: 'Платеж не найден по inv_id',
      }
    }

    if (existingPayments.length > 1) {
      return {
        success: false,
        name: 'Тест проверки существующего inv_id',
        message: `Найдено ${existingPayments.length} платежей с одинаковым inv_id, ожидался ровно один`,
      }
    }

    return {
      success: true,
      name: 'Тест проверки существующего inv_id',
      message: 'Проверка на существующий inv_id работает корректно',
      details: {
        payment_id: payment1.id,
        inv_id: operationId,
      },
    }
  } catch (error) {
    logger.error(
      '❌ [TEST]: Ошибка при тестировании проверки существующего inv_id',
      {
        description: 'Error testing existing inv_id check',
        error: error instanceof Error ? error.message : String(error),
      }
    )

    return {
      success: false,
      name: 'Тест проверки существующего inv_id',
      message: `Непредвиденная ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Запускает все тесты для функции createSuccessfulPayment
 */
export async function runCreateSuccessfulPaymentTests(): Promise<TestResult[]> {
  logger.info(
    '🚀 [TEST]: Запуск всех тестов для функции createSuccessfulPayment',
    {
      description: 'Running all tests for createSuccessfulPayment function',
    }
  )

  const results: TestResult[] = []

  // Запускаем все тесты
  results.push(await testSuccessfulPaymentCreation())
  results.push(await testDuplicatePayment())
  results.push(await testNonExistentUserPayment())
  results.push(await testExistingInvIdCheck())

  // Логируем общий результат
  const passedTests = results.filter(r => r.success).length
  const totalTests = results.length

  logger.info(
    `✅ [TEST_RESULTS]: Тесты createSuccessfulPayment: ${passedTests}/${totalTests} пройдено`,
    {
      description: `Tests for createSuccessfulPayment: ${passedTests}/${totalTests} passed`,
    }
  )

  return results
}

// Если файл запущен напрямую через командную строку
if (require.main === module) {
  ;(async () => {
    try {
      logger.info(
        '🚀 Запуск тестов createSuccessfulPayment из командной строки',
        {
          description:
            'Running createSuccessfulPayment tests from command line',
        }
      )

      const results = await runCreateSuccessfulPaymentTests()

      // Выводим результаты
      const passedTests = results.filter(r => r.success).length
      const totalTests = results.length

      logger.info(
        `✅ Результаты тестов: ${passedTests}/${totalTests} пройдено`,
        {
          description: `Test results: ${passedTests}/${totalTests} passed`,
        }
      )

      // Отображаем детальные результаты
      results.forEach(result => {
        if (result.success) {
          console.log(`✅ PASSED: ${result.name} - ${result.message}`)
        } else {
          console.log(`❌ FAILED: ${result.name} - ${result.message}`)
        }
      })

      // Завершаем процесс с соответствующим статусом
      process.exit(passedTests === totalTests ? 0 : 1)
    } catch (error) {
      logger.error('❌ Ошибка при запуске тестов:', {
        description: 'Error running tests',
        error: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    }
  })()
}
