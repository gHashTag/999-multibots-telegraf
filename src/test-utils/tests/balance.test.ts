import { logger } from '@/utils/logger'
import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'
import { supabase } from '@/core/supabase'

import { getUserBalance } from '@/core/supabase'

export const runBalanceTests = async (): Promise<TestResult[]> => {
  const results: TestResult[] = []
  const { TEST_BOT_NAME, TEST_OWNER_ID } = TEST_CONFIG

  try {
    logger.info('🎯 Начало тестирования баланса', {
      description: 'Starting balance tests',
      test_bot: TEST_BOT_NAME,
    })

    // Очищаем тестовые данные
    const { error: deletePaymentsError } = await supabase
      .from('payments_v2')
      .delete()
      .eq('bot_name', TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_OWNER_ID))

    if (deletePaymentsError) {
      logger.error('❌ Ошибка при очистке тестовых платежей', {
        description: 'Error cleaning test payments',
        error: deletePaymentsError.message,
        details: deletePaymentsError,
      })
      throw deletePaymentsError
    }

    const { error: deleteUserError } = await supabase
      .from('users')
      .delete()
      .eq('bot_name', TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_OWNER_ID))

    if (deleteUserError) {
      logger.error('❌ Ошибка при очистке тестового пользователя', {
        description: 'Error cleaning test user',
        error: deleteUserError.message,
        details: deleteUserError,
      })
      throw deleteUserError
    }

    // Создаем тестового пользователя
    const { error: userError } = await supabase.from('users').insert({
      telegram_id: String(TEST_OWNER_ID),
      bot_name: TEST_BOT_NAME,
      is_active: true,
      is_bot_owner: true,
    })

    if (userError) {
      logger.error('❌ Ошибка при создании тестового пользователя', {
        description: 'Error creating test user',
        error: userError.message,
        details: userError,
      })
      throw userError
    }

    // Тест 1: Проверка начального баланса
    const initialBalance = await getUserBalance(TEST_OWNER_ID, TEST_BOT_NAME)

    results.push({
      name: 'Initial Balance Check',
      success: initialBalance === 0,
      message:
        initialBalance === 0
          ? '✅ Начальный баланс корректно установлен в 0'
          : '❌ Ошибка в начальном балансе',
      details: { expected: 0, actual: initialBalance },
    })

    // Тест 2: Добавление средств
    const { error: paymentError } = await supabase.from('payments_v2').insert({
      telegram_id: String(TEST_OWNER_ID),
      amount: 100,
      stars: 100,
      bot_name: TEST_BOT_NAME,
      status: 'COMPLETED',
      type: 'money_income',
      payment_method: 'rub',
      description: 'Test payment',
    })

    if (paymentError) {
      logger.error('❌ Ошибка при создании тестового платежа', {
        description: 'Error creating test payment',
        error: paymentError.message,
        details: paymentError,
      })
      throw paymentError
    }

    // Проверяем обновленный баланс
    const updatedBalance = await getUserBalance(TEST_OWNER_ID, TEST_BOT_NAME)

    results.push({
      name: 'Balance Update After Payment',
      success: updatedBalance === 100,
      message:
        updatedBalance === 100
          ? '✅ Баланс корректно обновлен после платежа'
          : '❌ Ошибка в обновлении баланса',
      details: { expected: 100, actual: updatedBalance },
    })

    // Очистка тестовых данных
    const { error: cleanupPaymentsError } = await supabase
      .from('payments_v2')
      .delete()
      .eq('bot_name', TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_OWNER_ID))

    if (cleanupPaymentsError) {
      logger.error('❌ Ошибка при очистке тестовых платежей', {
        description: 'Error cleaning up test payments',
        error: cleanupPaymentsError.message,
        details: cleanupPaymentsError,
      })
      throw cleanupPaymentsError
    }

    const { error: cleanupUserError } = await supabase
      .from('users')
      .delete()
      .eq('bot_name', TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_OWNER_ID))

    if (cleanupUserError) {
      logger.error('❌ Ошибка при очистке тестового пользователя', {
        description: 'Error cleaning up test user',
        error: cleanupUserError.message,
        details: cleanupUserError,
      })
      throw cleanupUserError
    }

    logger.info('✅ Тестирование баланса завершено', {
      description: 'Balance testing completed',
      results,
    })
  } catch (error) {
    logger.error('❌ Ошибка при тестировании баланса', {
      description: 'Error during balance testing',
      error: error instanceof Error ? error.message : String(error),
      details: error,
    })

    results.push({
      name: 'Balance Testing',
      success: false,
      message: `❌ Ошибка при тестировании: ${
        error instanceof Error ? error.message : String(error)
      }`,
      details: error,
    })
  }

  return results
}

/**
 * Тест для проверки работы функции add_stars_to_balance
 */
