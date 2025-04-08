import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

export const getUserStatus = async (telegram_id: TelegramId) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение статуса пользователя:', {
      description: 'Getting user status',
      telegram_id: normalizedId,
    })

    const { data: user, error } = await supabase
      .from('users')
      .select('status')
      .eq('telegram_id', normalizedId)
      .single()

    if (error) {
      logger.error('❌ Ошибка при получении статуса:', {
        description: 'Error getting status',
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

    logger.info('✅ Статус успешно получен:', {
      description: 'Status retrieved successfully',
      telegram_id: normalizedId,
      status: user.status,
    })

    return user.status
  } catch (error) {
    logger.error('❌ Ошибка в getUserStatus:', {
      description: 'Error in getUserStatus function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
