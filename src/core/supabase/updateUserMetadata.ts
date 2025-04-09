import { supabase } from '.'
import { logger } from '@/utils/logger'
import { TelegramId, normalizeTelegramId } from '@/types/telegram.interface'

export interface UpdateUserMetadataParams {
  telegram_id: TelegramId
  metadata: Record<string, any>
}

export const updateUserMetadata = async ({
  telegram_id,
  metadata,
}: UpdateUserMetadataParams) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    if (!metadata) {
      throw new Error('metadata is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔄 Обновление метаданных пользователя:', {
      description: 'Updating user metadata',
      telegram_id: normalizedId,
      metadata,
    })

    const { data, error } = await supabase
      .from('users')
      .update({ metadata })
      .eq('telegram_id', normalizedId)
      .select()
      .single()

    if (error) {
      logger.error('❌ Ошибка при обновлении метаданных:', {
        description: 'Error updating metadata',
        error: error.message,
        telegram_id: normalizedId,
      })
      throw error
    }

    logger.info('✅ Метаданные успешно обновлены:', {
      description: 'Metadata updated successfully',
      telegram_id: normalizedId,
      user: data,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в updateUserMetadata:', {
      description: 'Error in updateUserMetadata function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
