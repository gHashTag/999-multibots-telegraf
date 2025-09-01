import axios, { isAxiosError } from 'axios'
import {
  isDev,
  SECRET_API_KEY,
  API_URL,
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
  // Kie.ai модели
  | 'veo-3-fast'
  | 'veo-3'
  | 'runway-aleph'

interface TextToVideoRequest {
  prompt: string
  videoModel: VideoModelId
  duration?: number // Длительность в секундах (только для Veo моделей)
  aspectRatio?: string // Соотношение сторон (например, "9:16" или "16:9")
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
    aspectRatio,
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
  logger.info('ASPECT RATIO CHECK - Starting text-to-video generation', {
    prompt: prompt.substring(0, 100), // Логируем только начало промпта
    videoModel,
    duration,
    aspectRatio: aspectRatio,
    telegram_id,
    username,
    is_ru,
    bot_name,
  })

  try {
    // Используем API_URL который учитывает USE_PRODUCTION_API флаг
    logger.info('URL Selection Debug', {
      API_URL,
      isDev,
    })

    const baseUrl = API_URL

    // 🔧 ВРЕМЕННАЯ ЗАГЛУШКА: Если сервер недоступен, возвращаем mock результат
    // TODO: Убрать после восстановления работы AI сервера
    if (!baseUrl || baseUrl === 'undefined') {
      logger.warn(
        'No valid server URL found, using mock response for development'
      )
      return {
        success: true,
        message: 'Mock: Video generation started',
        videoUrl:
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', // Валидное тестовое видео
      }
    }

    const url = `${baseUrl}/generate/text-to-video`

    logger.info('Sending request to API server', { url, baseUrl })

    // Формируем тело запроса
    const requestBody: any = {
      prompt,
      videoModel,
      telegram_id,
      username,
      is_ru,
      bot_name,
    }

    // Добавляем aspectRatio если указан
    if (aspectRatio) {
      requestBody.aspectRatio = aspectRatio
      logger.info('ASPECT RATIO CHECK - Added aspectRatio to request body', {
        aspectRatio,
        videoModel,
        telegram_id,
      })
    } else {
      logger.warn('ASPECT RATIO CHECK - No aspectRatio provided', {
        videoModel,
        telegram_id,
      })
    }

    // Добавляем duration для Veo и Kie.ai моделей
    if (
      [
        'veo-3',
        'veo-3-fast',
        'veo-2',
        'veo-3-fast',
        'veo-3',
        'runway-aleph',
      ].includes(videoModel) &&
      duration
    ) {
      requestBody.duration = duration
    }

    // Логируем финальное тело запроса
    logger.info(
      'ASPECT RATIO CHECK - Final request body being sent to server',
      {
        url,
        requestBody: JSON.stringify(requestBody, null, 2),
        videoModel,
        telegram_id,
      }
    )

    // Отправляем запрос на сервер
    const response = await axios.post<TextToVideoResponse>(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_API_KEY,
      },
      timeout: 300000, // 5 минут таймаут для длительной генерации
    })

    // Детальное логирование успешного ответа
    logger.info('[generateTextToVideo] Full server response:', {
      fullData: JSON.stringify(response.data, null, 2),
      dataKeys: Object.keys(response.data),
      success: response.data.success,
      hasVideoUrl: !!response.data.videoUrl,
      videoUrl: response.data.videoUrl || 'NO_URL',
      jobId: response.data.jobId || 'NO_JOB_ID',
      message: response.data.message || 'NO_MESSAGE',
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

      // 🔧 ВРЕМЕННАЯ ЗАГЛУШКА: Если сервер недоступен (ENOTFOUND, ECONNREFUSED), возвращаем mock
      // TODO: Убрать после восстановления работы AI сервера
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        logger.warn('Server unavailable, falling back to mock response', {
          code: error.code,
          message: error.message,
        })
        return {
          success: true,
          message: 'Mock: Video generation completed (server unavailable)',
          videoUrl:
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', // Валидное тестовое видео
        }
      }

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
    const baseUrl = API_URL

    const url = `${baseUrl}/generate/text-to-video/status/${jobId}`

    const response = await axios.get<TextToVideoResponse>(url, {
      headers: {
        'x-secret-key': SECRET_API_KEY,
      },
    })

    // Детальное логирование ответа сервера
    logger.info('[checkVideoGenerationStatus] Full server response:', {
      url,
      jobId,
      responseData: JSON.stringify(response.data, null, 2),
      success: response.data.success,
      hasVideoUrl: !!response.data.videoUrl,
      videoUrl: response.data.videoUrl || 'NO_URL',
      videoUrlType: typeof response.data.videoUrl,
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
