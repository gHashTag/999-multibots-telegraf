import { TelegramId } from '@/types/telegram.interface'
import { supabase } from '.'
import { ModelTraining } from '@/types'
import { logger } from '@/utils/logger'

export async function getLatestUserModel(
  telegram_id: TelegramId,
  api: string
): Promise<ModelTraining | null> {
  try {
    logger.info('🔍 Получение последней модели пользователя', {
      description: 'Getting latest user model',
      telegram_id,
      api,
    })

    const { data, error } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('status', 'SUCCESS')
      .eq('api', api)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      logger.error('❌ Ошибка при получении модели пользователя:', {
        description: 'Error getting user model',
        error: error.message,
        telegram_id,
        api,
      })
      return null
    }

    if (!data) {
      logger.warn('⚠️ Модель пользователя не найдена', {
        description: 'User model not found',
        telegram_id,
        api,
      })
      return null
    }

    logger.info('✅ Модель пользователя успешно получена', {
      description: 'User model retrieved successfully',
      telegram_id,
      api,
      model_id: data.id,
      model_url: data.model_url,
      created_at: data.created_at,
    })

    return data as ModelTraining
  } catch (error) {
    logger.error('❌ Неожиданная ошибка при получении модели:', {
      description: 'Unexpected error while getting user model',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
      api,
    })
    return null
  }
}
