import { supabase } from '.'
import { logger } from '@/utils/logger'
import { User } from '@/types/user.interface'
import { TelegramId } from '@/types/telegram.interface'

/**
 * Получает информацию о пользователе по его Telegram ID
 */
export const getUserByTelegramId = async (
  telegram_id: TelegramId,
  bot_name?: string
): Promise<User | null> => {
  try {
    logger.info('🔍 Поиск пользователя по telegram_id', {
      description: 'Finding user by telegram_id',
      telegram_id,
      bot_name,
    })

    // Нормализуем telegram_id к строке
    const normalizedTelegramId = String(telegram_id)

    let query = supabase
      .from('users')
      .select('*')
      .eq('telegram_id', normalizedTelegramId)

    // Если указан bot_name, добавляем его в условие
    if (bot_name) {
      query = query.eq('bot_name', bot_name)
    }

    const { data, error } = await query.single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 - это код ошибки "не найдено", его не логируем как ошибку
      logger.error('❌ Ошибка при поиске пользователя:', {
        description: 'Error finding user',
        error: error.message,
        error_details: error,
        telegram_id,
        bot_name,
      })
      return null
    }

    if (!data) {
      logger.info('ℹ️ Пользователь не найден:', {
        description: 'User not found',
        telegram_id,
        bot_name,
      })
      return null
    }

    logger.info('✅ Пользователь найден:', {
      description: 'User found',
      user_id: data.id,
      telegram_id,
      bot_name,
    })

    return data as User
  } catch (error) {
    logger.error('❌ Ошибка в getUserByTelegramId:', {
      description: 'Error in getUserByTelegramId function',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      telegram_id,
      bot_name,
    })
    return null
  }
}
