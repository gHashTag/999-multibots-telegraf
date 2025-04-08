import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

export const getUser = async (telegram_id: TelegramId) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение информации о пользователе:', {
      description: 'Getting user information',
      telegram_id: normalizedId,
    })

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', normalizedId)
      .single()

    if (error) {
      logger.error('❌ Ошибка при получении пользователя:', {
        description: 'Error getting user',
        error: error.message,
        telegram_id: normalizedId,
      })
      throw error
    }

    if (!user) {
      logger.info('ℹ️ Пользователь не найден:', {
        description: 'User not found',
        telegram_id: normalizedId,
      })
      return null
    }

    logger.info('✅ Пользователь успешно получен:', {
      description: 'User retrieved successfully',
      telegram_id: normalizedId,
      user,
    })

    return user
  } catch (error) {
    logger.error('❌ Ошибка в getUser:', {
      description: 'Error in getUser function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
