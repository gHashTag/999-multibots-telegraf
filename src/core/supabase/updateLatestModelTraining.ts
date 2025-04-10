import { supabase } from '.'
import { TelegramId } from '@/interfaces/telegram.interface'
import { logger } from '@/utils/logger'
// Определяем тип для обновлений и экспортируем его
export type UpdateLatestModelTraining = {
  status?: string
  error?: string
  model_url?: string
  output_url?: string | null
  weights?: string | null
  replicate_training_id?: string
}

export const updateLatestModelTraining = async (
  telegram_id: TelegramId,
  modelName: string,
  updates: UpdateLatestModelTraining,
  api: string
) => {
  try {
    // Сначала выбираем последнюю запись по дате
    const { data, error: selectError } = await supabase
      .from('model_trainings')
      .select('id')
      .eq('telegram_id', telegram_id)
      .eq('model_name', modelName)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    logger.info({
      message: 'Последняя запись о тренировке',
      data: data,
    })

    if (selectError) {
      throw new Error(
        `Ошибка при получении последней записи о тренировке: ${selectError.message}`
      )
    }

    if (!data) {
      throw new Error('Последняя запись не найдена.')
    }

    // Обновляем последнюю запись
    const { error: updateError } = await supabase
      .from('model_trainings')
      .update({ ...updates, api })
      .eq('id', data.id)

    if (updateError) {
      throw new Error(
        `Ошибка при обновлении последней записи о тренировке: ${updateError.message}`
      )
    }
    return data
  } catch (error) {
    logger.error({
      message: 'Ошибка при обновлении последней записи о тренировке',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
