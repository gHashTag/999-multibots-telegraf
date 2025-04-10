import { supabase } from '.'
import { logger } from '@/utils/logger'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

export const getUserMetadata = async (telegram_id: TelegramId) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение метаданных пользователя:', {
      description: 'Getting user metadata',
      telegram_id: normalizedId,
    })

    const { data: user, error } = await supabase
      .from('users')
      .select('metadata')
      .eq('telegram_id', normalizedId)
      .single()

    if (error) {
      logger.error('❌ Ошибка при получении метаданных:', {
        description: 'Error getting metadata',
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

    logger.info('✅ Метаданные успешно получены:', {
      description: 'Metadata retrieved successfully',
      telegram_id: normalizedId,
      metadata: user.metadata,
    })

    return user.metadata
  } catch (error) {
    logger.error('❌ Ошибка в getUserMetadata:', {
      description: 'Error in getUserMetadata function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
