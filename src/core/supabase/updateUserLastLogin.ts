import { supabase } from '.'
import { logger } from '@/utils/logger'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

export interface UpdateUserLastLoginParams {
  telegram_id: TelegramId
  last_login?: Date
}

export const updateUserLastLogin = async ({
  telegram_id,
  last_login = new Date(),
}: UpdateUserLastLoginParams) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔄 Обновление даты последнего входа:', {
      description: 'Updating last login date',
      telegram_id: normalizedId,
      last_login,
    })

    const { data, error } = await supabase
      .from('users')
      .update({ last_login: last_login.toISOString() })
      .eq('telegram_id', normalizedId)
      .select()
      .single()

    if (error) {
      logger.error('❌ Ошибка при обновлении даты последнего входа:', {
        description: 'Error updating last login date',
        error: error.message,
        telegram_id: normalizedId,
      })
      throw error
    }

    logger.info('✅ Дата последнего входа успешно обновлена:', {
      description: 'Last login date updated successfully',
      telegram_id: normalizedId,
      user: data,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в updateUserLastLogin:', {
      description: 'Error in updateUserLastLogin function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
