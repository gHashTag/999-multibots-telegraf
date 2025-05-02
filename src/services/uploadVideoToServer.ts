import { logger } from '@/utils/logger'
import { VideoService } from '@/services/plan_b/videoService'

interface UploadVideoRequest {
  videoUrl: string
  telegram_id: number
  fileName: string
}

/**
 * Загружает видео локально с использованием VideoService.
 * @param requestData Данные для загрузки видео.
 * @returns Локальный путь к загруженному видео.
 */
export const uploadVideoToServer = async (
  requestData: UploadVideoRequest
): Promise<string> => {
  try {
    const { videoUrl, telegram_id, fileName } = requestData

    logger.info('🔄 Загрузка видео локально:', {
      videoUrl,
      telegram_id,
      fileName,
    })

    const videoService = new VideoService()

    const localPath = await videoService.processVideo(
      videoUrl,
      telegram_id,
      fileName
    )

    logger.info('✅ Видео успешно загружено локально:', { localPath })

    return localPath
  } catch (error) {
    logger.error('❌ Ошибка при локальной загрузке видео:', {
      error: error instanceof Error ? error.message : String(error),
      requestData,
    })
    throw new Error(`Failed to process video locally: ${error}`)
  }
}
