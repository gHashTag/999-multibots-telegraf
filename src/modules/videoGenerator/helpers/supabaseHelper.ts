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

    // telegram_id is NOT unique in `users` (~19 users have 2-3 rows -- see the
    // production measurement in updateUserBalance.ts). `.single()` returns a
    // PGRST116 error for those rows, so this returned null and the image-to-video
    // flow aborted with a misleading "user not found". Take the latest row,
    // mirroring getUserByTelegramId / updateUserBalance, which were migrated off
    // `.single()` for exactly this reason.
    const { data: userRows, error: dbError } = await supabase
      .from('users')
      .select('level, aspect_ratio') // Select only needed fields
      .eq('telegram_id', telegramId)
      .order('updated_at', { ascending: false })
      .limit(1)
    const user = userRows?.[0] ?? null

    if (dbError) {
      logger.error(
        `[getUserHelper] Supabase error for telegramId ${telegramId}:`,
        dbError
      )
    } else {
      logger.info(
        `[getUserHelper] Supabase result for telegramId ${telegramId}: ${
          user ? 'User found' : 'User not found'
        }`
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
    // Non-unique telegram_id: take the latest row, not `.single()` (which errors
    // for duplicate-row users, leaving their level un-incremented).
    const { data: levelRows, error: fetchError } = await supabase
      .from('users')
      .select('level')
      .eq('telegram_id', telegram_id)
      .order('updated_at', { ascending: false })
      .limit(1)
    const currentData = levelRows?.[0] ?? null

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
  // ВТОРАЯ ДВЕРЬ В ТУ ЖЕ ТАБЛИЦУ — теперь ведёт через общий путь.
  //
  // Здесь стояла собственная вставка в `assets` со ссылкой ПРОВАЙДЕРА. То есть
  // зеркалирование, добавленное в saveVideoUrlToSupabase, эту дорогу не
  // закрывало: видео из videoGenerator по-прежнему сохранялись ссылкой,
  // которая протухнет.
  //
  // Замер по хостам показал, чего это стоит: 1481 ссылка из 1496 уже отдаёт
  // 404 (replicate.delivery, replicate.com, tempfile.aiquickdraw.com — все;
  // живы только 15 у fal).
  //
  // Делегируем, а не копируем зеркалирование: две копии логики разъедутся, и
  // разъедутся молча — ровно так и вышло в прошлый раз.
  const { saveVideoUrlToSupabase } = await import(
    '@/core/supabase/saveVideoUrlToSupabase'
  )

  logger.info('[saveVideoUrlHelper] Called', {
    telegramId,
    videoUrl,
    videoPath,
    modelId,
  })

  const saved = await saveVideoUrlToSupabase({
    telegramId,
    publicUrl: videoUrl,
    storagePath: videoPath,
    type: modelId,
    triggerWord: 'video',
    text: 'Generated video',
  })

  // Молчать здесь нельзя: именно этот путь обслуживает image_to_video, у
  // которого с января 2026 НИ ОДНО списание не имеет следа в assets при сотне
  // списаний. Пока отказ не виден в журнале, вопрос «получил ли человек
  // видео» остаётся без ответа (docs/audit/paid-nothing-made.md).
  if (!saved) {
    logger.error('🎬❌ [saveVideoUrlHelper] Видео НЕ записано в assets', {
      alert: 'ГЕНЕРАЦИЯ ОПЛАЧЕНА, СЛЕДА НЕТ',
      telegramId,
      modelId,
      videoUrl: String(videoUrl).slice(0, 80),
    })
  }
}
