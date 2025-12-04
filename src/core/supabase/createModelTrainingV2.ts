/**
 * Create Model Training V2
 * Enhanced version with additional fields
 */

import { supabase } from './client'

export interface ModelTrainingV2 {
  finetune_id: string
  telegram_id: string
  model_name: string
  trigger_word: string
  zip_url: string
  steps?: number
  api?: string
  gender?: string
  bot_name?: string
  model_url?: string
  status?: string
  error?: string
}

export const createModelTrainingV2 = async (training: ModelTrainingV2) => {
  const { data, error } = await supabase
    .from('model_trainings')
    .insert({
      user_id: training.telegram_id,
      model_name: training.model_name,
      trigger_word: training.trigger_word,
      zip_url: training.zip_url,
      model_url: training.model_url,
      replicate_training_id: training.finetune_id,
      status: training.status || 'pending',
      error: training.error,
      // Additional fields can be stored in metadata or separate columns
      steps: training.steps,
      api: training.api,
      gender: training.gender,
      bot_name: training.bot_name,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Ошибка при создании записи о тренировке: ${error.message}`)
  }

  return data
}

