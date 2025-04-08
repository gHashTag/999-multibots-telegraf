import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

export interface UpdateUserStatusParams {
  telegram_id: TelegramId
  status: string
}

export const updateUserStatus = async ({
  telegram_id,
  status,
}: UpdateUserStatusParams) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    if (!status) {
      throw new Error('status is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔄 Обновление статуса пользователя:', {
      description: 'Updating user status',
      telegram_id: normalizedId,
      status,
    })

    const { data, error } = await supabase
      .from('users')
      .update({ status })
      .eq('telegram_id', normalizedId)
      .select()
      .single()

    if (error) {
      logger.error('❌ Ошибка при обновлении статуса:', {
        description: 'Error updating status',
        error: error.message,
        telegram_id: normalizedId,
      })
      throw error
    }

    logger.info('✅ Статус успешно обновлен:', {
      description: 'Status updated successfully',
      telegram_id: normalizedId,
      user: data,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в updateUserStatus:', {
      description: 'Error in updateUserStatus function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
