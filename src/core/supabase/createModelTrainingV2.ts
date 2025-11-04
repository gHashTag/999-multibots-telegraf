/**
 * Create Model Training V2
 * Заглушка для функции создания обучения модели v2
 */

import { supabase } from './client'

interface CreateModelTrainingV2Params {
  user_id: string
  model_name?: string
  images?: string[]
  status?: 'pending' | 'processing' | 'completed' | 'failed'
}

/**
 * Создает новую запись об обучении модели v2
 */
export async function createModelTrainingV2(params: CreateModelTrainingV2Params): Promise<any> {
  console.log('Creating model training v2:', params)

  const { data, error } = await supabase
    .from('model_training')
    .insert({
      user_id: params.user_id,
      model_name: params.model_name || 'default_model',
      status: params.status || 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating model training v2:', error)
    throw error
  }

  return data
}

export default createModelTrainingV2
