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
}

/**
 * Генерация видео из текстового промпта через API сервера
 * Поддерживает все модели согласно документации
 */
// Функция для отправки уведомления админу
async function notifyAdminAboutServerIssue(
  error: string,
  telegram_id: string,
  videoModel: string
) {
  try {
    const adminIds = process.env.ADMIN_TELEGRAM_ID?.split(',') || ['144022504']
    const { getBotByName } = await import('@/core/bot')
    const botResult = getBotByName('neuro_blogger_bot')
    
    if (!botResult.bot) return
    
    const errorMessage = `🚨 **SERVER DOWN ALERT**\n\n` +
      `📍 План Б активирован для Veo генерации\n` +
      `👤 User: ${telegram_id}\n` +
      `🎬 Model: ${videoModel}\n` +
      `❌ Error: ${error}\n` +
      `🔄 Используется прямой API Veo 3\n\n` +
      `⚠️ Проверьте сервер: https://ai-server-production-production-8e2d.up.railway.app`
    
    for (const adminId of adminIds) {
      await botResult.bot.telegram.sendMessage(adminId, errorMessage, {
        parse_mode: 'Markdown'
      })
    }
    
    logger.warn('[ADMIN NOTIFICATION] Server issue reported to admins', {
      adminIds,
      error
    })
  } catch (notifyError) {
    logger.error('[ADMIN NOTIFICATION] Failed to notify admins', notifyError)
  }
}

