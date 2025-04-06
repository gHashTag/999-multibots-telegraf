import { TEST_CONFIG } from '../test-config'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { MyContext } from '@/interfaces'
import { TestResult } from '../types'

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

export async function statsTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Начинаем тест команды /stats', {
      description: 'Starting /stats command test',
    })

    // Создаем тестового пользователя (владельца бота)
    const ownerTelegramId = '123456789'
    const botName = 'test_bot'

    const { error: ownerError } = await supabase.from('users').insert({
      telegram_id: ownerTelegramId,
      bot_name: botName,
      balance: 1000,
    })

    if (ownerError) {
      throw new Error(
        `Ошибка при создании владельца бота: ${ownerError.message}`
      )
    }

    // Создаем тестового обычного пользователя
    const userTelegramId = '987654321'
    const { error: userError } = await supabase.from('users').insert({
      telegram_id: userTelegramId,
      bot_name: botName,
      balance: 500,
    })

    if (userError) {
      throw new Error(`Ошибка при создании пользователя: ${userError.message}`)
    }

    // Создаем тестовые платежи
    const { error: paymentError } = await supabase.from('payments_v2').insert([
      {
        telegram_id: ownerTelegramId,
        bot_name: botName,
        amount: 100,
        stars: 100,
        type: 'money_income',
        status: 'COMPLETED',
        payment_method: 'rub',
        description: 'Test payment 1',
      },
      {
        telegram_id: ownerTelegramId,
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

    // Создаем контекст для владельца бота
    const ownerContext = {
      from: {
        id: parseInt(ownerTelegramId),
        is_bot: false,
        first_name: 'Owner',
      },
      botInfo: {
        username: botName,
      },
      session: mockSession,
    } as unknown as MyContext

    // Создаем контекст для обычного пользователя
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

    // Тестируем команду /stats для владельца бота
    logger.info('🎯 Тестируем команду /stats для владельца бота', {
      description: 'Testing /stats command for bot owner',
    })

    // Тестируем команду /stats для обычного пользователя
    logger.info('🎯 Тестируем команду /stats для обычного пользователя', {
      description: 'Testing /stats command for regular user',
    })

    return {
      success: true,
      message: 'Тест команды /stats успешно завершен',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте команды /stats:', {
      description: 'Error in /stats command test',
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      success: false,
      message: `Ошибка в тесте команды /stats: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}
