import { supabase } from '@/core/supabase/client'
import { logger } from '../utils/logger'
// import {
//   ModelTraining as CoreModelTraining, // Renaming to avoid conflict if ModelTraining here is different
// } from '@/core/supabase/createModelTraining' // REMOVING THIS IMPORT AND CoreModelTraining EXTENSION
import { TrainingStatus } from '../types' // Assuming this is where TrainingStatus is defined

// Define ModelTraining independently for this module
export interface ModelTraining {
  // Fields from original CoreModelTraining that are relevant to this module
  id?: string | number // Usually string (uuid) from Supabase, but keeping flexible from original
  user_id: string // Foreign key to users table
  model_name: string
  trigger_word?: string
  // zip_url: string // Поле удалено, так как оно не сохраняется в БД
  model_url?: string
  replicate_training_id?: string
  steps_amount?: number // Using steps_amount as it's used in createDigitalAvatarTraining
  status?: TrainingStatus // Corrected from TrainingStatus
  error_message?: string
  created_at?: string // Supabase automatically handles this, but good for type if selected
  api?: 'replicate' | 'bfl'
  gender?: 'male' | 'female' | 'other' // Added gender as it was in the calling code
  bot_name?: string

  // Module-specific fields (already present)
  telegram_id?: string // Not in DB table, used for passing data into create function
  cost_in_stars?: number // This is now part of the primary definition here
  replicate_model_id?: string
  replicate_model_version?: string
}

const MODEL_TRAININGS_TABLE = 'model_trainings'

export interface ModelTrainingArgs {
  user_id: string
  telegram_id: string
  model_name: string
  trigger_word?: string
  // zip_url?: string // Поле удалено
  public_url?: string // Оставляем, если используется для других целей
  replicate_training_id?: string
  replicate_model_id?: string
  replicate_model_version?: string
  model_url?: string
  status?: TrainingStatus
  error_message?: string
  gender?: 'male' | 'female' | 'other' // Added gender as it was in the calling code
  api?: string
  bot_name?: string
  cost_in_stars?: number
  photo_urls?: string[]
  steps_amount?: number
  is_public?: boolean
  message_id?: number
  cache_id?: string
  replicate_model_name?: string
}

/**
 * Creates a new training record in the database for Digital Avatar.
 * @param args - The data for the new training record.
 * @returns The created training record or null if an error occurred.
 */
export async function createDigitalAvatarTraining(
  args: ModelTrainingArgs
): Promise<ModelTraining | null> {
  const {
    user_id,
    telegram_id,
    model_name,
    trigger_word,
    // zip_url, // Поле удалено
    public_url,
    replicate_training_id,
    replicate_model_id,
    replicate_model_version,
    model_url,
    status,
    error_message,
    gender,
    api,
    bot_name,
    cost_in_stars,
    photo_urls,
    steps_amount,
    is_public,
    message_id,
    cache_id,
    replicate_model_name,
  } = args

  try {
    const { data, error } = await supabase
      .from('model_trainings')
      .insert([
        {
          user_id,
          telegram_id,
          model_name,
          trigger_word,
          // zip_url, // Поле удалено
          public_url,
          replicate_training_id,
          replicate_model_id,
          replicate_model_version,
          model_url,
          status: status || 'PENDING',
          error_message,
          gender,
          api,
          bot_name,
          cost_in_stars,
          photo_urls,
          steps_amount,
          is_public,
          message_id,
          cache_id,
          replicate_model_name,
        },
      ])
      .select()
      .single()

    if (error) {
      logger.error('Error creating digital avatar training record', {
        error: error.message,
        args,
      })
      return null
    }
    logger.info('Digital avatar training record created successfully', {
      data,
    })
    return data as ModelTraining // Cast to ensure type compatibility
  } catch (e: any) {
    logger.error('Supabase error in createDigitalAvatarTraining', {
      error: e.message,
      args,
    })
    return null
  }
}

/**
 * Updates an existing training record for Digital Avatar.
 * @param trainingId - The ID of the training record to update.
 * @param updates - An object containing the fields to update.
 * @returns The updated training record or null if an error occurred.
 */
export async function updateDigitalAvatarTraining(
  trainingId: string, // Assuming trainingId is always a string from our DB
  updates: Partial<
    Omit<ModelTraining, 'id' | 'created_at' | 'user_id' | 'telegram_id'>
  > // Can't update user_id or telegram_id this way
): Promise<ModelTraining | null> {
  try {
    const { data, error } = await supabase
      .from(MODEL_TRAININGS_TABLE)
      .update(updates)
      .eq('id', trainingId)
      .select()
      .single<ModelTraining>()

    if (error) {
      logger.error(
        '[DB Error] Failed to update digital avatar training record',
        {
          trainingId,
          updates,
          error: error.message,
          details: error.details,
        }
      )
      return null
    }
    return data
  } catch (e: any) {
    logger.error(
      '[DB Exception] Exception during updateDigitalAvatarTraining',
      {
        error: e.message,
        stack: e.stack,
        trainingId,
        updates,
      }
    )
    return null
  }
}