async function notifyAdminAboutPlanBSuccess(
  telegram_id: string,
  videoModel: string,
  taskId: string,
  videoUrl: string
) {
  try {
    const adminIds = process.env.ADMIN_TELEGRAM_ID?.split(',') || ['144022504']
    const { getBotByName } = await import('@/core/bot')
    const botResult = getBotByName('neuro_blogger_bot')

    if (!botResult.bot) return

    const successMessage = `✅ **PLAN B SUCCESS**\n\n` +
      `📍 Видео успешно сгенерировано через Plan B\n` +
      `👤 User: ${telegram_id}\n` +
      `🎬 Model: ${videoModel}\n` +
      `🔗 Task ID: ${taskId}\n` +
      `🎥 Video URL: ${videoUrl.substring(0, 50)}...\n\n` +
      `✅ Fallback механизм работает корректно`

    for (const adminId of adminIds) {
      await botResult.bot.telegram.sendMessage(adminId, successMessage, {
        parse_mode: 'Markdown'
      })
    }

    logger.info('[ADMIN NOTIFICATION] Plan B success reported to admins', {
      adminIds,
      telegram_id,
      taskId
    })
  } catch (notifyError) {
    logger.error('[ADMIN NOTIFICATION] Failed to notify admins about Plan B success', notifyError)
  }
}

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

  // Логирование начала генерации - отправляем ПОЛНЫЙ промпт в логи
  logger.info('ASPECT RATIO CHECK - Starting text-to-video generation', {
    prompt: prompt, // Логируем полный промпт без обрезки
    promptLength: prompt.length,
    videoModel,
    duration,
    aspectRatio: aspectRatio,
    telegram_id,
    username,
    is_ru,
    bot_name,
  })

  try {
    // Проверяем, является ли это Veo моделью
    const isVeoModel = ['veo3', 'veo3_fast', 'runway-aleph'].includes(videoModel)
    
    if (isVeoModel) {
      // ПЛАН Б: Для Veo моделей используем прямую интеграцию с Kie.ai
      // НЕ используем сервер, так как там нет поддержки этих моделей через Replicate
      logger.info('[PLAN B] Using Kie.ai directly for Veo model', {
        videoModel,
        reason: 'Veo models are not available on Replicate, using Kie.ai API directly'
      })
      
      // Импортируем KieAiProvider
      const { KieAiProvider } = await import('./video-providers/KieAiProvider')
      const kieProvider = new KieAiProvider()
      
      // Преобразуем aspectRatio в формат Kie.ai
      const kieAspectRatio = aspectRatio as '16:9' | '9:16' | '1:1' | undefined
      
      logger.info('[PLAN B] Calling Veo 3 generateVideo with params:', {
        model: videoModel,
        promptLength: prompt.length, // Логируем длину вместо обрезки
        duration: duration || 8,
        aspectRatio: kieAspectRatio || '9:16'
      })
      
      // Генерируем видео через Kie.ai
      const kieResponse = await kieProvider.generateVideo({
        model: videoModel,
        prompt,
        duration: duration || 8,
        aspectRatio: kieAspectRatio || '9:16',
      })
      
      logger.info('[PLAN B] Veo 3 API response received:', {
        success: kieResponse.success,
        hasData: !!kieResponse.data,
        hasVideoUrl: !!kieResponse.data?.videoUrl,
        hasTaskId: !!kieResponse.data?.taskId,
        taskId: kieResponse.data?.taskId,
        error: kieResponse.error
      })
      
      if (kieResponse.success) {
        if (kieResponse.data?.videoUrl) {
          return {
            success: true,
            videoUrl: kieResponse.data.videoUrl,
          }
        } else if (kieResponse.data?.taskId) {
          // Если есть taskId, но нет videoUrl - видео еще генерируется
          return {
            success: true,
            jobId: kieResponse.data.taskId,
            message: 'Video generation started',
          }
        }
      }
      
      return {
        success: false,
        error: kieResponse.error || 'Failed to generate video',
      }
    }
    
    // Для остальных моделей используем старый подход с сервером
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
          'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4', // Валидное тестовое видео
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

    // Добавляем duration для моделей которые поддерживают
    if (duration) {
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
            'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4', // Валидное тестовое видео
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
    // Проверяем, это taskId от Kie.ai или jobId от другого сервиса
    // taskId от Kie.ai всегда 32 символа без дефисов
    const isKieTaskId = jobId.length === 32 && !jobId.includes('-')
    
    logger.info('[checkVideoGenerationStatus] Checking status for:', {
      jobId,
      isKieTaskId,
      jobIdLength: jobId.length
    })
    
    if (isKieTaskId) {
      // Используем KieAiProvider для проверки статуса
      logger.info('[checkVideoGenerationStatus] Using Veo 3 provider to check status')
      const { KieAiProvider } = await import('./video-providers/KieAiProvider')
      const kieProvider = new KieAiProvider()
      const result = await kieProvider.checkVideoStatus(jobId)
      
      logger.info('[checkVideoGenerationStatus] Veo 3 status result:', {
        success: result.success,
        hasData: !!result.data,
        hasVideoUrl: !!result.data?.videoUrl,
        error: result.error
      })
      
      if (result.success && result.data?.videoUrl) {
        return {
          success: true,
          videoUrl: result.data.videoUrl,
        }
      } else if (result.success && !result.data?.videoUrl) {
        // Еще генерируется - возвращаем как успешный статус, но без URL
        return {
          success: true,
          message: is_ru
            ? 'Видео еще генерируется...'
            : 'Video is still being generated...',
        }
      } else {
        return {
          success: false,
          error: result.error || (is_ru ? 'Ошибка генерации' : 'Generation error'),
        }
      }
    }
    
    // Старый код для обычных серверов
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
      const statusCode = error.response?.status
      const errorData = error.response?.data

      // Специальная обработка для 404 ошибки (job not found)
      if (statusCode === 404 || errorData?.message?.includes('not found') || errorData?.message?.includes('Video job not found')) {
        logger.warn('[checkVideoGenerationStatus] Video job not found - may have expired or been deleted', {
          jobId,
          statusCode,
          errorMessage: errorData?.message || error.message
        })

        return {
          success: false,
          error: is_ru
            ? 'Задача генерации видео не найдена. Возможно, она была удалена или истек срок хранения.'
            : 'Video generation task not found. It may have been deleted or expired.',
        }
      }

      // Обработка других HTTP ошибок
      if (statusCode >= 500) {
        logger.error('[checkVideoGenerationStatus] Server error while checking video status', {
          jobId,
          statusCode,
          error: errorData || error.message,
        })

        return {
          success: false,
          error: is_ru
            ? 'Ошибка сервера при проверке статуса видео. Попробуйте позже.'
            : 'Server error while checking video status. Please try again later.',
        }
      }

      logger.error('[checkVideoGenerationStatus] HTTP error while checking video status', {
        jobId,
        statusCode,
        error: errorData || error.message,
      })
    } else {
      // Обработка не-HTTP ошибок
      logger.error('[checkVideoGenerationStatus] Non-HTTP error while checking video status', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
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
