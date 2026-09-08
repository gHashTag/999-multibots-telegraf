import axios, { isAxiosError } from 'axios'
import { isDev, SECRET_API_KEY, PUBLIC_URL } from '@/config'
import { logger } from '@/utils/logger'
import { getUnifiedModelConfig } from '@/config/unified-video-models.config'

// Типы моделей видео
export type VideoModelId =
  | 'kling-v1.6-pro'
  | 'ray-v2'
  // ❌ УДАЛЕНЫ устаревшие модели (404 ошибки):
  // | 'hunyuan-video-fast' - не работает
  // | 'wan-image-to-video' - не работает
  // | 'wan-text-to-video' - не работает
  // | 'minimax' - не работает
  // Kie.ai модели
  | 'veo3_fast'
  | 'veo3'
  | 'runway-aleph'
  | 'sora-2'
  | 'sora-2-pro'
  // Sora 2 Image-to-Video
  | 'sora-2-i2v'
  | 'sora-2-pro-i2v'
  // WAN 2.5 модели
  | 'wan-2.5-t2v'
  | 'wan-2.5-i2v'

interface TextToVideoRequest {
  prompt: string
  videoModel: VideoModelId
  duration?: number // Длительность в секундах (только для Veo моделей)
  aspectRatio?: string // Соотношение сторон (например, "9:16" или "16:9")
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
  removeWatermark?: boolean // 🆕 Для Sora: удалять watermark или нет (default: true для Sora)
}

interface TextToVideoResponse {
  success: boolean
  videoUrl?: string
  jobId?: string
  message?: string
  error?: string
  /**
   * The failure was "not enough stars", not a provider error. Callers that
   * show `error` to a person can then offer a way to pay; on any other failure
   * a top-up button would send somebody to pay for a problem money cannot fix.
   */
  insufficientFunds?: boolean
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

    const errorMessage =
      `🚨 **SERVER DOWN ALERT**\n\n` +
      `📍 План Б активирован для Veo генерации\n` +
      `👤 User: ${telegram_id}\n` +
      `🎬 Model: ${videoModel}\n` +
      `❌ Error: ${error}\n` +
      `🔄 Используется прямой API Veo 3\n\n` +
      `⚠️ Проверьте доступность сервера генерации`

    for (const adminId of adminIds) {
      await botResult.bot.telegram.sendMessage(adminId, errorMessage, {
        parse_mode: 'Markdown',
      })
    }

