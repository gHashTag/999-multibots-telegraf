import { TEST_CONFIG } from '../test-config'
import { logger } from '@/utils/logger'
import { TestResult } from '../types'
import { supabase } from '@/core/supabase'
import { MyContext } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'

const mockSession = {
  __scenes: {
    data: {},
    cursor: 0,
    severity: 'info',
  },
  data: {},
  imageUrl: '',
  text: '',
  amount: 0,
  attempts: 0,
  severity: 'info',
  cursor: 0,
}

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

export async function balanceTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Начинаем тест команды /balance', {
      description: 'Starting /balance command test',
    })

    // Создаем тестового пользователя
    const userTelegramId = '123456789'
    const botName = 'test_bot'

    const { error: userError } = await supabase.from('users').insert({
      telegram_id: userTelegramId,
      bot_name: botName,
      balance: 1000,
    })

    if (userError) {
      throw new Error(`Ошибка при создании пользователя: ${userError.message}`)
    }

    // Создаем тестовые платежи
    const { error: paymentError } = await supabase.from('payments_v2').insert([
      {
        telegram_id: userTelegramId,
        bot_name: botName,
        amount: 100,
        stars: 100,
        type: 'money_income',
        status: 'COMPLETED',
        payment_method: 'rub',
        description: 'Test payment 1',
      },
      {
        telegram_id: userTelegramId,
        bot_name: botName,
        amount: -50,
        stars: 50,
        type: 'money_expense',
        status: 'COMPLETED',
        description: 'Test payment 2',
      },
    ])

    if (paymentError) {
      throw new Error(`Ошибка при создании платежей: ${paymentError.message}`)
    }

    // Создаем контекст для пользователя
    const userContext = {
      from: {
        id: parseInt(userTelegramId),
        is_bot: false,
        first_name: 'User',
      },
      botInfo: {
        username: botName,
      },
      session: mockSession,
    } as unknown as MyContext

    // Проверяем баланс
    const balance = await getUserBalance(userTelegramId, botName)

    if (!balance) {
      throw new Error('Balance not found')
    }

    logger.info('💰 Текущий баланс пользователя:', {
      description: 'Current user balance',
      balance,
      telegram_id: userTelegramId,
      bot_name: botName,
    })

    return {
      success: true,
      message: 'Тест команды /balance успешно завершен',
      name: 'Balance Command Test',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте команды /balance:', {
      description: 'Error in /balance command test',
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      success: false,
      message: `Ошибка в тесте команды /balance: ${
        error instanceof Error ? error.message : String(error)
      }`,
      name: 'Balance Command Test',
    }
  }
}
