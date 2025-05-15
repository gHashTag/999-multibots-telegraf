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
  steps_amount?: number
  status?:
    | 'PENDING'
    | 'SUCCESS'
    | 'PROCESSING'
    | 'FAILED'
    | 'CANCELED'
    | 'SUCCEEDED'
  error?: string
  created_at?: string
  api?: 'replicate' | 'bfl'
  gender?: string
  cost_in_stars?: number
  is_ru_language?: boolean
  bot_name?: string
}

export const createModelTraining = async (training: ModelTraining) => {
  const { data, error } = await supabase
    .from('model_trainings')
    .insert(training)
  if (error)
    throw new Error(`Ошибка при создании записи о тренировке: ${error.message}`)
  return data
}
