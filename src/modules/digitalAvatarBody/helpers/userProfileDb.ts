import { supabase } from '@/core/supabase/client'
import { logger } from '../utils/logger'

// Define a specific user profile type for this module's needs
export interface DigitalAvatarUserProfile {
  id: string // user_id in the database (UUID string)
  telegram_id: string // Added from User interface
  username: string // Changed to non-optional string
  level: number
  api?: string | null // Renamed from replicate_api_key for compatibility, was user.api
  replicate_username?: string | null
  neuro_tokens?: number // For balance checks
  balance: number // Added from User interface, will be mapped from neuro_tokens
  first_name?: string | null // Added optional field
  is_ru?: boolean // Added optional field
  last_name?: string | null // Added optional field (last_name is also used in mockUserFound)
  created_at?: Date // Changed to Date
  updated_at?: Date // Changed to Date
  // Add other fields if they are consistently needed by this module
}

const USERS_TABLE = 'users'

/**
 * Retrieves a user's profile relevant to digital avatar operations by their Telegram ID.
 * @param telegramId The user's Telegram ID.
 * @returns The user profile or null if not found or an error occurs.
 */
export async function getDigitalAvatarUserProfile(
  telegramId: string
): Promise<DigitalAvatarUserProfile | null> {
  try {
    // Fetching all fields that are part of DigitalAvatarUserProfile or needed for it
    const { data, error } = await supabase
      .from(USERS_TABLE)
      .select(
        'id, telegram_id, username, level, api, replicate_username, neuro_tokens, first_name, last_name, is_ru, created_at, updated_at'
      )
      .eq('telegram_id', telegramId)
      .maybeSingle<{
        id: string
        telegram_id: string
        username: string | null
        level: number
        api: string | null
        replicate_username: string | null
        neuro_tokens: number | null
        first_name: string | null
        last_name: string | null
        is_ru: boolean | null
        created_at: string | null // Supabase returns ISO string for timestamps
        updated_at: string | null // Supabase returns ISO string for timestamps
      }>()

    if (error) {
      logger.error(
        '[UserProfileDb] Error fetching user profile by Telegram ID',
        {
          telegramId,
          error: error.message,
          details: error.details,
        }
      )
      return null
    }
    if (!data || !data.username) {
      logger.warn(
        '[UserProfileDb] User data or username is null for Telegram ID',
        { telegramId }
      )
      return null
    }

    // Map to DigitalAvatarUserProfile, specifically setting balance from neuro_tokens
    const userProfile: DigitalAvatarUserProfile = {
      id: data.id,
      telegram_id: data.telegram_id,
      username: data.username,
      level: data.level ?? 0,
      api: data.api,
      replicate_username: data.replicate_username,
      neuro_tokens: data.neuro_tokens ?? 0,
      balance: 0, // Placeholder, this helper doesn't fetch balance directly
      first_name: data.first_name,
      last_name: data.last_name,
      is_ru: data.is_ru ?? undefined,
      created_at: data.created_at ? new Date(data.created_at) : undefined, // Convert to Date
      updated_at: data.updated_at ? new Date(data.updated_at) : undefined, // Convert to Date
    }

    return userProfile
  } catch (e: any) {
    logger.error('[UserProfileDb] Exception fetching user profile', {
      telegramId,
      error: e.message,
      stack: e.stack,
    })
    return null
  }
}

/**
 * Increments the user's level by one. (Placeholder for more specific logic if needed)
 * This is a simplified version. Consider if direct RPC call or more complex update is needed.
 * @param userId The user's database ID.
 * @param currentLevel The user's current level.
 * @returns True if the update was successful, false otherwise.
 */
export async function incrementUserLevelForAvatarTraining(
  userId: string,
  currentLevel: number
): Promise<boolean> {
  try {
    // This assumes a generic level update. If 'update_user_level_plus_one' was an RPC,
    // that would be better: await supabase.rpc('update_user_level_plus_one', { user_id_param: userId, current_level_param: currentLevel })
    const { error } = await supabase
      .from(USERS_TABLE)
      .update({ level: currentLevel + 1 })
      .eq('id', userId)

    if (error) {
      logger.error('[UserProfileDb] Error incrementing user level', {
        userId,
        currentLevel,
        error: error.message,
        details: error.details,
      })
      return false
    }
    logger.info('[UserProfileDb] User level incremented', {
      userId,
      newLevel: currentLevel + 1,
    })
    return true
  } catch (e: any) {
    logger.error('[UserProfileDb] Exception incrementing user level', {
      userId,
      error: e.message,
      stack: e.stack,
    })
    return false
  }
}

/**
 * Updates the user's neuro token balance.
 * @param userId The user's database ID.
 * @param amountChange The amount to add (positive) or subtract (negative) from the balance.
 * @param paymentType The type of payment operation (for logging or specific logic if needed).
 * @returns True if the update was successful, false otherwise.
 */
export async function updateUserNeuroTokens(
  userId: string,
  amountChange: number,
  paymentType?: string // Optional: if needed for logging or specific checks later
): Promise<boolean> {
  try {
    // Removed the getDigitalAvatarUserProfile call as it's not needed for RPC and expects telegramId.
    // The RPC call 'add_user_balance' directly uses userId.
    const { error } = await supabase.rpc('add_user_balance', {
      p_user_id: userId,
      p_amount: amountChange,
      p_payment_type: paymentType || 'DIGITAL_AVATAR_MODULE_OPERATION', // Generic type or make it more specific
    })

    if (error) {
      logger.error('[UserProfileDb] Error updating user neuro tokens via RPC', {
        userId,
        amountChange,
        paymentType,
        error: error.message,
        details: error.details,
      })
      return false
    }

    logger.info('[UserProfileDb] User neuro tokens updated via RPC', {
      userId,
      amountChange,
      paymentType,
    })
    return true
  } catch (e: any) {
    logger.error('[UserProfileDb] Exception updating user neuro tokens', {
      userId,
      amountChange,
      paymentType, // Added paymentType to log context
      error: e.message,
      stack: e.stack,
    })
    return false
  }
}
