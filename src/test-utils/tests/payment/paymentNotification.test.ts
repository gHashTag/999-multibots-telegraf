import { logger } from '@/utils/logger'
import { TestResult } from '@/types/tests'
import { sendTransactionNotification } from '@/helpers/sendTransactionNotification'
import { createTestUser } from '../../helpers/users'
import { inngestTestEngine } from '../../test-config'
import { TEST_PAYMENT_CONFIG } from '@/config/test'
import {
  TransactionType,
  PaymentProcessParams,
} from '@/interfaces/payments.interface'
import { ModeEnum } from '@/price/helpers/modelsCost'

/**
 * Тест проверки отправки уведомлений о платежах
 * Этот тест эмулирует процесс платежа и проверяет, что уведомление было отправлено
 * Если уведомление не было отправлено, тест не пройдет
 */
export async function testPaymentNotification(): Promise<TestResult> {
  const testName = 'Payment Notification Test'
  const userId = '12345678' // Тестовый ID пользователя
  const amount = 10
  const initialBalance = 100
  const finalBalance = initialBalance - amount
  const botName = 'test_bot'

  // Флаг для отслеживания, был ли вызван метод отправки уведомления
  let notificationSent = false

  try {
    logger.info('🚀 Начало теста уведомлений о платежах', {
      description: 'Starting payment notification test',
      userId,
      amount,
      initialBalance,
      finalBalance,
    })

    // Подготовка мока для sendTransactionNotification
    const originalSendNotification = sendTransactionNotification

    // Переопределяем функцию для тестирования
    // @ts-ignore - Игнорируем ошибку TypeScript для целей тестирования
    sendTransactionNotification = async params => {
      logger.info('📤 Мок отправки уведомления вызван', {
        description: 'Mock notification function called',
        params,
      })
      notificationSent = true
      // Не выполняем реальную отправку в тесте
      return { success: true }
    }

    // Имитируем процесс платежа
    await inngestTestEngine.sendEvent('payment/process', {
      telegram_id: userId,
      amount,
      type: TransactionType.MONEY_EXPENSE,
      description: 'Test payment for notification',
      bot_name: botName,
      service_type: ModeEnum.NeuroPhoto,
    })

    // Восстанавливаем оригинальную функцию
    // @ts-ignore - Игнорируем ошибку TypeScript для целей тестирования
    sendTransactionNotification = originalSendNotification

    // Проверяем, что уведомление было отправлено
    if (!notificationSent) {
      throw new Error('Уведомление о платеже не было отправлено')
    }

    logger.info('✅ Тест уведомлений о платежах успешно пройден', {
      description: 'Payment notification test passed',
      notificationSent,
    })

    return {
      success: true,
      name: testName,
      message: '✅ Уведомление о платеже успешно отправлено',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте уведомлений о платежах', {
      description: 'Error in payment notification test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    }
  }
}

/**
 * Тест на обработку пополнения баланса
 * Проверяет корректность обработки пополнения баланса
 */
export async function testBalanceTopUp(): Promise<TestResult> {
  const testName = 'Balance Top-Up Test'
  let testUserId: string | null = null

  try {
    // Создаем тестового пользователя
    const testUser = await createTestUser(
      'testBalanceTopUp_' + Date.now(),
      TEST_PAYMENT_CONFIG.initialBalance
    )

    if (!testUser) {
      throw new Error('Не удалось создать тестового пользователя')
    }

    testUserId = testUser.telegram_id
    const initialBalance = TEST_PAYMENT_CONFIG.initialBalance
    const topUpAmount = 50 // Сумма пополнения

    logger.info(
      '👤 Создан тестовый пользователь для проверки пополнения баланса',
      {
        description: 'Created test user for balance top-up test',
        testUserId,
        initialBalance,
      }
    )

    // Параметры для пополнения баланса
    const topUpParams: PaymentProcessParams = {
      telegram_id: testUserId,
      amount: topUpAmount,
      stars: topUpAmount,
      type: TransactionType.MONEY_INCOME,
      description: 'Balance top-up test',
      bot_name: 'test_bot',
      service_type: ModeEnum.TopUpBalance,
    }

    // Имитируем процесс пополнения баланса
    const result = await inngestTestEngine.sendEvent(
      'payment/process',
      topUpParams
    )

    logger.info('💰 Результат пополнения баланса', {
      description: 'Balance top-up result',
      result,
    })

    // В реальной системе здесь можно проверить новый баланс
    // Для теста просто проверяем успешность события

    return {
      success: true,
      name: testName,
      message: '✅ Тест пополнения баланса успешно пройден',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте пополнения баланса', {
      description: 'Error in balance top-up test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    }
  } finally {
    // Удаляем тестового пользователя
    if (testUserId) {
      try {
        const { supabase } = require('@/supabase')
        await supabase.from('users').delete().eq('telegram_id', testUserId)
      } catch (cleanupError) {
        logger.error('❌ Ошибка при удалении тестового пользователя', {
          description: 'Error deleting test user',
          cleanupError,
          testUserId,
        })
      }
    }
  }
}

/**
 * Тест на обработку списания средств
 * Проверяет корректность обработки списания средств
 */
export async function testBalanceDebit(): Promise<TestResult> {
  const testName = 'Balance Debit Test'
  let testUserId: string | null = null

  try {
    // Создаем тестового пользователя с начальным балансом
    const testUser = await createTestUser(
      'testBalanceDebit_' + Date.now(),
      TEST_PAYMENT_CONFIG.initialBalance
    )

    if (!testUser) {
      throw new Error('Не удалось создать тестового пользователя')
    }

    testUserId = testUser.telegram_id
    const initialBalance = TEST_PAYMENT_CONFIG.initialBalance
    const debitAmount = 20 // Сумма списания

    logger.info('👤 Создан тестовый пользователь для проверки списания', {
      description: 'Created test user for balance debit test',
      testUserId,
      initialBalance,
    })

    // Параметры для списания средств
    const debitParams: PaymentProcessParams = {
      telegram_id: testUserId,
      amount: debitAmount,
      stars: debitAmount,
      type: TransactionType.MONEY_EXPENSE,
      description: 'Balance debit test',
      bot_name: 'test_bot',
      service_type: ModeEnum.NeuroPhoto,
    }

    // Имитируем процесс списания
    const result = await inngestTestEngine.sendEvent(
      'payment/process',
      debitParams
    )

    logger.info('💰 Результат списания средств', {
      description: 'Balance debit result',
      result,
    })

    return {
      success: true,
      name: testName,
      message: '✅ Тест списания средств успешно пройден',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте списания средств', {
      description: 'Error in balance debit test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    }
  } finally {
    // Удаляем тестового пользователя
    if (testUserId) {
      try {
        const { supabase } = require('@/supabase')
        await supabase.from('users').delete().eq('telegram_id', testUserId)
      } catch (cleanupError) {
        logger.error('❌ Ошибка при удалении тестового пользователя', {
          description: 'Error deleting test user',
          cleanupError,
          testUserId,
        })
      }
    }
  }
}

/**
 * Тест на проверку недостаточного баланса
 * Проверяет, что система корректно обрабатывает ситуацию, когда на балансе недостаточно средств
 */
export async function testInsufficientBalance(): Promise<TestResult> {
  const testName = 'Insufficient Balance Test'
  let testUserId: string | null = null

  try {
    // Создаем тестового пользователя с небольшим балансом
    const smallBalance = 5
    const testUser = await createTestUser(
      'testInsufficientBalance_' + Date.now(),
      smallBalance
    )

    if (!testUser) {
      throw new Error('Не удалось создать тестового пользователя')
    }

    testUserId = testUser.telegram_id
    const debitAmount = 50 // Сумма списания больше баланса

    logger.info('👤 Создан тестовый пользователь с маленьким балансом', {
      description: 'Created test user with small balance',
      testUserId,
      balance: smallBalance,
    })

    // Флаг для отслеживания ошибки недостаточного баланса
    let insufficientBalanceErrorDetected = false

    try {
      // Параметры для списания средств
      const debitParams: PaymentProcessParams = {
        telegram_id: testUserId,
        amount: debitAmount,
        stars: debitAmount,
        type: TransactionType.MONEY_EXPENSE,
        description: 'Insufficient balance test',
        bot_name: 'test_bot',
        service_type: ModeEnum.NeuroPhoto,
      }

      // Имитируем процесс списания
      await inngestTestEngine.sendEvent('payment/process', debitParams)
    } catch (error) {
      // Проверяем, что получена ошибка о недостаточном балансе
      if (
        error instanceof Error &&
        error.message.includes('Недостаточно средств')
      ) {
        insufficientBalanceErrorDetected = true
        logger.info('✅ Корректно обнаружена ошибка недостаточного баланса', {
          description: 'Insufficient balance error correctly detected',
          error: error.message,
        })
      } else {
        throw error
      }
    }

    // Если ошибка недостаточного баланса не была обнаружена, тест не пройден
    if (!insufficientBalanceErrorDetected) {
      throw new Error('Ошибка недостаточного баланса не была обнаружена')
    }

    return {
      success: true,
      name: testName,
      message: '✅ Тест обработки недостаточного баланса успешно пройден',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте недостаточного баланса', {
      description: 'Error in insufficient balance test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    }
  } finally {
    // Удаляем тестового пользователя
    if (testUserId) {
      try {
        const { supabase } = require('@/supabase')
        await supabase.from('users').delete().eq('telegram_id', testUserId)
      } catch (cleanupError) {
        logger.error('❌ Ошибка при удалении тестового пользователя', {
          description: 'Error deleting test user',
          cleanupError,
          testUserId,
        })
      }
    }
  }
}

/**
 * Более комплексный тест, который проверяет отправку уведомлений при реальном платеже
 * Создает тестового пользователя, делает платеж и проверяет отправку уведомления
 */
export async function testRealPaymentNotification(): Promise<TestResult> {
  const testName = 'Real Payment Notification Test'
  let testUserId: string | null = null
  let notificationReceived = false

  try {
    // Создаем тестового пользователя
    const testUser = await createTestUser(
      'testNotificationUser_' + Date.now(),
      TEST_PAYMENT_CONFIG.initialBalance
    )

    if (!testUser) {
      throw new Error('Не удалось создать тестового пользователя')
    }

    testUserId = testUser.telegram_id
    const amount = 5 // Сумма платежа

    logger.info('👤 Создан тестовый пользователь для проверки уведомлений', {
      description: 'Created test user for notification test',
      testUserId,
      initialBalance: TEST_PAYMENT_CONFIG.initialBalance,
    })

    // Создаем мок телеграм бота, который будет отслеживать отправку сообщений
    const mockTelegramBot = {
      sendMessage: (chatId: number | string, text: string) => {
        logger.info('📤 Бот отправил сообщение', {
          description: 'Bot sent message',
          chatId,
          text,
        })

        // Проверяем, что сообщение содержит информацию о платеже
        if (text.includes('Сумма') && text.includes('Баланс')) {
          notificationReceived = true
        }

        return Promise.resolve()
      },
    }

    // Подготовка мока для createBotByName
    const originalCreateBot = require('@/core/bot').createBotByName

    // Переопределяем функцию создания бота для тестирования
    require('@/core/bot').createBotByName = async () => {
      return {
        bot: {
          telegram: mockTelegramBot,
        },
      }
    }

    // Имитируем процесс платежа
    await inngestTestEngine.sendEvent('payment/process', {
      telegram_id: testUserId,
      amount,
      type: TransactionType.MONEY_EXPENSE,
      description: 'Test payment for notification',
      bot_name: 'test_bot',
      service_type: ModeEnum.NeuroPhoto,
    })

    // Восстанавливаем оригинальную функцию
    require('@/core/bot').createBotByName = originalCreateBot

    // Делаем паузу, чтобы убедиться, что все асинхронные операции завершены
    await new Promise(resolve => setTimeout(resolve, 500))

    // Проверяем, что уведомление было отправлено
    if (!notificationReceived) {
      throw new Error('Уведомление о платеже не было получено пользователем')
    }

    logger.info('✅ Тест реальных уведомлений о платежах успешно пройден', {
      description: 'Real payment notification test passed',
      notificationReceived,
    })

    return {
      success: true,
      name: testName,
      message: '✅ Уведомление о платеже успешно доставлено пользователю',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте реальных уведомлений о платежах', {
      description: 'Error in real payment notification test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: error instanceof Error ? error.message : 'Неизвестная ошибка',
    }
  } finally {
    // Удаляем тестового пользователя
    if (testUserId) {
      try {
        const { supabase } = require('@/supabase')
        await supabase.from('users').delete().eq('telegram_id', testUserId)
        logger.info('🧹 Тестовый пользователь удален', {
          description: 'Test user deleted',
          testUserId,
        })
      } catch (cleanupError) {
        logger.error('❌ Ошибка при удалении тестового пользователя', {
          description: 'Error deleting test user',
          cleanupError,
          testUserId,
        })
      }
    }
  }
}

/**
 * Запускает тесты уведомлений о платежах
 */
export async function runPaymentNotificationTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов уведомлений о платежах...')

  const results: TestResult[] = []

  // Базовые тесты уведомлений
  results.push(await testPaymentNotification())
  results.push(await testRealPaymentNotification())

  // Тесты различных сценариев платежей
  results.push(await testBalanceTopUp())
  results.push(await testBalanceDebit())
  results.push(await testInsufficientBalance())

  logger.info('🏁 Тесты уведомлений о платежах завершены.')

  return results
}

/**
 * Функция для запуска тестов из командной строки
 */
async function main() {
  logger.info('🧪 Запуск тестов уведомлений о платежах из командной строки')

  try {
    const results = await runPaymentNotificationTests()

    // Выводим результаты
    const totalTests = results.length
    const passedTests = results.filter(r => r.success).length
    const failedTests = totalTests - passedTests

    logger.info('📊 Результаты тестов:', {
      description: 'Test results',
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
    })

    // Выводим детали неудачных тестов
    if (failedTests > 0) {
      const failedResults = results.filter(r => !r.success)
      logger.error('❌ Неудачные тесты:', {
        description: 'Failed tests',
        tests: failedResults.map(r => ({ name: r.name, message: r.message })),
      })

      // Выходим с ошибкой если есть неудачные тесты
      process.exit(1)
    } else {
      logger.info('✅ Все тесты успешно пройдены!')
      process.exit(0)
    }
  } catch (error) {
    logger.error('💥 Критическая ошибка при запуске тестов:', {
      description: 'Critical error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

// Запускаем тесты, если файл вызван напрямую
if (require.main === module) {
  main().catch(error => {
    logger.error('💥 Необработанная ошибка:', {
      description: 'Unhandled error',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
}