/**
 * Sets the error field for a training record.
 * @param trainingId - The ID of the training record.
 * @param errorMessage - The error message to set.
 * @returns The updated training record or null if an error occurred.
 */
export async function setDigitalAvatarTrainingError(
  trainingId: string,
  errorMessage: string
): Promise<ModelTraining | null> {
  try {
    const { data, error } = await supabase
      .from(MODEL_TRAININGS_TABLE)
      .update({ status: 'FAILED', error: errorMessage })
      .eq('id', trainingId)
      .select()
      .single<ModelTraining>()

    if (error) {
      logger.error(
        '[DB Error] Failed to set error on digital avatar training record',
        {
          trainingId,
          errorMessage,
          error: error.message,
          details: error.details,
        }
      )
      return null
    }
    return data
  } catch (e: any) {
    logger.error(
      '[DB Exception] Exception during setDigitalAvatarTrainingError',
      {
        error: e.message,
        stack: e.stack,
        trainingId,
        errorMessage,
      }
    )
    return null
  }
}

/**
 * Sets the status of the latest training record for a given user and model name to FAILED and records an error message.
 * @param userId - The ID of the user.
 * @param modelName - The name of the model.
 * @param errorMessage - The error message to record.
 * @returns The updated training record or null if an error occurred or no matching record was found.
 */
export async function setLatestDigitalAvatarTrainingToError(
  userId: string,
  modelName: string,
  errorMessage: string
): Promise<ModelTraining | null> {
  try {
    const { data, error } = await supabase
      .from(MODEL_TRAININGS_TABLE)
      .update({ status: 'FAILED', error: errorMessage })
      .eq('user_id', userId)
      .eq('model_name', modelName)
      .order('created_at', { ascending: false })
      .limit(1)
      .select()
      .single<ModelTraining>() // .single() might error if no record is updated or found, or if multiple are (though limit(1) should prevent latter)

    if (error) {
      // Handle cases where no record was found by the criteria, or other DB errors
      logger.error(
        '[DB Error] Failed to set latest digital avatar training to error state',
        {
          userId,
          modelName,
          errorMessage,
          error: error.message,
          details: error.details,
        }
      )
      return null
    }
    // data will be null if no row was updated by the query with .limit(1).select().single()
    // or if the RLS policy prevented the update.
    // It's important to check if data is null before returning.
    if (!data) {
      logger.warn(
        '[DB Info] No matching record found to set to error state for user/model or RLS prevented update.',
        {
          userId,
          modelName,
        }
      )
      return null
    }
    return data
  } catch (e: any) {
    logger.error(
      '[DB Exception] Exception during setLatestDigitalAvatarTrainingToError',
      {
        error: e.message,
        stack: e.stack,
        userId,
        modelName,
        errorMessage,
      }
    )
    return null
  }
}

// New type for the joined data
export type ModelTrainingWithUserDetails = ModelTraining & {
  users: {
    telegram_id: string
    bot_name: string
    is_ru_language: boolean
  } | null // users can be null if join fails or no user found
}

/**
 * Retrieves a training record by its Replicate Training ID, joined with user details.
 * @param replicateTrainingId - The Replicate Training ID.
 * @returns The training record with user details or null if not found or an error occurred.
 */
export async function getDigitalAvatarTrainingByReplicateIdWithUserDetails(
  replicateTrainingId: string
): Promise<ModelTrainingWithUserDetails | null> {
  try {
    const { data, error } = await supabase
      .from(MODEL_TRAININGS_TABLE)
      .select(
        `
        *,
        users (
          telegram_id,
          bot_name,
          is_ru_language
        )
      `
      )
      .eq('replicate_training_id', replicateTrainingId)
      .single<ModelTrainingWithUserDetails>() // Use the new specific type here

    if (error) {
      logger.error(
        '[DB Error] Failed to get training by replicate_id with user details',
        {
          replicateTrainingId,
          error: error.message,
          details: error.details,
        }
      )
      return null
    }
    return data
  } catch (e: any) {
    logger.error(
      '[DB Exception] Exception during getDigitalAvatarTrainingByReplicateIdWithUserDetails',
      {
        error: e.message,
        stack: e.stack,
        replicateTrainingId,
      }
    )
    return null
  }
}
