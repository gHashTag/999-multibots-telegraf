import { supabase } from '@/core/supabase'

export interface ModelTraining {
  id?: string | number
  user_id: string
  model_name: string
  trigger_word?: string
  zip_url: string
  cost?: number
  model_url?: string
  replicate_training_id?: string
  webhook_url?: string
  replicate_model_name?: string
  steps?: number
  status?: string
  error?: string
  created_at?: string
}

export const createModelTraining = async (training: ModelTraining) => {
  const { data, error } = await supabase
    .from('model_trainings')
    .insert(training)
  if (error)
    throw new Error(`Ошибка при создании записи о тренировке: ${error.message}`)
  return data
}
