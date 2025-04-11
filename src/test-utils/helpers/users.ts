import { supabase } from '../../supabase'
import { logger } from '../../utils/logger'
import { TestUser } from '../../types/tests'

export async function createTestUser(telegramId: string, initialBalance: number = 0): Promise<TestUser | null> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .insert([
        { telegram_id: telegramId, balance: initialBalance }
      ])
      .select()
      .single()

    if (error) {
      logger.error('❌ Ошибка при создании тестового пользователя:', error)
      return null
    }

    return user as TestUser
  } catch (error) {
    logger.error('❌ Ошибка при создании тестового пользователя:', error)
    return null
  }
}
