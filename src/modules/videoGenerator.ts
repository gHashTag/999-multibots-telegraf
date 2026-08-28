/**
 * ✅ ПРОСТОЙ RE-EXPORT модуля generateTextToVideo
 * Этот файл создан для обратной совместимости с handleTextToVideoDirect.ts
 */

import {
  generateTextToVideo as generateTextToVideoOriginal,
  VideoModelId,
} from '@/services/generateTextToVideo'

// Re-export generateImageToVideo
export { generateImageToVideo } from './videoGenerator/generateImageToVideo'

/**
 * Адаптер для старой сигнатуры функции
 */
export async function generateTextToVideo(
  prompt: string,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot_name: string,
  videoModel: VideoModelId,
  selectedResolution: undefined, // Не используется
  duration?: number,
  aspectRatio?: string
): Promise<{
  success: boolean
  videoUrl?: string
  jobId?: string
  error?: string
  message?: string
}> {
  return generateTextToVideoOriginal({
    prompt,
    telegram_id,
    username,
    is_ru,
    bot_name,
    videoModel,
    duration,
    aspectRatio,
  })
}
