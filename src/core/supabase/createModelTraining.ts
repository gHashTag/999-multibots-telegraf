import { supabase } from '@/core/supabase'

export interface ModelTraining {
  user_id?: string
  telegram_id?: string
  model_name: string
  trigger_word: string
  zip_url: string
  steps?: number
  model_url?: string
  replicate_training_id?: string
  cancel_url?: string
  status?: string
  error?: string
  gender?: string
  bot_name?: string
}

export const createModelTraining = async (training: ModelTraining) => {
  const { data, error } = await supabase
    .from('model_trainings')
    .insert(training)
    .select()
    .single()
  if (error)
    throw new Error(`Ошибка при создании записи о тренировке: ${error.message}`)
  return data
}
