import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
interface TextToVideoResponse {
  success: boolean
  videoUrl?: string
  message?: string
  prompt_id?: number
}

export async function generateTextToVideo(
  prompt: string,
  videoModel: string,
  telegram_id: string,
  username: string,
  isRu: boolean,
  botName: string
): Promise<TextToVideoResponse> {
  try {
    if (!prompt) {
      throw new Error(
        isRu
          ? 'generateTextToVideo: Не удалось определить промпт'
          : 'generateTextToVideo: Could not identify prompt'
      )
    }
    if (!videoModel) {
      throw new Error(
        isRu
          ? 'generateTextToVideo: Не удалось определить модель'
          : 'generateTextToVideo: Could not identify model'
      )
    }
    if (!telegram_id) {
      throw new Error(
        isRu
          ? 'generateTextToVideo: Не удалось определить telegram_id'
          : 'generateTextToVideo: Could not identify telegram_id'
      )
    }
    if (!username) {
      throw new Error(
        isRu
          ? 'generateTextToVideo: Не удалось определить username'
          : 'generateTextToVideo: Could not identify username'
      )
    }

    logger.info('🎬 Отправка события генерации видео', {
      description: 'Sending text-to-video generation event',
      prompt: prompt.substring(0, 50) + '...',
      videoModel,
      telegram_id,
      username,
      bot_name: botName,
    })

    // Отправляем событие в Inngest
    const result = await inngest.send({
      id: `text-to-video-${uuidv4()}`,
      name: 'text-to-video/generate',
      data: {
        prompt,
        videoModel,
        telegram_id,
        username,
        is_ru: isRu,
        bot_name: botName,
      },
    })

    logger.info('✅ Событие генерации видео отправлено', {
      description: 'Text-to-video generation event sent',
      event_id: result.ids[0],
    })

    return {
      success: true,
      message: isRu
        ? 'Запрос на генерацию видео отправлен'
        : 'Video generation request sent',
    }
  } catch (error) {
    logger.error('❌ Ошибка при отправке события генерации видео', {
      description: 'Error sending text-to-video generation event',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    throw new Error(
      isRu
        ? 'generateTextToVideo: Произошла ошибка при отправке запроса на генерацию видео'
        : 'generateTextToVideo: Error occurred while sending video generation request'
    )
  }
}
