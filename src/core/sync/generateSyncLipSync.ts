import axios from 'axios'
import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import { logger } from '@/utils/logger'

if (!process.env.SYNC_API_KEY) {
  logger.warn('SYNC_API_KEY is not set. Sync LipSync-2 will not be available.')
}

export interface SyncLipSyncResponse {
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

export interface SyncLipSyncError {
  message: string
  error?: string
}

export type SyncLipSyncResult = SyncLipSyncResponse | SyncLipSyncError

/**
 * Генерирует видео с липсинком используя Sync LipSync-2 модель
 * @param telegramId - ID пользователя Telegram
 * @param videoUrl - URL видео для обработки
 * @param audioUrl - URL аудио для синхронизации
 * @param options - Дополнительные параметры
 */
export async function generateSyncLipSync(
  telegramId: string,
  videoUrl: string,
  audioUrl: string,
  options: {
    occlusion_detection_enabled?: boolean
    face_padding_top?: number
    face_padding_bottom?: number
    face_padding_left?: number
    face_padding_right?: number
  } = {}
): Promise<SyncLipSyncResult> {
  try {
    if (!process.env.SYNC_API_KEY) {
      throw new Error('SYNC_API_KEY is not configured')
    }

    logger.info('🎬 Начинаем Sync LipSync-2 генерацию', {
      telegramId,
      videoUrl: videoUrl.substring(0, 100) + '...',
      audioUrl: audioUrl.substring(0, 100) + '...',
      provider: 'sync',
      model: 'lipsync-2',
    })

    // Подготавливаем данные для Sync API
    const syncApiData = {
      model: 'lipsync-2',
      input: {
        face: videoUrl,
        audio: audioUrl,
        ...options,
      },
    }

    logger.debug('📡 Отправляем запрос к Sync API', {
      telegramId,
      apiData: {
        model: syncApiData.model,
        inputKeys: Object.keys(syncApiData.input),
      },
    })

    // Отправляем запрос к Sync API
    const response = await axios.post(
      'https://api.sync.so/predictions',
      syncApiData,
      {
        headers: {
          Authorization: `Bearer ${process.env.SYNC_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 секунд
      }
    )

    const prediction = response.data

    logger.info('✅ Получен ответ от Sync API', {
      telegramId,
      predictionId: prediction.id,
      status: prediction.status,
      provider: 'sync',
    })

    // Если у нас сразу есть результат (синхронный режим)
    if (
      prediction &&
      prediction.output &&
      typeof prediction.output === 'string'
    ) {
      const resultUrl = prediction.output

      logger.info('✅ Получен готовый результат от Sync LipSync-2', {
        resultUrl: resultUrl.substring(0, 100) + '...',
      })

      // Генерируем уникальный ID для сохранения
      const uniqueId = `sync_lipsync2_${Date.now()}_${telegramId}`

      await saveVideoUrlToSupabase({
        telegramId,
        publicUrl: resultUrl,
        type: 'sync_lipsync2',
      })

      return {
        id: uniqueId,
        status: 'succeeded',
        output: resultUrl,
      } as SyncLipSyncResponse
    }

    // Асинхронный режим - возвращаем информацию о задаче
    return {
      id: prediction.id,
      status: prediction.status || 'starting',
      urls: prediction.urls,
    } as SyncLipSyncResponse
  } catch (error: any) {
    logger.error('❌ Ошибка при генерации Sync LipSync-2', {
      telegramId,
      error: error.message,
      stack: error.stack,
      provider: 'sync',
    })

    return {
      message: 'Ошибка при генерации Sync LipSync-2',
      error: error.message || 'Unknown error',
    } as SyncLipSyncError
  }
}

/**
 * Получить статус выполнения задачи Sync LipSync-2
 * @param predictionId - ID предсказания
 */
export async function getSyncLipSyncStatus(
  predictionId: string
): Promise<SyncLipSyncResult> {
  try {
    if (!process.env.SYNC_API_KEY) {
      throw new Error('SYNC_API_KEY is not configured')
    }

    logger.info('🔍 Проверяем статус Sync LipSync-2', {
      predictionId,
      provider: 'sync',
    })

    const response = await axios.get(
      `https://api.sync.so/predictions/${predictionId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SYNC_API_KEY}`,
        },
        timeout: 30000,
      }
    )

    const prediction = response.data

    logger.info('✅ Получен статус Sync LipSync-2', {
      predictionId,
      status: prediction.status,
      hasOutput: !!prediction.output,
      provider: 'sync',
    })

    return {
      id: prediction.id,
      status: prediction.status,
      output: prediction.output,
      error: prediction.error,
    } as SyncLipSyncResponse
  } catch (error: any) {
    logger.error('❌ Ошибка при получении статуса Sync LipSync-2', {
      predictionId,
      error: error.message,
      provider: 'sync',
    })

    return {
      message: 'Ошибка при получении статуса Sync LipSync-2',
      error: error.message || 'Unknown error',
    } as SyncLipSyncError
  }
}
