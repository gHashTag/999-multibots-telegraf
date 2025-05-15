import { supabase } from '@/core/supabase/client'
import { logger } from '../utils/logger'
// import {
//   ModelTraining as CoreModelTraining, // Renaming to avoid conflict if ModelTraining here is different
// } from '@/core/supabase/createModelTraining' // REMOVING THIS IMPORT AND CoreModelTraining EXTENSION

// Define ModelTraining independently for this module
export interface ModelTraining {
  // Fields from original CoreModelTraining that are relevant to this module
  id?: string | number // Usually string (uuid) from Supabase, but keeping flexible from original
  user_id: string // Foreign key to users table
  model_name: string
  trigger_word?: string
  zip_url: string
  model_url?: string
  replicate_training_id?: string
  steps_amount?: number // Using steps_amount as it's used in createDigitalAvatarTraining
  status?:
    | 'PENDING'
    // | 'SUCCESS' // Prefer SUCCEEDED from module logic
    | 'PROCESSING'
    | 'FAILED'
    | 'CANCELED'
    | 'SUCCEEDED'
  error?: string
  created_at?: string // Supabase automatically handles this, but good for type if selected
  api?: 'replicate' | 'bfl'
  gender?: 'male' | 'female' | 'other' // Aligning with payload types, DB might be string
  bot_name?: string

  // Module-specific fields (already present)
  telegram_id?: string // Not in DB table, used for passing data into create function
  cost_in_stars?: number // This is now part of the primary definition here
}

const MODEL_TRAININGS_TABLE = 'model_trainings'

/**
 * Creates a new training record in the database for Digital Avatar.
 * @param trainingDataWithTgId - The data for the new training record, including telegram_id.
 * @returns The created training record or null if an error occurred.
 */
export async function createDigitalAvatarTraining(
  trainingDataWithTgId: Omit<ModelTraining, 'id' | 'created_at'>
): Promise<ModelTraining | null> {
  try {
    const { telegram_id, ...dbInsertData } = trainingDataWithTgId // Destructure to exclude telegram_id

    const { data, error } = await supabase
      .from(MODEL_TRAININGS_TABLE)
      .insert(dbInsertData as any) // Insert data without telegram_id
      .select()
      .single<ModelTraining>()

    if (error) {
      logger.error(
        '[DB Error] Failed to create digital avatar training record',
        {
          error: error.message,
          details: error.details,
          trainingData: dbInsertData, // Log data that was attempted to insert
        }
      )
      return null
    }
    // If insert was successful, data might not contain telegram_id as it wasn't in dbInsertData
    // However, the full ModelTraining type expects it optionally.
    // For consistency, let's ensure the returned object matches the input if it had telegram_id.
    // This part is tricky as `select().single()` returns what's in DB.
    // It's better if the caller handles the telegram_id separately if needed after creation.
    // For now, we return what Supabase returns, which won't have telegram_id.
    return data
  } catch (e: any) {
    logger.error(
      '[DB Exception] Exception during createDigitalAvatarTraining',
      {
        error: e.message,
        stack: e.stack,
        trainingData: trainingDataWithTgId, // Log original data
      }
    )
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
