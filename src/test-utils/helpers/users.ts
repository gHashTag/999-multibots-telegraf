import { supabase } from '../../supabase'
import { logger } from '../../utils/logger'
import { TestUser } from '../../types/tests'

export async function createTestUser(
  telegramId: string,
  initialBalance: number = 0
): Promise<TestUser | null> {
  try {
    logger.info(`🧪 Попытка создания тестового пользователя: ${telegramId}`)
    const { data: user, error } = await supabase
      .from('users')
      .insert([{ telegram_id: telegramId }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        logger.warn(
          `⚠️ Тестовый пользователь с telegram_id ${telegramId} уже существует.`
        )
        const { data: existingUser, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', telegramId)
          .single()
        if (fetchError) {
          logger.error(
            `❌ Ошибка при получении существующего пользователя ${telegramId}:`,
            fetchError
          )
          return null
        }
        logger.info(
          `✅ Возвращен существующий тестовый пользователь: ${telegramId}`
        )
        return existingUser as TestUser
      } else {
        logger.error(
          `❌ Ошибка при создании тестового пользователя ${telegramId}:`,
          error
        )
        return null
      }
    }
    logger.info(`✅ Тестовый пользователь успешно создан: ${telegramId}`)
    return user as TestUser
  } catch (error) {
    logger.error(
      `❌ Непредвиденная ошибка при создании тестового пользователя ${telegramId}:`,
      error
    )
    return null
  }
}
