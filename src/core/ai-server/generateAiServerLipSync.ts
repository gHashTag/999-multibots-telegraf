import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import { logger } from '@/utils/logger'
import {
  generateLipSyncViaAiServer,
  getLipSyncStatusFromAiServer,
  AiServerLipSyncRequest,
} from '../ai-server/lipsync-adapter'

export interface AiServerLipSyncResponse {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string
  error?: string
  urls?: {
    get: string
    cancel: string
  }
}

export interface AiServerLipSyncError {
  message: string
  error?: string
}

export type AiServerLipSyncResult =
  | AiServerLipSyncResponse
  | AiServerLipSyncError

/**
 * Генерирует видео с липсинком используя ai-server как прокси
 */
export async function generateAiServerLipSync(
  telegramId: string,
  videoUrl: string,
  audioUrl: string,
  isRu: boolean = true
): Promise<AiServerLipSyncResult> {
  try {
    logger.info('🎬 Начинаем генерацию AiServer LipSync', {
      telegramId,
      videoUrl: videoUrl.substring(0, 100) + '...',
      audioUrl: audioUrl.substring(0, 100) + '...',
      provider: 'ai-server',
    })

    const request: AiServerLipSyncRequest = {
      video_url: videoUrl,
      audio_url: audioUrl,
      user_id: telegramId,
      model: 'kwaivgi/kling-lip-sync',
    }

    const result = await generateLipSyncViaAiServer(request)

    // Сохраняем задачу в базу
    await saveVideoUrlToSupabase(
      telegramId,
      result.id,
      result.result_url || '',
      'ai_server_lipsync'
    )

    logger.info('✅ AiServer LipSync задача создана', {
      taskId: result.id,
      status: result.status,
      telegramId,
    })

    return {
      id: result.id,
      status:
        result.status === 'completed'
          ? 'succeeded'
          : result.status === 'failed'
          ? 'failed'
          : 'starting',
      output: result.result_url,
      error: result.error,
      urls: {
        get: `${
          process.env.ELESTIO_URL ||
          'https://ai-server-production-production-8e2d.up.railway.app'
        }/api/lipsync/${result.id}`,
        cancel: `${
          process.env.ELESTIO_URL ||
          'https://ai-server-production-production-8e2d.up.railway.app'
        }/api/lipsync/${result.id}/cancel`,
      },
    } as AiServerLipSyncResponse
  } catch (error) {
    logger.error('❌ Ошибка при генерации AiServer LipSync', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      stack: error instanceof Error ? error.stack : undefined,
    })

    if (error instanceof Error) {
      return {
        message: 'Ошибка при генерации видео с липсинком через ai-server',
        error: error.message,
      } as AiServerLipSyncError
    }

    return {
      message: 'Неизвестная ошибка при генерации видео через ai-server',
      error: String(error),
    } as AiServerLipSyncError
  }
}

/**
 * Проверяет статус генерации по ID
 */
export async function getAiServerLipSyncStatus(
  taskId: string
): Promise<AiServerLipSyncResult> {
  try {
    const result = await getLipSyncStatusFromAiServer(taskId)

    return {
      id: result.id,
      status:
        result.status === 'completed'
          ? 'succeeded'
          : result.status === 'failed'
          ? 'failed'
          : 'processing',
      output: result.result_url,
      error: result.error,
      urls: {
        get: `${
          process.env.ELESTIO_URL ||
          'https://ai-server-production-production-8e2d.up.railway.app'
        }/api/lipsync/${result.id}`,
        cancel: `${
          process.env.ELESTIO_URL ||
          'https://ai-server-production-production-8e2d.up.railway.app'
        }/api/lipsync/${result.id}/cancel`,
      },
    } as AiServerLipSyncResponse
  } catch (error) {
    logger.error('❌ Ошибка при получении статуса AiServer LipSync', {
      error: error instanceof Error ? error.message : String(error),
      taskId,
    })

    return {
      message: 'Ошибка при проверке статуса генерации через ai-server',
      error: error instanceof Error ? error.message : String(error),
    } as AiServerLipSyncError
  }
}
