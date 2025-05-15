import { supabase } from '@/core/supabase/client'
import { logger } from '../utils/logger'
import { TrainingStatus } from '../types'
import type { DigitalAvatarUserProfile } from '../types'

export interface ModelTraining {
  id?: string | number
  user_id: string
  model_name: string
  trigger_word?: string
  model_url?: string
  replicate_training_id?: string
  steps_amount?: number
  status?: TrainingStatus
  error_message?: string
  created_at?: string
  api?: 'replicate' | 'bfl'
  gender?: 'male' | 'female'
  bot_name?: string
  telegram_id?: string
  cost_in_stars?: number
  replicate_model_id?: string
  replicate_model_version?: string
  updated_at?: string
  public_url?: string
  photo_urls?: string[]
  message_id?: number
  cache_id?: string
  replicate_model_name?: string
}

export interface ModelTrainingArgs {
  user_id: string
  telegram_id: string
  model_name: string
  trigger_word?: string
  steps_amount?: number
  status: TrainingStatus
  gender?: 'male' | 'female' | 'other' | undefined
  replicate_training_id?: string
  replicate_model_version?: string
  model_url?: string
  error_message?: string
  api?: 'replicate' | 'fal.ai' | string
  bot_name?: string
  cost_in_stars?: number
}

export const createDigitalAvatarTraining = async (
  args: ModelTrainingArgs
): Promise<ModelTraining | null> => {
  const { data, error } = await supabase
    .from('model_trainings')
    .insert([
      {
        user_id: args.user_id,
        telegram_id: args.telegram_id,
        model_name: args.model_name,
        trigger_word: args.trigger_word,
        steps_amount: args.steps_amount,
        gender: args.gender,
        status: args.status || 'PENDING',
        api: args.api,
        bot_name: args.bot_name,
        cost_in_stars: args.cost_in_stars,
        replicate_training_id: args.replicate_training_id,
        replicate_model_version: args.replicate_model_version,
        model_url: args.model_url,
        error_message: args.error_message,
      },
    ])
    .select()
    .single()

  if (error) {
    logger.error('Supabase error in createDigitalAvatarTraining', {
      error: error.message,
      args,
    })
    return null
  }
  logger.info(
    `[modelTrainingsDb] Created training record ID: ${data?.id} for user ${args.telegram_id}, model ${args.model_name}`
  )
  return data as ModelTraining
}

export const updateDigitalAvatarTraining = async (
  trainingId: string | number,
  updates: Partial<ModelTraining>
): Promise<ModelTraining | null> => {
  const { data, error } = await supabase
    .from('model_trainings')
    .update(updates)
    .eq('id', trainingId)
    .select()
    .single()

  if (error) {
    logger.error('Supabase error in updateDigitalAvatarTraining', {
      error: error.message,
      trainingId,
      updates,
    })
    return null
  }
  logger.info(`[modelTrainingsDb] Updated training record ID: ${data?.id}`)
  return data as ModelTraining
}

export const setDigitalAvatarTrainingError = async (
  training_id: string | number,
  error_message: string
): Promise<ModelTraining | null> => {
  logger.warn(
    `[modelTrainingsDb] Setting error for training ID ${training_id}: ${error_message}`
  )
  return updateDigitalAvatarTraining(training_id, {
    status: 'FAILED',
    error_message: error_message.substring(0, 255),
  })
}

export const getDigitalAvatarTrainingByReplicateIdWithUserDetails = async (
  replicateTrainingId: string
): Promise<
  | (ModelTraining & {
      user: Pick<
        DigitalAvatarUserProfile,
        'telegram_id' | 'replicate_username' | 'id'
      > | null
    })
  | null
> => {
  const { data, error } = await supabase
    .from('model_trainings')
    .select(
      `
      *,
      user:users (
        id,
        telegram_id,
        replicate_username
      )
    `
    )
    .eq('replicate_training_id', replicateTrainingId)
    .single()

  if (error) {
    logger.error(
      '[modelTrainingsDb] Error fetching training by Replicate ID with user details',
      {
        replicateTrainingId,
        error: error.message,
      }
    )
    return null
  }

  if (!data) {
    logger.warn(
      `[modelTrainingsDb] No training found for Replicate ID ${replicateTrainingId}`
    )
    return null
  }
  const userProfile = Array.isArray(data.user)
    ? data.user[0] || null
    : data.user

  return { ...data, user: userProfile } as ModelTraining & {
    user: Pick<
      DigitalAvatarUserProfile,
      'telegram_id' | 'replicate_username' | 'id'
    > | null
  }
}

export const getDigitalAvatarTrainingById = async (
  trainingId: string | number
): Promise<ModelTraining | null> => {
  const { data, error } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('id', trainingId)
    .single()

  if (error) {
    logger.error('Supabase error in getDigitalAvatarTrainingById', {
      error: error.message,
      trainingId,
    })
    return null
  }
  logger.info(
    `[modelTrainingsDb] Fetched training record ID: ${data?.id} by its primary key.`
  )
  return data as ModelTraining
}
