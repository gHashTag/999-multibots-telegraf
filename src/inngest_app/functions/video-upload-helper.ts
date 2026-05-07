/**
 * Video Upload Helper для Supabase Storage
 * Переиспользуем логику из ai-reels-wizard
 */

import { logger } from '@/utils/logger'
import fs from 'fs/promises'

/**
 * Загружает видео файл в Supabase Storage и возвращает публичный URL
 */
export async function uploadVideoToSupabase(
  videoFilePath: string,
  fileName: string,
  telegramId: string
): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js')
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import('@/config')

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase configuration not found')
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  logger.info('☁️ [SUPABASE] Загружаем видео', {
    fileName,
    telegramId,
    videoSize: (await fs.stat(videoFilePath)).size,
  })

  // Читаем файл
  const videoBuffer = await fs.readFile(videoFilePath)

  // Путь в storage
  const storagePath = `ai-reels-videos/${telegramId}/${fileName}`

  // Загружаем в Supabase Storage
  const { error: uploadError } = await serviceClient.storage
    .from('images') // используем существующий bucket 'images'
    .upload(storagePath, videoBuffer, {
      contentType: 'video/mp4',
      upsert: false,
    })

  if (uploadError) {
    logger.error('❌ [SUPABASE] Ошибка загрузки видео', {
      error: uploadError,
      fileName,
      storagePath,
    })
    throw new Error(`Supabase upload failed: ${uploadError.message}`)
  }

  // Получаем публичный URL
  const { data: urlData } = serviceClient.storage
    .from('images')
    .getPublicUrl(storagePath)

  const publicUrl = urlData.publicUrl

  logger.info('✅ [SUPABASE] Видео загружено', {
    fileName,
    publicUrl: publicUrl.substring(0, 100),
    storagePath,
  })

  // Опционально: сохраняем информацию о видео в таблицу assets
  try {
    const { saveVideoUrlToSupabase } = await import('@/core/supabase/saveVideoUrlToSupabase')
    await saveVideoUrlToSupabase(telegramId, publicUrl, storagePath, 'ai_reels_inngest')
  } catch (saveError) {
    logger.warn('⚠️ [SUPABASE] Не удалось сохранить информацию в таблицу assets', {
      error: saveError,
    })
    // Не критично, продолжаем
  }

  return publicUrl
}
