import { supabase } from '.'
import { logger } from '@/utils/logger'

export interface TrainingWithUser {
  id: string
  model_name: string
  replicate_training_id: string
  status: string
  users: {
    bot_name: string
    telegram_id: number
    language_code: string
  } | null
}

export async function getTrainingWithUser(
  trainingId: string
): Promise<TrainingWithUser | null> {
  try {
    const { data, error } = await supabase
      .from('model_trainings')
      .select(
        `*,
        users (
          bot_name,
          telegram_id,
          language_code
        )
      `
      )
      .eq('replicate_training_id', trainingId)
      .single()

    if (error) {
      logger.error({
        message: '❌ Ошибка при получении данных о тренировке',
        error: error.message,
        trainingId,
      })
      return null
    }

    logger.debug({
      message: '🔍 Данные о тренировке получены',
      trainingId,
      training: data ? data.id : null,
    })

    return data as TrainingWithUser
  } catch (error) {
    logger.error({
      message: '❌ Критическая ошибка при получении данных о тренировке',
      error: error.message,
      stack: error.stack,
      trainingId,
    })
    return null
  }
}