export async function testAddStarsToBalance(): Promise<TestResult> {
  const testName = 'add_stars_to_balance'

  logger.info('🚀 Начинаем тест add_stars_to_balance:', {
    description: 'Starting add_stars_to_balance test',
    test_config: TEST_CONFIG,
  })

  try {
    // Тестовый Telegram ID
    const testTelegramId = TEST_CONFIG.TEST_TELEGRAM_ID
    const botName = TEST_CONFIG.TEST_BOT_NAME

    // Получаем текущий баланс
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('balance, id')
      .eq('telegram_id', testTelegramId)
      .single()

    if (userError) {
      logger.error('❌ Ошибка при получении данных пользователя:', {
        description: 'Error getting user data',
        error: userError,
        telegram_id: testTelegramId,
      })
      throw userError
    }

    const initialBalance = userData?.balance || 0

    logger.info('ℹ️ Информация о тестовом пользователе:', {
      description: 'Test user information',
      telegram_id: testTelegramId,
      user_id: userData?.id,
      initial_balance: initialBalance,
    })

    // Тестовая сумма для добавления на баланс
    const testAmount = 5

    // Вызываем функцию add_stars_to_balance
    const { data: result, error: balanceError } = await supabase.rpc(
      'add_stars_to_balance',
      {
        p_telegram_id: testTelegramId,
        p_stars: testAmount,
        p_description: 'Test balance update',
        p_bot_name: botName,
        p_type: 'money_income',
        p_service_type: 'test',
      }
    )

    if (balanceError) {
      logger.error('❌ Ошибка при вызове add_stars_to_balance:', {
        description: 'Error calling add_stars_to_balance',
        error: balanceError,
        telegram_id: testTelegramId,
        amount: testAmount,
        bot_name: botName,
      })
      throw balanceError
    }

    logger.info('✅ Результат add_stars_to_balance:', {
      description: 'add_stars_to_balance result',
      result,
    })

    // Проверяем, что данные обновились
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', testTelegramId)
      .single()

    if (updateError) {
      logger.error('❌ Ошибка при получении обновленных данных:', {
        description: 'Error getting updated data',
        error: updateError,
        telegram_id: testTelegramId,
      })
      throw updateError
    }

    const newBalance = updatedUser?.balance || 0
    const expectedBalance = Number(initialBalance) + testAmount

    logger.info('ℹ️ Результаты изменения баланса:', {
      description: 'Balance change results',
      initialBalance,
      testAmount,
      expectedBalance,
      actualNewBalance: newBalance,
      isCorrect: newBalance === expectedBalance,
    })

    // Добавляем проверку на согласованность
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', testTelegramId)
      .order('payment_date', { ascending: false })
      .limit(1)

    if (paymentsError) {
      logger.error('❌ Ошибка при получении платежей:', {
        description: 'Error getting payments',
        error: paymentsError,
        telegram_id: testTelegramId,
      })
      throw paymentsError
    }

    logger.info('💾 Последняя запись о платеже:', {
      description: 'Last payment record',
      payment: payments[0],
    })

    // Тест для проверки причин возможной ошибки при expense
    // Делаем небольшое списание средств
    const expenseAmount = -2 // отрицательное значение для expense

    logger.info('🔍 Проверка списания средств (money_expense):', {
      description: 'Testing expense operation',
      telegram_id: testTelegramId,
      currentBalance: newBalance,
      expenseAmount,
    })

    const { data: expenseResult, error: expenseError } = await supabase.rpc(
      'add_stars_to_balance',
      {
        p_telegram_id: testTelegramId,
        p_stars: expenseAmount,
        p_description: 'Test expense operation',
        p_bot_name: botName,
        p_type: 'money_expense',
        p_service_type: 'test',
      }
    )

    if (expenseError) {
      logger.error('❌ Ошибка при списании средств:', {
        description: 'Error in expense operation',
        error: expenseError,
        telegram_id: testTelegramId,
        amount: expenseAmount,
        currentBalance: newBalance,
      })
    } else {
      logger.info('✅ Результат списания средств:', {
        description: 'Expense operation result',
        result: expenseResult,
      })
    }

    // Проверяем, что баланс корректно обновлен
    const isBalanceCorrect = newBalance === expectedBalance

    return {
      testName,
      success: isBalanceCorrect && !balanceError,
      message: isBalanceCorrect
        ? '✅ Тест успешно пройден: баланс корректно обновлен'
        : '❌ Тест не пройден: баланс не соответствует ожидаемому',
      details: {
        initialBalance,
        testAmount,
        expectedBalance,
        actualNewBalance: newBalance,
        rpcResult: result,
        lastPayment: payments[0],
        expenseTest: {
          success: !expenseError,
          result: expenseResult,
          error: expenseError ? String(expenseError) : null,
        },
      },
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка в тесте add_stars_to_balance:', {
      description: 'Critical error in add_stars_to_balance test',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
    })

    return {
      testName,
      success: false,
      message: `❌ Тест завершился с ошибкой: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}
