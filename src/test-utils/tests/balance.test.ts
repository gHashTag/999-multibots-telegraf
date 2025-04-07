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

    // Получаем текущий баланс через функцию getUserBalance вместо прямого обращения к колонке balance
    const initialBalance = await getUserBalance(testTelegramId, botName)

    logger.info('ℹ️ Информация о тестовом пользователе:', {
      description: 'Test user information',
      telegram_id: testTelegramId,
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

    // Проверяем, что данные обновились - используем getUserBalance вместо прямого доступа к balance
    const newBalance = await getUserBalance(testTelegramId, botName)
    const expectedBalance = Number(initialBalance) + testAmount

    logger.info('ℹ️ Результаты изменения баланса:', {
      description: 'Balance change results',
      initialBalance,
      testAmount,
      expectedBalance,
      actualNewBalance: newBalance,
      isCorrect: newBalance === expectedBalance,
    })

    // Проверяем также, что платеж был добавлен в payments_v2
    const { data: paymentData, error: paymentError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', testTelegramId)
      .eq('stars', testAmount)
      .eq('bot_name', botName)
      .order('payment_date', { ascending: false })
      .limit(1)

    if (paymentError) {
      logger.error('❌ Ошибка при проверке записи payment_v2:', {
        description: 'Error checking payment_v2 record',
        error: paymentError,
        telegram_id: testTelegramId,
        currentBalance: newBalance,
      })
      throw paymentError
    }

    // Проверяем, что есть запись в payments_v2 и она правильная
    const paymentExists = paymentData && paymentData.length > 0
    const paymentIsCorrect =
      paymentExists &&
      paymentData[0].stars === testAmount &&
      paymentData[0].type === 'money_income'

    logger.info('ℹ️ Результаты проверки записи в payments_v2:', {
      description: 'Payment record check results',
      payment_exists: paymentExists,
      payment_is_correct: paymentIsCorrect,
      payment_data:
        paymentData && paymentData.length > 0 ? paymentData[0] : null,
      currentBalance: newBalance,
    })

    // Очищаем тестовые данные - удаляем платеж, который мы добавили
    const { error: cleanupError } = await supabase
      .from('payments_v2')
      .delete()
      .eq('telegram_id', testTelegramId)
      .eq('stars', testAmount)
      .eq('bot_name', botName)

    if (cleanupError) {
      logger.error('❌ Ошибка при очистке тестовых платежей:', {
        description: 'Error cleaning up test payments',
        error: cleanupError,
      })
    }

    const isBalanceCorrect = newBalance === expectedBalance

    return {
      name: testName,
      success: isBalanceCorrect && !balanceError,
      message: isBalanceCorrect
        ? '✅ Функция add_stars_to_balance работает корректно'
        : `❌ Ошибка в работе функции add_stars_to_balance. Ожидался баланс ${expectedBalance}, получен ${newBalance}`,
      details: {
        initialBalance,
        added: testAmount,
        expectedBalance,
        actualNewBalance: newBalance,
        paymentRecordFound: paymentExists,
        paymentRecordCorrect: paymentIsCorrect,
      },
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка в тесте add_stars_to_balance:', {
      description: 'Critical error in add_stars_to_balance test',
      error: error instanceof Error ? error.message : String(error),
      details: error,
    })

    return {
      name: testName,
      success: false,
      message: `❌ Критическая ошибка: ${
        error instanceof Error ? error.message : String(error)
      }`,
      details: error,
    }
  }
}
