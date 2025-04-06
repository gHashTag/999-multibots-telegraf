import { TEST_CONFIG } from '../test-config'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { getStatsCommand } from '@/handlers/getStatsCommand'
import { createMockContext } from '../helpers/createMockContext'
import { TestResult } from '../types'

export const runStatsTests = async (): Promise<TestResult[]> => {
  const results: TestResult[] = []
  const { TEST_BOT_NAME, TEST_OWNER_ID } = TEST_CONFIG

  try {
    logger.info('🎯 Начало тестирования команды /stats', {
      description: 'Starting /stats command tests',
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

    // Создаем тестовые платежи
    const testPayments = [
      {
        telegram_id: String(TEST_OWNER_ID),
        amount: 100,
        stars: 100,
        bot_name: TEST_BOT_NAME,
        status: 'COMPLETED',
        type: 'money_income',
        payment_method: 'rub',
        description: 'Test payment RUB',
      },
      {
        telegram_id: String(TEST_OWNER_ID),
        amount: 50,
        stars: 0,
        bot_name: TEST_BOT_NAME,
        status: 'COMPLETED',
        type: 'money_income',
        payment_method: 'stars',
        description: 'Test stars deposit',
      },
      {
        telegram_id: String(TEST_OWNER_ID),
        amount: 25,
        stars: 0,
        bot_name: TEST_BOT_NAME,
        status: 'COMPLETED',
        type: 'money_income',
        payment_method: 'bonus',
        description: 'Test bonus stars',
      },
      {
        telegram_id: String(TEST_OWNER_ID),
        amount: -30,
        stars: 0,
        bot_name: TEST_BOT_NAME,
        status: 'COMPLETED',
        type: 'money_expense',
        payment_method: 'stars',
        description: 'Test expense',
      },
    ]

    logger.info('💾 Создание тестовых платежей', {
      description: 'Creating test payments',
      payments: testPayments,
    })

    for (const payment of testPayments) {
      const { error } = await supabase.from('payments_v2').insert(payment)
      if (error) {
        logger.error('❌ Ошибка при создании тестового платежа', {
          description: 'Error creating test payment',
          error: error.message,
          details: error,
          payment,
        })
        throw error
      }
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

    // Тест 1: Проверка статистики для владельца
    const ownerContext = createMockContext({
      from: { id: TEST_OWNER_ID },
      botInfo: { username: TEST_BOT_NAME },
    })

    logger.info('🔍 Тестирование команды /stats для владельца', {
      description: 'Testing /stats command for owner',
      user_id: TEST_OWNER_ID,
      bot_name: TEST_BOT_NAME,
    })

    let replyMessage = ''
    ownerContext.reply = async (message: string) => {
      replyMessage = message
      return {} as any
    }

    await getStatsCommand(ownerContext as any)

    // Проверяем содержимое ответа
    const expectedValues = {
      total_rub_income: '100',
      stars_from_rub: '100',
      stars_income: '50',
      stars_spent: '30',
      bonus_stars: '25',
    }

    const hasAllExpectedValues = Object.entries(expectedValues).every(
      ([key, value]) => replyMessage.includes(value)
    )

    results.push({
      name: 'Stats Command - Owner Access',
      success: hasAllExpectedValues,
      message: hasAllExpectedValues
        ? '✅ Команда /stats корректно отображает статистику для владельца'
        : '❌ Ошибка в отображении статистики',
      details: {
        expected: expectedValues,
        received: replyMessage,
      },
    })

    // Тест 2: Проверка доступа для обычного пользователя
    const regularUserId = 987654321
    const userContext = createMockContext({
      from: { id: regularUserId },
      botInfo: { username: TEST_BOT_NAME },
    })

    // Создаем обычного пользователя
    const { error: regularUserError } = await supabase.from('users').insert({
      telegram_id: String(regularUserId),
      bot_name: TEST_BOT_NAME,
      is_active: true,
      is_bot_owner: false,
    })

    if (regularUserError) {
      logger.error('❌ Ошибка при создании обычного пользователя', {
        description: 'Error creating regular user',
        error: regularUserError.message,
        details: regularUserError,
      })
      throw regularUserError
    }

    logger.info('🔍 Тестирование команды /stats для обычного пользователя', {
      description: 'Testing /stats command for regular user',
      user_id: regularUserId,
      bot_name: TEST_BOT_NAME,
    })

    let regularUserReply = ''
    userContext.reply = async (message: string) => {
      regularUserReply = message
      return {} as any
    }

    await getStatsCommand(userContext as any)

    const accessDenied =
      regularUserReply.includes('нет прав') ||
      regularUserReply.includes('no permission')

    results.push({
      name: 'Stats Command - Regular User Access',
      success: accessDenied,
      message: accessDenied
        ? '✅ Команда /stats корректно ограничивает доступ для обычных пользователей'
        : '❌ Ошибка в ограничении доступа',
      details: {
        expected: 'Access denied message',
        received: regularUserReply,
      },
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

    const { error: cleanupUsersError } = await supabase
      .from('users')
      .delete()
      .eq('bot_name', TEST_BOT_NAME)

    if (cleanupUsersError) {
      logger.error('❌ Ошибка при очистке тестовых пользователей', {
        description: 'Error cleaning up test users',
        error: cleanupUsersError.message,
        details: cleanupUsersError,
      })
      throw cleanupUsersError
    }

    logger.info('✅ Тестирование команды /stats завершено', {
      description: 'Stats command testing completed',
      results,
    })
  } catch (error) {
    logger.error('❌ Ошибка при тестировании команды /stats', {
      description: 'Error during stats command testing',
      error: error instanceof Error ? error.message : String(error),
      details: error,
    })

    results.push({
      name: 'Stats Command Testing',
      success: false,
      message: `❌ Ошибка при тестировании: ${
        error instanceof Error ? error.message : String(error)
      }`,
      details: error,
    })
  }

  return results
}
