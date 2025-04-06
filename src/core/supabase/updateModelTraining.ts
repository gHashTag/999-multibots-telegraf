import { supabase } from '.'
import { TelegramId } from '@/interfaces/telegram.interface'
// Определяем тип для обновлений и экспортируем его
export type ModelTrainingUpdate = {
  status?: string
  error?: string
  model_url?: string
  replicate_training_id?: string
}

export const updateModelTraining = async (
  user_id: TelegramId,
  model_name: string,
  updates: ModelTrainingUpdate
) => {
  const { error } = await supabase
    .from('model_trainings')
    .update(updates)
    .eq('user_id', user_id)
    .eq('model_name', model_name)
    .eq('status', 'processing')
  if (error)
    throw new Error(
      `Ошибка при обновлении записи о тренировке: ${error.message}`
    )
}
