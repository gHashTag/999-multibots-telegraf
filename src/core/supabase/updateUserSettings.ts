import { supabase } from '.'
import { logger } from '@/utils/logger'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

export interface UpdateUserSettingsParams {
  telegram_id: TelegramId
  settings: Record<string, any>
}

export const updateUserSettings = async ({
  telegram_id,
  settings,
}: UpdateUserSettingsParams) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    if (!settings) {
      throw new Error('settings is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔄 Обновление настроек пользователя:', {
      description: 'Updating user settings',
      telegram_id: normalizedId,
      settings,
    })

    const { data, error } = await supabase
      .from('users')
      .update({ settings })
      .eq('telegram_id', normalizedId)
      .select()
      .single()

    if (error) {
      logger.error('❌ Ошибка при обновлении настроек:', {
        description: 'Error updating settings',
        error: error.message,
        telegram_id: normalizedId,
      })
      throw error
    }

    logger.info('✅ Настройки успешно обновлены:', {
      description: 'Settings updated successfully',
      telegram_id: normalizedId,
      user: data,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в updateUserSettings:', {
      description: 'Error in updateUserSettings function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
