import axios, { isAxiosError } from 'axios'
import { API_URL, SECRET_API_KEY } from '@/config'
import { logger } from '@/utils/logger'

// Image to Video request interface
export interface ImageToVideoRequest {
  imageUrl: string
  prompt: string
  videoModel: string
  aspectRatio?: string
  duration?: number
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
}

interface ImageToVideoResponse {
  success?: boolean
  videoUrl?: string
  jobId?: string
  message?: string
  error?: string
}

// Функция для отправки уведомления админу о проблеме с сервером
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
    
    const errorMessage = `🚨 **SERVER DOWN ALERT (I2V)**\n\n` +
      `📍 План Б активирован для Image to Video\n` +
      `👤 User: ${telegram_id}\n` +
      `🎬 Model: ${videoModel}\n` +
      `❌ Error: ${error}\n` +
      `🔄 Используется прямой внешний API\n\n` +
      `⚠️ Проверьте сервер: https://three-head-dragon.shop`
    
    for (const adminId of adminIds) {
      await botResult.bot.telegram.sendMessage(adminId, errorMessage, {
        parse_mode: 'Markdown'
      })
    }
    
    logger.warn('[I2V ADMIN NOTIFICATION] Server issue reported to admins', {
      adminIds,
      error
    })
  } catch (notifyError) {
    logger.error('[I2V ADMIN NOTIFICATION] Failed to notify admins', notifyError)
  }
}

export async function generateImageToVideo(
  params: ImageToVideoRequest
): Promise<ImageToVideoResponse> {
  const {
    imageUrl,
    prompt,
    videoModel,
    aspectRatio,
    duration,
    telegram_id,
    username,
    is_ru,
    bot_name,
  } = params

  // Валидация параметров
  if (!imageUrl) {
    throw new Error('Image URL is required')
  }
  if (!prompt) {
    throw new Error('Prompt is required')
  }
  if (!videoModel) {
    throw new Error('Video model is required')
  }
  if (!telegram_id) {
    throw new Error('Telegram ID is required')
  }

  logger.info('[I2V Service] Starting image-to-video generation', {
    videoModel,
    aspectRatio,
    duration,
    telegram_id,
    username,
    promptLength: prompt.length,
  })

  try {
    // Проверяем, является ли это Veo моделью
    const isVeoModel = ['veo3', 'veo3_fast', 'runway-aleph'].includes(videoModel)
    
    if (isVeoModel) {
      // ПЛАН А: Сначала пробуем через наш сервер
      logger.info('[I2V PLAN A] Trying server first for Veo model', {
        videoModel,
        serverUrl: API_URL
      })
      
      try {
        const baseUrl = API_URL
        
        // Проверяем доступность сервера (пропускаем localhost для тестов)
        if (baseUrl && baseUrl !== 'undefined' && !baseUrl.includes('localhost')) {
          const url = `${baseUrl}/api/v1/veo/generate/image-to-video`
          
          const requestBody = {
            model: videoModel === 'veo3_fast' ? 'veo3_fast' : 
                   videoModel === 'veo3' ? 'veo3' : 'runway_aleph',
            imageUrl,
            prompt,
            aspectRatio: aspectRatio || '9:16', // camelCase для Kie.ai
            duration: duration || 8,
            enableFallback: false,
            enableTranslation: true,
            telegram_id,
            username,
            is_ru,
            bot_name,
          }
          
          logger.info('[I2V PLAN A] Sending request to server:', {
            url,
            model: requestBody.model,
            aspectRatio: requestBody.aspectRatio,
            hasImage: !!imageUrl,
          })
          
          const response = await axios.post(url, requestBody, {
            headers: {
              'Content-Type': 'application/json',
              'x-secret-key': SECRET_API_KEY,
            },
            timeout: 10000, // 10 секунд таймаут
          })
          
          logger.info('[I2V PLAN A] Server response received', {
            status: response.status,
            success: response.data.success
          })
          
          // Если сервер ответил успешно, возвращаем результат
          if (response.data.success) {
            return response.data
          }
        }
      } catch (serverError) {
        // Сервер недоступен, переключаемся на План Б
        const errorMessage = serverError instanceof Error ? serverError.message : 'Server unavailable'
        
        if (isAxiosError(serverError)) {
          logger.error('[I2V PLAN A] Server error details:', {
            status: serverError.response?.status,
            statusText: serverError.response?.statusText,
            data: serverError.response?.data,
            url: serverError.config?.url,
            code: serverError.code,
            message: serverError.message,
          })
        }
        
        logger.warn('[I2V PLAN A] Server failed, switching to PLAN B', {
          error: errorMessage,
          videoModel
        })
        
        // Уведомляем админа о проблеме с сервером
        await notifyAdminAboutServerIssue(errorMessage, telegram_id, videoModel)
      }
      
      // ПЛАН Б: Используем прямую интеграцию с внешним API
      logger.info('[I2V PLAN B] Using direct external API', {
        videoModel,
        aspectRatio,
        duration,
        telegram_id,
      })
      
      // Импортируем KieAiProvider
      const { KieAiProvider } = await import('./video-providers/KieAiProvider')
      const kieProvider = new KieAiProvider()
      
      // Преобразуем aspectRatio в формат Kie.ai
      const kieAspectRatio = aspectRatio as '16:9' | '9:16' | '1:1' | undefined
      
      logger.info('[I2V PLAN B] Calling external API with params:', {
        model: videoModel,
        hasImage: !!imageUrl,
        aspectRatio: kieAspectRatio || '9:16',
        duration: duration || 8,
      })
      
      // Генерируем видео через Kie.ai с image-to-video
      const kieResponse = await kieProvider.generateVideo({
        model: videoModel,
        prompt,
        imageUrl, // Передаем imageUrl для image-to-video
        duration: duration || 8,
        aspectRatio: kieAspectRatio || '9:16',
        telegram_id, // ✅ Передаём telegram_id для callback URL
      })
      
      logger.info('[I2V PLAN B] External API response received:', {
        success: kieResponse.success,
        hasData: !!kieResponse.data,
        hasVideoUrl: !!kieResponse.data?.videoUrl,
        hasTaskId: !!kieResponse.data?.taskId,
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
    
    // Для остальных моделей возвращаем ошибку (они должны использовать Replicate)
    return {
      success: false,
      error: `Model ${videoModel} is not supported for Plan A/B system. Use original generateImageToVideo function.`
    }
    
  } catch (error) {
    logger.error('[I2V Service] Generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      videoModel,
      telegram_id,
    })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate video',
    }
  }
}