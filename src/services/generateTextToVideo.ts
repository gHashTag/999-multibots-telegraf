import axios, { isAxiosError } from 'axios'
import {
  isDev,
  SECRET_API_KEY,
  API_SERVER_URL,
  LOCAL_SERVER_URL,
} from '@/config'
import { logger } from '@/utils/logger'

// Типы моделей видео
export type VideoModelId =
  | 'kling-v1.6-pro'
  | 'ray-v2'
  | 'hunyuan-video-fast'
  | 'wan-image-to-video'
  | 'wan-text-to-video'
  | 'minimax'
  | 'veo-3'
  | 'veo-3-fast'
  | 'veo-2'
  // Kie.ai модели
  | 'kie-veo-3-fast'
  | 'kie-veo-3'
  | 'kie-runway-aleph'

interface TextToVideoRequest {
  prompt: string
  videoModel: VideoModelId
  duration?: number // Длительность в секундах (только для Veo моделей)
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
}

interface TextToVideoResponse {
  success?: boolean
  videoUrl?: string
  jobId?: string
  message?: string
  error?: string
}

/**
 * Генерация видео из текстового промпта через API сервера
 * Поддерживает все модели согласно документации
 */
export async function generateTextToVideo(
  params: TextToVideoRequest
): Promise<TextToVideoResponse> {
  const {
    prompt,
    videoModel,
    duration,
    telegram_id,
    username,
    is_ru,
    bot_name,
  } = params

  // Валидация параметров
  if (!prompt) {
    throw new Error('Prompt is required')
  }
  if (!videoModel) {
    throw new Error('Video model is required')
  }
  if (!telegram_id) {
    throw new Error('Telegram ID is required')
  }
  if (!username) {
    throw new Error('Username is required')
  }
  if (!bot_name) {
    throw new Error('Bot name is required')
  }

  // Логирование начала генерации
  logger.info('Starting text-to-video generation', {
    prompt: prompt.substring(0, 100), // Логируем только начало промпта
    videoModel,
    duration,
    telegram_id,
    username,
    is_ru,
    bot_name,
  })

  try {
    // Определяем URL в зависимости от окружения
    // Используем LOCAL_SERVER_URL если определен, иначе localhost:4000 для dev, или API_SERVER_URL для prod
    const baseUrl = isDev
      ? LOCAL_SERVER_URL || 'http://localhost:4000'
      : API_SERVER_URL

    const url = `${baseUrl}/generate/text-to-video`

    logger.info('Sending request to API server', { url })

    // Формируем тело запроса
    const requestBody: any = {
      prompt,
      videoModel,
      telegram_id,
      username,
      is_ru,
      bot_name,
    }

    // Добавляем duration только для Veo моделей
    if (['veo-3', 'veo-3-fast', 'veo-2'].includes(videoModel) && duration) {
      requestBody.duration = duration
    }

    // Отправляем запрос на сервер
    const response = await axios.post<TextToVideoResponse>(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_API_KEY,
      },
      timeout: 300000, // 5 минут таймаут для длительной генерации
    })

    // Логирование успешного ответа
    logger.info('Text-to-video generation response received', {
      data: response.data,
      success: response.data.success,
      hasVideoUrl: !!response.data.videoUrl,
      jobId: response.data.jobId,
      message: response.data.message,
    })

    // Если сервер вернул только message, считаем это успешным началом
    if (response.data.message && !response.data.success) {
      return {
        ...response.data,
        success: true, // Помечаем как успешное начало
      }
    }

    return response.data
  } catch (error) {
    // Обработка ошибок Axios
    if (isAxiosError(error)) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message

      logger.error('API Error during text-to-video generation', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        error: errorMessage,
        url: error.config?.url,
        code: error.code,
        responseData: error.response?.data,
      })

      // Специальная обработка известных ошибок
      if (error.response?.status === 429) {
        return {
          success: false,
          error: is_ru
            ? 'Превышен лимит запросов. Пожалуйста, попробуйте позже.'
            : 'Rate limit exceeded. Please try again later.',
        }
      }

      if (error.response?.status === 402) {
        return {
          success: false,
          error: is_ru
            ? 'Недостаточно средств для генерации видео.'
            : 'Insufficient funds for video generation.',
        }
      }

      if (error.response?.data?.error?.includes('NSFW')) {
        return {
          success: false,
          error: is_ru
            ? 'Извините, генерация видео не удалась из-за обнаружения неподходящего контента.'
            : 'Sorry, video generation failed due to inappropriate content detection.',
        }
      }

      // Общая ошибка API
      return {
        success: false,
        error: is_ru
          ? `Ошибка API: ${errorMessage}`
          : `API Error: ${errorMessage}`,
      }
    }

    // Неизвестная ошибка
    logger.error('Unexpected error during text-to-video generation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      error: is_ru
        ? 'Произошла неожиданная ошибка при генерации видео.'
        : 'An unexpected error occurred during video generation.',
    }
  }
}

/**
 * Проверка статуса генерации видео по jobId
 * Используется для длительных операций генерации
 */
export async function checkVideoGenerationStatus(
  jobId: string,
  is_ru: boolean
): Promise<TextToVideoResponse> {
  try {
    const baseUrl = isDev
      ? LOCAL_SERVER_URL || 'http://localhost:4000'
      : API_SERVER_URL

    const url = `${baseUrl}/generate/text-to-video/status/${jobId}`

    const response = await axios.get<TextToVideoResponse>(url, {
      headers: {
        'x-secret-key': SECRET_API_KEY,
      },
    })

    logger.info('Video generation status check', {
      jobId,
      success: response.data.success,
      hasVideoUrl: !!response.data.videoUrl,
    })

    return response.data
  } catch (error) {
    if (isAxiosError(error)) {
      logger.error('Error checking video generation status', {
        jobId,
        error: error.response?.data || error.message,
      })
    }

    return {
      success: false,
      error: is_ru
        ? 'Не удалось проверить статус генерации видео.'
        : 'Failed to check video generation status.',
    }
  }
}
