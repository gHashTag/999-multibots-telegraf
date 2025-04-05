import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TEST_CONFIG } from '../test-config'

/**
 * Создает тестового пользователя в базе данных
 */
export async function createTestUser(telegram_id: string): Promise<void> {
  try {
    logger.info({
      message: '👤 Создание тестового пользователя',
      description: 'Creating test user',
      telegram_id,
    })

    const { error } = await supabase.from('users').insert({
      telegram_id,
      balance: 1000,
      subscription: 'free',
      level: 1,
      bot_name: TEST_CONFIG.bots.default,
    })

    if (error) {
      logger.error({
        message: '❌ Ошибка создания тестового пользователя',
        description: 'Error creating test user',
        error: error.message,
        telegram_id,
      })
      throw error
    }

    logger.info({
      message: '✅ Тестовый пользователь создан',
      description: 'Test user created successfully',
      telegram_id,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в createTestUser',
      description: 'Error in createTestUser function',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
    })
    throw error
  }
}
