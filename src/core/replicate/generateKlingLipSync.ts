import Replicate from 'replicate'
import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import { logger } from '@/utils/logger'

if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error('REPLICATE_API_TOKEN is not set')
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export interface KlingLipSyncResponse {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string
  error?: string
  webhook_completed?: string
  urls?: {
    get: string
    cancel: string
  }
}

export interface KlingLipSyncError {
  message: string
  error?: string
}

export type KlingLipSyncResult = KlingLipSyncResponse | KlingLipSyncError

/**
 * Генерирует видео с липсинком используя Kling модель от Replicate
 * @param telegramId - ID пользователя Telegram
 * @param videoUrl - URL видео для обработки
 * @param audioUrl - URL аудио для синхронизации (опционально)
 * @param isRu - Язык интерфейса (для логирования)
 * @param text - Текст для генерации речи (если нет аудио)
 * @returns Promise с результатом генерации
 */
export async function generateKlingLipSync(
  telegramId: string,
  videoUrl: string,
  audioUrl?: string,
  isRu: boolean = true,
  text?: string
): Promise<KlingLipSyncResult> {
  try {
    logger.info('🎬 Начинаем генерацию Kling LipSync', {
      telegramId,
      videoUrl: videoUrl.substring(0, 100) + '...',
      audioUrl: audioUrl ? audioUrl.substring(0, 100) + '...' : 'not provided',
      text: text ? text.substring(0, 50) + '...' : 'not provided',
      model: 'kwaivgi/kling-lip-sync',
    })

    // Определяем webhook URL в зависимости от окружения
    const webhookUrl = process.env.NODE_ENV === 'production'
      ? `${process.env.API_SERVER_URL || 'https://ai-server-u14194.vm.elestio.app'}/api/webhooks/replicate`
      : process.env.NGROK_URL 
        ? `${process.env.NGROK_URL}/api/webhooks/replicate`
        : undefined // В development без ngrok не используем webhook

    if (webhookUrl) {
      logger.info('🔔 [Kling LipSync] Using webhook URL', {
        webhookUrl,
        environment: process.env.NODE_ENV,
      })
    }

    // Подготавливаем входные параметры
    const input: any = {
      video_url: videoUrl,
    }

    // Если есть аудио, используем его
    if (audioUrl) {
      input.audio_file = audioUrl
    } 
    // Если есть текст, используем его
    else if (text) {
      input.text = text
      // Можно добавить voice_id для выбора голоса
      input.voice_id = isRu ? 'ru_AOT' : 'en_AOT'
    } 
    // Если нет ни аудио, ни текста
    else {
      logger.error('❌ Не указан ни аудио файл, ни текст', {
        telegramId,
        videoUrl,
      })
      return {
        message: 'Необходимо указать аудио файл или текст для генерации',
        error: 'MISSING_AUDIO_OR_TEXT',
      } as KlingLipSyncError
    }

    logger.info('🚀 Отправляем запрос к Replicate', {
      input,
      webhookUrl,
    })

    // Запускаем Replicate модель
    const prediction = await replicate.run('kwaivgi/kling-lip-sync', {
      input,
      webhook: webhookUrl || undefined,
      webhook_events_filter: webhookUrl ? ['completed'] as any : undefined,
    })

    logger.info('📡 Replicate prediction создан', {
      predictionId: (prediction as any)?.id || 'unknown',
      status: (prediction as any)?.status || 'unknown',
    })

    // Если у нас есть ID предсказания, сохраняем его в базу
    if ((prediction as any)?.id) {
      const predictionId = (prediction as any).id

      await saveVideoUrlToSupabase(
        telegramId,
        predictionId,
        '',
        'kling_lipsync'
      )

      logger.info('💾 Prediction ID сохранен в Supabase', {
        telegramId,
        predictionId,
        type: 'kling_lipsync',
      })

      return {
        id: predictionId,
        status: (prediction as any).status || 'starting',
        output: Array.isArray(prediction) ? prediction[0] : prediction,
        urls: (prediction as any).urls,
      } as KlingLipSyncResponse
    }

    // Если у нас сразу есть результат (синхронный режим)
    if (prediction && typeof prediction === 'string') {
      const resultUrl = prediction as string

      logger.info('✅ Получен готовый результат от Kling LipSync', {
        resultUrl: resultUrl.substring(0, 100) + '...',
      })

      // Генерируем уникальный ID для сохранения
      const uniqueId = `kling_lipsync_${Date.now()}_${telegramId}`

      await saveVideoUrlToSupabase(
        telegramId,
        uniqueId,
        resultUrl,
        'kling_lipsync'
      )

      return {
        id: uniqueId,
        status: 'succeeded',
        output: resultUrl,
      } as KlingLipSyncResponse
    }

    // Если результат в виде массива
    if (Array.isArray(prediction) && prediction.length > 0) {
      const resultUrl = prediction[0]

      logger.info('✅ Получен готовый результат от Kling LipSync (массив)', {
        resultUrl: resultUrl.substring(0, 100) + '...',
      })

      const uniqueId = `kling_lipsync_${Date.now()}_${telegramId}`

      await saveVideoUrlToSupabase(
        telegramId,
        uniqueId,
        resultUrl,
        'kling_lipsync'
      )

      return {
        id: uniqueId,
        status: 'succeeded',
        output: resultUrl,
      } as KlingLipSyncResponse
    }

    logger.error('❌ Неожиданный формат ответа от Replicate', {
      prediction,
      type: typeof prediction,
    })

    return {
      message: 'Неожиданный формат ответа от сервиса генерации',
      error: 'UNEXPECTED_RESPONSE_FORMAT',
    } as KlingLipSyncError
  } catch (error) {
    logger.error('❌ Ошибка при генерации Kling LipSync', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      stack: error instanceof Error ? error.stack : undefined,
    })

    if (error instanceof Error) {
      return {
        message: 'Ошибка при генерации видео с липсинком',
        error: error.message,
      } as KlingLipSyncError
    }

    return {
      message: 'Неизвестная ошибка при генерации видео',
      error: String(error),
    } as KlingLipSyncError
  }
}

/**
 * Проверяет статус генерации по ID
 * @param predictionId - ID предсказания Replicate
 * @returns Promise с текущим статусом
 */
export async function getKlingLipSyncStatus(
  predictionId: string
): Promise<KlingLipSyncResult> {
  try {
    const prediction = await replicate.predictions.get(predictionId)

    return {
      id: prediction.id,
      status: prediction.status,
      output: prediction.output,
      error: prediction.error,
      urls: prediction.urls,
    } as KlingLipSyncResponse
  } catch (error) {
    logger.error('❌ Ошибка при получении статуса Kling LipSync', {
      error: error instanceof Error ? error.message : String(error),
      predictionId,
    })

    return {
      message: 'Ошибка при проверке статуса генерации',
      error: error instanceof Error ? error.message : String(error),
    } as KlingLipSyncError
  }
}
