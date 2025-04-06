import { TEST_CONFIG } from '../test-config'
import { logger } from '@/utils/logger'
import { TestResult } from '../types'
import { supabase } from '@/core/supabase'

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
    const { data: initialBalance, error: initialError } = await supabase.rpc(
      'get_user_balance',
      {
        p_telegram_id: String(TEST_OWNER_ID),
        p_bot_name: TEST_BOT_NAME,
      }
    )

    if (initialError) {
      logger.error('❌ Ошибка при проверке начального баланса', {
        description: 'Error checking initial balance',
        error: initialError.message,
        details: initialError,
      })
      throw initialError
    }

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
    const { data: updatedBalance, error: updateError } = await supabase.rpc(
      'get_user_balance',
      {
        p_telegram_id: String(TEST_OWNER_ID),
        p_bot_name: TEST_BOT_NAME,
      }
    )

    if (updateError) {
      logger.error('❌ Ошибка при проверке обновленного баланса', {
        description: 'Error checking updated balance',
        error: updateError.message,
        details: updateError,
      })
      throw updateError
    }

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
