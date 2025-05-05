import { supabase } from '@/core/supabase' // Keep importing the central client
import { logger } from '@/utils/logger' // Keep logger import

// --- getUser --- //
// Renamed from getUserByTelegramId and removed ctx dependency
export async function getUserHelper(
  telegramId: string
): Promise<{ level: number; aspect_ratio: string } | null> {
  logger.info('[getUserHelper] Function called')
  try {
    if (!telegramId) {
      logger.error('[getUserHelper] telegramId is missing!')
      throw new Error('Missing telegramId')
    }

    logger.info(
      `[getUserHelper] Attempting to find user with telegramId: ${telegramId}`
    )

    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('level, aspect_ratio') // Select only needed fields
      .eq('telegram_id', telegramId)
      .single()

    if (dbError) {
      logger.error(
        `[getUserHelper] Supabase error for telegramId ${telegramId}:`,
        dbError
      )
    } else {
      logger.info(
        `[getUserHelper] Supabase result for telegramId ${telegramId}: ${user ? 'User found' : 'User not found'}`
      )
    }

    if (!user && !dbError) {
      logger.warn(
        `[getUserHelper] No user data returned from Supabase for telegramId ${telegramId}, but no DB error reported.`
      )
    }

    // Return only the needed fields or null
    return user ? { level: user.level, aspect_ratio: user.aspect_ratio } : null
  } catch (error) {
    logger.error('[getUserHelper] Caught error:', error)
    return null
  }
}

// --- updateUserLevel --- //
// Renamed from updateUserLevelPlusOne, removed level param (always +1)
export async function updateUserLevelHelper(
  telegram_id: string
): Promise<void> {
  logger.info('[updateUserLevelHelper] Called for', { telegram_id })
  try {
    // Get current level first to increment
    const { data: currentData, error: fetchError } = await supabase
      .from('users')
      .select('level')
      .eq('telegram_id', telegram_id)
      .single()

    if (fetchError || !currentData) {
      logger.error('Error fetching current user level for update', {
        telegram_id,
        fetchError,
      })
      // Decide how to handle - maybe throw or just log and return
      return
    }

    const currentLevel = currentData.level
    const newLevel = currentLevel + 1

    const { data, error } = await supabase
      .from('users')
      .update({ level: newLevel })
      .eq('telegram_id', telegram_id)
      .select() // Optionally select to confirm

    if (error) {
      logger.error('Ошибка обновления уровня пользователя:', {
        telegram_id,
        error,
      })
    } else {
      logger.info('Уровень пользователя обновлен:', {
        telegram_id,
        newLevel,
        data,
      })
    }
  } catch (e) {
    logger.error('updateUserLevelHelper exception:', { telegram_id, error: e })
  }
}

// --- saveVideoUrl --- //
// Renamed from saveVideoUrlToSupabase
export async function saveVideoUrlHelper(
  telegramId: string,
  videoUrl: string,
  videoPath: string,
  modelId: string // Changed 'type' to 'modelId' for clarity
): Promise<void> {
  logger.info('[saveVideoUrlHelper] Called', {
    telegramId,
    videoUrl,
    videoPath,
    modelId,
  })
  const { error } = await supabase.from('assets').insert({
    type: modelId, // Use modelId as type
    trigger_word: 'video', // Keep as video?
    telegram_id: telegramId.toString(),
    storage_path: videoPath,
    public_url: videoUrl,
    text: 'Generated video', // Keep generic text?
  })

  if (error) {
    logger.error('Ошибка при сохранении URL видео в Supabase:', {
      telegramId,
      error,
    })
    throw new Error(`Supabase save video URL failed: ${error.message}`) // Throw error to be caught by caller
  } else {
    logger.info('URL видео успешно сохранен в Supabase', { telegramId })
  }
}
