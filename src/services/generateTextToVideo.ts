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
  | 'veo3_fast'
  | 'veo3'
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
  status?: 'pending' | 'processing' | 'completed' | 'failed'
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
    logger.info('🔍 [generateTextToVideo] URL Selection Debug', {
      API_URL,
      isDev,
      prompt: prompt.substring(0, 50),
      videoModel,
      duration,
      aspectRatio,
    })

    const baseUrl = API_URL

    // 🔧 КРИТИЧНО: Проверка конфигурации сервера
    if (!baseUrl || baseUrl === 'undefined') {
      logger.error(
        '❌ [generateTextToVideo] CRITICAL: No valid server URL found! Check .env configuration!',
        {
          API_URL,
          isDev,
          envCheck: {
            API_SERVER_URL: process.env.API_SERVER_URL,
            LOCAL_SERVER_URL: process.env.LOCAL_SERVER_URL,
            USE_PRODUCTION_API: process.env.USE_PRODUCTION_API,
          }
        }
      )
      return {
        success: false,
        error: 'Server URL not configured. Please check .env file.',
      }
    }

    // Определяем endpoint в зависимости от модели
    const endpoint = ['veo3', 'veo3_fast'].includes(videoModel) 
      ? '/generate/veo3-video' 
      : '/generate/text-to-video'
    
    const url = `${baseUrl}${endpoint}`

    logger.info('Sending request to API server', { url, baseUrl, endpoint, videoModel })

    // Формируем тело запроса
    const requestBody: any = {
      prompt,
      telegram_id,
      username,
      is_ru,
      bot_name,
    }

    // Для VEO3 моделей добавляем model вместо videoModel
    if (['veo3', 'veo3_fast'].includes(videoModel)) {
      requestBody.model = videoModel
    } else {
      requestBody.videoModel = videoModel
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
        'veo3',
        'veo3_fast',
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
    logger.info('🚀 [generateTextToVideo] Sending HTTP POST request to server...', {
      url,
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_API_KEY ? '***HIDDEN***' : 'NOT SET',
      },
      bodySize: JSON.stringify(requestBody).length,
    })
    
    const response = await axios.post<TextToVideoResponse>(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_API_KEY,
      },
      timeout: 300000, // 5 минут таймаут для длительной генерации
    })

    // Логирование успешного ответа
    logger.info('✅ [generateTextToVideo] Response received from server', {
      status: response.status,
      statusText: response.statusText,
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
  is_ru: boolean,
  modelId?: VideoModelId
): Promise<TextToVideoResponse> {
  try {
    const baseUrl = API_URL

    // Определяем правильный endpoint для проверки статуса в зависимости от модели
    const isVeoModel = modelId && ['veo3', 'veo3_fast'].includes(modelId)
    const statusEndpoint = isVeoModel 
      ? `/generate/veo3-video/status/${jobId}`
      : `/generate/text-to-video/status/${jobId}`
    
    const url = `${baseUrl}${statusEndpoint}`

    logger.info('🔍 [checkVideoGenerationStatus] Checking status', {
      jobId,
      modelId,
      isVeoModel,
      url,
    })

    const response = await axios.get<TextToVideoResponse>(url, {
      headers: {
        'x-secret-key': SECRET_API_KEY,
      },
    })

    logger.info('✅ [checkVideoGenerationStatus] Status response', {
      jobId,
      success: response.data.success,
      hasVideoUrl: !!response.data.videoUrl,
      videoUrl: response.data.videoUrl,
      status: response.data.status,
      message: response.data.message,
      error: response.data.error,
    })

    return response.data
  } catch (error) {
    if (isAxiosError(error)) {
      logger.error('❌ [checkVideoGenerationStatus] Error checking status', {
        jobId,
        modelId,
        errorCode: error.response?.status,
        errorData: error.response?.data,
        errorMessage: error.message,
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
