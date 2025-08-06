import { logger } from '@/utils/logger'
import {
  generateKlingLipSync,
  type KlingLipSyncResult,
  type KlingLipSyncResponse,
  type KlingLipSyncError,
} from '@/core/replicate/generateKlingLipSync'

// Интерфейс для обратной совместимости
export interface LipSyncResponse {
  message: string
  resultUrl?: string
  id?: string
  status?: string
}

/**
 * Генерирует видео с липсинком используя новую Kling модель через Replicate
 * @param videoUrl - URL видео для обработки
 * @param audioUrl - URL аудио для синхронизации
 * @param telegramId - ID пользователя Telegram
 * @param botName - Имя бота (для логирования)
 * @returns Promise с результатом генерации
 */
export async function generateLipSync(
  videoUrl: string,
  audioUrl: string,
  telegramId: string,
  botName: string
): Promise<LipSyncResponse> {
  try {
    logger.info('🎬 Начинаем генерацию липсинка с Kling модели', {
      telegramId,
      botName,
      videoUrl: videoUrl.substring(0, 100) + '...',
      audioUrl: audioUrl.substring(0, 100) + '...',
    })

    // Используем новую Kling модель
    const result: KlingLipSyncResult = await generateKlingLipSync(
      telegramId,
      videoUrl,
      audioUrl,
      true
    )

    // Проверяем если результат - это ошибка
    if ('message' in result && 'error' in result) {
      const error = result as KlingLipSyncError
      logger.error('❌ Ошибка от Kling LipSync сервиса', {
        error: error.message,
        details: error.error,
        telegramId,
      })

      throw new Error(error.message || 'Ошибка при генерации липсинка')
    }

    // Результат успешный
    const success = result as KlingLipSyncResponse

    logger.info('✅ Kling LipSync запущен успешно', {
      id: success.id,
      status: success.status,
      telegramId,
      hasOutput: !!success.output,
    })

    // Возвращаем в формате, совместимом со старым API
    return {
      message:
        success.status === 'succeeded'
          ? 'Видео с липсинком готово'
          : 'Видео отправлено на обработку. Ждите результата',
      resultUrl: success.output,
      id: success.id,
      status: success.status,
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
