import { logger } from '@/utils/logger'
import {
  generateKlingLipSync,
  type KlingLipSyncResult,
  type KlingLipSyncResponse,
  type KlingLipSyncError,
} from '@/core/replicate/generateKlingLipSync'

// НОВОЕ: Импорт ai-server провайдера
import {
  generateAiServerLipSync,
  type AiServerLipSyncResult,
} from '@/core/ai-server/generateAiServerLipSync'

// Интерфейс для обратной совместимости
export interface LipSyncResponse {
  message: string
  resultUrl?: string
  id?: string
  status?: string
}

/**
 * Генерирует видео с липсинком с автоматическим выбором провайдера
 * Приоритет: ai-server > replicate (fallback)
 */
export async function generateLipSync(
  videoUrl: string,
  audioUrl: string,
  telegramId: string,
  botName: string
): Promise<LipSyncResponse> {
  try {
    logger.info('🎬 Начинаем генерацию липсинка', {
      telegramId,
      botName,
      videoUrl: videoUrl.substring(0, 100) + '...',
      audioUrl: audioUrl.substring(0, 100) + '...',
      strategy: 'ai-server-first'
    })

    // НОВОЕ: Пробуем ai-server сначала
    try {
      logger.info('🚀 Пытаемся использовать ai-server...')
      
      const aiServerResult: AiServerLipSyncResult = await generateAiServerLipSync(
        telegramId,
        videoUrl,
        audioUrl,
        true
      )

      // Проверяем если результат - это ошибка
      if ('message' in aiServerResult && 'error' in aiServerResult) {
        logger.warn('⚠️ ai-server вернул ошибку, переключаемся на Replicate', {
          error: aiServerResult.message
        })
        throw new Error(aiServerResult.message)
      }

      // Результат успешный от ai-server
      const success = aiServerResult as any
      
      logger.info('✅ ai-server LipSync запущен успешно', {
        id: success.id,
        status: success.status,
        telegramId,
        hasOutput: !!success.output,
      })

      return {
        message: success.status === 'succeeded'
          ? 'Видео с липсинком готово (ai-server)'
          : 'Видео отправлено на обработку через ai-server. Ждите результата',
        resultUrl: success.output,
        id: success.id,
        status: success.status,
      }
      
    } catch (aiServerError) {
      logger.warn('⚠️ ai-server недоступен, используем Replicate fallback', {
        error: aiServerError instanceof Error ? aiServerError.message : String(aiServerError)
      })
      
      // Fallback на оригинальную Kling модель через Replicate
      const result: KlingLipSyncResult = await generateKlingLipSync(
        telegramId,
        videoUrl,
        audioUrl,
        true
      )

      // Проверяем если результат - это ошибка
      if ('message' in result && 'error' in result) {
        const error = result as KlingLipSyncError
        logger.error('❌ Ошибка от Replicate LipSync сервиса', {
          error: error.message,
          details: error.error,
          telegramId,
        })

        throw new Error(error.message || 'Ошибка при генерации липсинка')
      }

      // Результат успешный от Replicate
      const success = result as KlingLipSyncResponse

      logger.info('✅ Replicate LipSync запущен успешно (fallback)', {
        id: success.id,
        status: success.status,
        telegramId,
        hasOutput: !!success.output,
      })

      return {
        message: success.status === 'succeeded'
          ? 'Видео с липсинком готово (Replicate)'
          : 'Видео отправлено на обработку через Replicate. Ждите результата',
        resultUrl: success.output,
        id: success.id,
        status: success.status,
      }
    }

  } catch (error) {
    logger.error('❌ Критическая ошибка при генерации липсинка', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      botName,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Пробрасываем ошибку дальше для обработки в UI
    throw error
  }
}