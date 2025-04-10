import { supabase } from '.'
import { logger } from '@/utils/logger'
import { TelegramId, normalizeTelegramId } from '@/types/telegram.interface'

export const getUserSettings = async (telegram_id: TelegramId) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение настроек пользователя:', {
      description: 'Getting user settings',
      telegram_id: normalizedId,
    })

    const { data: user, error } = await supabase
      .from('users')
      .select('settings')
      .eq('telegram_id', normalizedId)
      .single()

    if (error) {
      logger.error('❌ Ошибка при получении настроек:', {
        description: 'Error getting settings',
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

    logger.info('✅ Настройки успешно получены:', {
      description: 'Settings retrieved successfully',
      telegram_id: normalizedId,
      settings: user.settings,
    })

    return user.settings
  } catch (error) {
    logger.error('❌ Ошибка в getUserSettings:', {
      description: 'Error in getUserSettings function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
