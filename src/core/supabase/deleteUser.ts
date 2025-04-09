import { supabase } from '.'
import { logger } from '@/utils/logger'
import { TelegramId, normalizeTelegramId } from '@/types/telegram.interface'

export const deleteUser = async (telegram_id: TelegramId) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🗑️ Удаление пользователя:', {
      description: 'Deleting user',
      telegram_id: normalizedId,
    })

    const { data, error } = await supabase
      .from('users')
      .delete()
      .eq('telegram_id', normalizedId)
      .select()
      .single()

    if (error) {
      logger.error('❌ Ошибка при удалении пользователя:', {
        description: 'Error deleting user',
        error: error.message,
        telegram_id: normalizedId,
      })
      throw error
    }

    logger.info('✅ Пользователь успешно удален:', {
      description: 'User deleted successfully',
      telegram_id: normalizedId,
      user: data,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в deleteUser:', {
      description: 'Error in deleteUser function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