    logger.warn('[ADMIN NOTIFICATION] Server issue reported to admins', {
      adminIds,
      error,
    })
  } catch (notifyError) {
    logger.error('[ADMIN NOTIFICATION] Failed to notify admins', notifyError)
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
    removeWatermark = true, // 🆕 Default true для обратной совместимости (без watermark лучше)
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

  // 🔥 КРИТИЧНОЕ ЛОГИРОВАНИЕ: Показываем ВСЕ параметры запроса
  console.log('━'.repeat(80))
  console.log('🎬 [TEXT-TO-VIDEO] ЗАПРОС НА ГЕНЕРАЦИЮ ВИДЕО:')
  console.log('━'.repeat(80))
  console.log(`📝 Модель: ${videoModel}`)
  console.log(`🎞️ Длительность: ${duration || 'не указана (default 5s)'}`)
  console.log(`📱 Соотношение: ${aspectRatio || 'не указано (default 9:16)'}`)
  console.log(`👤 User ID: ${telegram_id}`)
  console.log(`🤖 Bot: ${bot_name}`)
  console.log(`💭 Промпт (${prompt.length} символов):`)
  console.log(
    `   ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`
  )
  console.log('━'.repeat(80))

  logger.info('[TEXT-TO-VIDEO] Starting generation with full params', {
    prompt: prompt, // Логируем полный промпт
    promptLength: prompt.length,
    videoModel,
    duration,
    aspectRatio,
    telegram_id,
    username,
    is_ru,
    bot_name,
    removeWatermark,
  })

  try {
    // ✅ ЦЕНТРАЛИЗОВАННАЯ ПРОВЕРКА: Получаем конфигурацию модели из единого источника
    const modelConfig = getUnifiedModelConfig(videoModel)

    // Проверяем, является ли это Kie.ai моделью через provider
    const isKieAiModel = modelConfig?.provider === 'kie'
    const isSoraModel = videoModel.includes('sora')
    const isWanModel = videoModel.includes('wan')

    if (isKieAiModel) {
      // Для Kie.ai моделей используем прямую интеграцию
      logger.info(
        '[KIE.AI] Using Kie.ai directly (centralized provider check)',
        {
          videoModel,
          provider: modelConfig?.provider,
          isSoraModel,
          isWanModel,
          reason: isSoraModel
            ? 'Sora models use Kie.ai Sora API'
            : isWanModel
              ? 'WAN 2.5 models use Kie.ai API'
              : 'Veo/Runway models use Kie.ai API',
        }
      )

      // Импортируем KieAiProvider
      const { KieAiProvider } = await import('./video-providers/KieAiProvider')
      const kieProvider = new KieAiProvider()

      if (isSoraModel) {
        // Для Sora моделей используем специальный API
        const soraAspectRatio =
          aspectRatio === '9:16' ? 'portrait' : 'landscape'
        const soraModel =
          videoModel === 'sora-2-pro'
            ? 'sora-2-pro-text-to-video'
            : 'sora-2-text-to-video'

        logger.info('[SORA] Calling Sora generateSoraVideo with params:', {
          model: soraModel,
          promptLength: prompt.length,
          aspectRatio: soraAspectRatio,
          duration: 10, // Sora всегда 10 секунд
        })

        const soraResponse = await kieProvider.generateSoraVideo(
          prompt,
          soraModel as 'sora-2-text-to-video' | 'sora-2-pro-text-to-video',
          soraAspectRatio as 'landscape' | 'portrait',
          removeWatermark, // 🆕 Передаем значение из параметров
          10, // duration - Sora всегда 10 секунд
          'standard', // size - standard quality
          undefined, // imageUrl - для text-to-video не нужен
          telegram_id // ✅ Передаём telegram_id для callback URL
        )

        logger.info('[SORA] API response received:', {
          success: soraResponse.success,
          hasData: !!soraResponse.data,
          hasTaskId: !!soraResponse.data?.taskId,
          taskId: soraResponse.data?.taskId,
          error: soraResponse.error,
        })

        if (soraResponse.success && soraResponse.data?.taskId) {
          return {
            success: true,
            jobId: soraResponse.data.taskId,
            message: 'Sora video generation started',
          }
        }

        return {
          success: false,
          error: soraResponse.error || 'Failed to generate Sora video',
        }
      } else {
        // Для Veo и WAN моделей используем обычный generateVideo
        const kieAspectRatio = aspectRatio as
          | '16:9'
          | '9:16'
          | '1:1'
          | undefined
        const logPrefix = isWanModel ? '[WAN 2.5]' : '[VEO]'

        logger.info(`${logPrefix} Calling Kie.ai generateVideo with params:`, {
          model: videoModel,
          promptLength: prompt.length,
          duration: duration || 5,
          aspectRatio: kieAspectRatio || '9:16',
        })

        const kieResponse = await kieProvider.generateVideo({
          model: videoModel,
          prompt,
          duration: duration || 5,
          aspectRatio: kieAspectRatio || '9:16',
          telegram_id, // ✅ Передаём telegram_id для callback URL
        })

        logger.info(`${logPrefix} API response received:`, {
          success: kieResponse.success,
          hasData: !!kieResponse.data,
          hasVideoUrl: !!kieResponse.data?.videoUrl,
          hasTaskId: !!kieResponse.data?.taskId,
          taskId: kieResponse.data?.taskId,
          error: kieResponse.error,
        })

        if (kieResponse.success) {
          if (kieResponse.data?.videoUrl) {
            return {
              success: true,
              videoUrl: kieResponse.data.videoUrl,
            }
          } else if (kieResponse.data?.taskId) {
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
    }

    // Для Replicate моделей используем прямую интеграцию
    if (modelConfig?.provider === 'replicate') {
      logger.info('[REPLICATE] Using Replicate API directly', {
        videoModel,
        provider: modelConfig?.provider,
        apiModel: modelConfig?.apiModel,
      })

      // Импортируем модуль videoGenerator для Replicate моделей
      const videoGeneratorModule = await import('@/modules/videoGenerator')
      const generateTextToVideoNew =
        videoGeneratorModule.generateTextToVideo as unknown as (
          prompt: string,
          telegram_id: string,
          username: string,
          is_ru: boolean,
          bot_name: string,
          modelId: string,
          selectedResolution?: string,
          selectedDuration?: number,
          selectedAspectRatio?: string
        ) => Promise<string | null>

      const videoUrl: string | null = await generateTextToVideoNew(
        prompt,
        telegram_id,
        username,
        is_ru,
        bot_name,
        videoModel,
        undefined, // selectedResolution
        duration,
        aspectRatio
      )

      if (videoUrl) {
        const response: TextToVideoResponse = {
          success: true,
          videoUrl: videoUrl || undefined,
          message: 'Video generated successfully via Replicate',
        }
        return response
      }

      const errorResponse: TextToVideoResponse = {
        success: false,
        error: 'Failed to generate video via Replicate',
      }
      return errorResponse
    }

    // Для остальных моделей используем старый подход с сервером
    logger.info('URL Selection Debug', {
      PUBLIC_URL,
      isDev,
    })

    // ❌ DEPRECATED: Этот endpoint больше не существует!
    // Используйте handleTextToVideoDirect вместо generateTextToVideo
    logger.error(
      '[generateTextToVideo] DEPRECATED: This function uses non-existent endpoint',
      {
        message: 'Use handleTextToVideoDirect instead',
        telegram_id,
        videoModel,
      }
    )

    // Возвращаем ошибку вместо попытки вызвать несуществующий endpoint
    return {
      success: false,
      message: '❌ Эта функция устарела. Используйте handleTextToVideoDirect.',
      error: 'DEPRECATED: /generate/text-to-video endpoint does not exist',
    }
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
          insufficientFunds: true,
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

      // General API error. The raw errorMessage (the provider response body
      // or the axios exception text) already goes to logger.error above; we do
      // not show it to the user — it can carry an internal host or identifier
      // and reads as a broken bot. Return a clean line, like the other branches
      // of this catch (429/402/NSFW).
      return {
        success: false,
        error: is_ru
          ? 'Не удалось сгенерировать видео. Мы уже разбираемся, попробуйте позже.'
          : 'Video generation failed. We are looking into it, please try again later.',
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
      jobIdLength: jobId.length,
    })

    if (isKieTaskId) {
      // Используем KieAiProvider для проверки статуса
      logger.info(
        '[checkVideoGenerationStatus] Using Veo 3 provider to check status'
      )
      const { KieAiProvider } = await import('./video-providers/KieAiProvider')
      const kieProvider = new KieAiProvider()
      const result = await kieProvider.checkVideoStatus(jobId)

      logger.info('[checkVideoGenerationStatus] Veo 3 status result:', {
        success: result.success,
        hasData: !!result.data,
        hasVideoUrl: !!result.data?.videoUrl,
        error: result.error,
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
          error:
            result.error || (is_ru ? 'Ошибка генерации' : 'Generation error'),
        }
      }
    }

    // Старый код для обычных серверов
    const baseUrl = PUBLIC_URL
    const url = `${baseUrl}/generate/text-to-video/status/${jobId}`

    const response = await axios.get<TextToVideoResponse>(url, {
      headers: {
        'x-secret-key': SECRET_API_KEY,
      },
      // Bound the request so a stalled status server cannot hang this call
      // forever -- the caller polls it on a setInterval, and a hung call there
      // piles up requests that never resolve.
      timeout: 60_000,
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
      if (
        statusCode === 404 ||
        errorData?.message?.includes('not found') ||
        errorData?.message?.includes('Video job not found')
      ) {
        logger.warn(
          '[checkVideoGenerationStatus] Video job not found - may have expired or been deleted',
          {
            jobId,
            statusCode,
            errorMessage: errorData?.message || error.message,
          }
        )

        return {
          success: false,
          error: is_ru
            ? 'Задача генерации видео не найдена. Возможно, она была удалена или истек срок хранения.'
            : 'Video generation task not found. It may have been deleted or expired.',
        }
      }

      // Обработка других HTTP ошибок
      if (statusCode >= 500) {
        logger.error(
          '[checkVideoGenerationStatus] Server error while checking video status',
          {
            jobId,
            statusCode,
            error: errorData || error.message,
          }
        )

        return {
          success: false,
          error: is_ru
            ? 'Ошибка сервера при проверке статуса видео. Попробуйте позже.'
            : 'Server error while checking video status. Please try again later.',
        }
      }

      logger.error(
        '[checkVideoGenerationStatus] HTTP error while checking video status',
        {
          jobId,
          statusCode,
          error: errorData || error.message,
        }
      )
    } else {
      // Обработка не-HTTP ошибок
      logger.error(
        '[checkVideoGenerationStatus] Non-HTTP error while checking video status',
        {
          jobId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      )
    }

    return {
      success: false,
      error: is_ru
        ? 'Не удалось проверить статус генерации видео.'
        : 'Failed to check video generation status.',
    }
  }
}
