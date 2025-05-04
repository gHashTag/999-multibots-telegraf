import type {
  UploadVideoServiceDependencies,
  UploadVideoServiceRequest,
  UploadVideoServiceResponse,
} from './types'

/**
 * Загружает видео локально с использованием предоставленного VideoService.
 * @param requestData Данные для загрузки видео.
 * @param dependencies Внедренные зависимости (logger, videoService).
 * @returns Объект с локальным путем к загруженному видео.
 */
export const uploadVideoService = async (
  requestData: UploadVideoServiceRequest,
  dependencies: UploadVideoServiceDependencies
): Promise<UploadVideoServiceResponse> => {
  const { logger, videoService } = dependencies
  const { videoUrl, telegram_id, fileName } = requestData

  logger.info('🔄 Загрузка видео локально (через модуль):', {
    videoUrl,
    telegram_id,
    fileName,
  })

  try {
    // Вызываем метод processVideo из внедренной зависимости videoService
    const localPath = await videoService.processVideo(
      videoUrl,
      telegram_id,
      fileName
    )

    logger.info('✅ Видео успешно загружено локально (через модуль):', {
      localPath,
    })

    return { localPath }
  } catch (error) {
    logger.error('❌ Ошибка при локальной загрузке видео (через модуль):', {
      error: error instanceof Error ? error.message : String(error),
      requestData,
    })
    // Перебрасываем ошибку для обработки выше
    // Можно добавить более специфичную обработку или обертку ошибки здесь
    throw new Error(
      `Failed to process video locally via module: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
