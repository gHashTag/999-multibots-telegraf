import { supabase } from '.'
import { logger } from '@/utils/logger'
import { TelegramId, normalizeTelegramId } from '@/types/telegram.interface'

export const checkUserExists = async (
  telegram_id: TelegramId
): Promise<boolean> => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Проверка существования пользователя:', {
      description: 'Checking if user exists',
      telegram_id: normalizedId,
    })

    const { data, error } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('telegram_id', normalizedId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Пользователь не найден
        logger.info('ℹ️ Пользователь не найден:', {
          description: 'User not found',
          telegram_id: normalizedId,
        })
        return false
      }

      logger.error('❌ Ошибка при проверке пользователя:', {
        description: 'Error checking user existence',
        error: error.message,
        telegram_id: normalizedId,
      })
      throw error
    }

    const exists = !!data

    logger.info('✅ Проверка существования завершена:', {
      description: 'User existence check completed',
      telegram_id: normalizedId,
      exists,
    })

    return exists
  } catch (error) {
    logger.error('❌ Ошибка в checkUserExists:', {
      description: 'Error in checkUserExists function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
