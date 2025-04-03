import { writeFile } from 'fs/promises'
import { logger } from './logger'
import axios from 'axios'

/**
 * Скачивает видео по URL и сохраняет его в указанный путь
 * @param videoUrl URL видео для скачивания
 * @param videoLocalPath Локальный путь для сохранения видео
 * @returns Путь к сохраненному видео
 */
export async function saveVideoToPath(
  videoUrl: string,
  videoLocalPath: string
): Promise<string> {
  try {
    logger.info('🎥 Скачивание видео', {
      description: 'Downloading video',
      url: videoUrl,
    })

    // Скачиваем видео
    const response = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
    })

    const videoBuffer = Buffer.from(response.data)

    logger.info('💾 Сохранение видео', {
      description: 'Writing video to file',
      path: videoLocalPath,
      bufferSize: videoBuffer.length,
    })

    await writeFile(videoLocalPath, videoBuffer.toString('base64'), 'base64')

    logger.info('✅ Видео сохранено', {
      description: 'Video saved',
      path: videoLocalPath,
    })

    return videoLocalPath
  } catch (error) {
    logger.error('❌ Ошибка при сохранении видео', {
      description: 'Error saving video',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      videoUrl,
    })
    throw error
  }
}
