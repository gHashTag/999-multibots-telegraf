import { logger } from '@/utils/logger'

/**
 * Адаптер для работы с ai-server
 * Заменяет прямые вызовы Replicate API
 */

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'https://ai-server-u14194.vm.elestio.app'

export interface AiServerLipSyncRequest {
  video_url: string
  audio_url: string
  user_id: string
  model?: string
  webhook_url?: string
}

export interface AiServerLipSyncResponse {
  id: string
  status: 'processing' | 'completed' | 'failed'
  result_url?: string
  error?: string
  progress?: number
}

/**
 * Генерирует LipSync через ai-server
 */
export async function generateLipSyncViaAiServer(
  request: AiServerLipSyncRequest
): Promise<AiServerLipSyncResponse> {
  logger.info('🎬 Отправляем запрос на ai-server для LipSync', {
    user_id: request.user_id,
    model: request.model || 'kling-lipsync',
    video_url: request.video_url.substring(0, 50) + '...',
    audio_url: request.audio_url.substring(0, 50) + '...',
  })

  try {
    // Пробуем разные возможные эндпоинты
    const endpoints = [
      '/api/lipsync',
      '/generate/lipsync', 
      '/generate/kling-lipsync',
      '/api/v1/lipsync',
      '/lipsync',
      '/replicate/lipsync'  // Возможный прокси для Replicate
    ]
    
    let lastError: any = null
    
    for (const endpoint of endpoints) {
      try {
        logger.info(`🔍 Пробуем эндпоинт: ${endpoint}`)
        
        const response = await fetch(`${AI_SERVER_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Добавляем авторизацию если нужна
            ...(process.env.AI_SERVER_API_KEY && {
              'Authorization': `Bearer ${process.env.AI_SERVER_API_KEY}`
            })
          },
          body: JSON.stringify({
            ...request,
            // Стандартизируем параметры для ai-server
            videoUrl: request.video_url,
            audioUrl: request.audio_url,
            userId: request.user_id,
            modelId: request.model || 'kwaivgi/kling-lip-sync'
          })
        })

        if (response.ok) {
          const result = await response.json()
          logger.info(`✅ LipSync запущен через ai-server (${endpoint})`, {
            id: result.id,
            status: result.status
          })
          
          return {
            id: result.id || `ai-server-${Date.now()}`,
            status: result.status || 'processing',
            result_url: result.result_url || result.output,
            error: result.error,
            progress: result.progress
          }
        } else if (response.status === 404) {
          logger.warn(`⚠️ Эндпоинт ${endpoint} не найден`)
          continue
        } else {
          const errorText = await response.text()
          logger.error(`❌ Ошибка ${endpoint}: ${response.status} - ${errorText}`)
          lastError = new Error(`AI Server error: ${response.status} - ${errorText}`)
        }
      } catch (error) {
        logger.error(`❌ Сетевая ошибка для ${endpoint}:`, error)
        lastError = error
        continue
      }
    }
    
    // Если все эндпоинты не работают, используем fallback через прямой Replicate
    logger.warn('⚠️ Все эндпоинты ai-server недоступны, используем fallback через Replicate')
    
    // Импортируем оригинальную функцию как fallback
    const { generateKlingLipSync } = await import('@/core/replicate/generateKlingLipSync')
    
    const replicateResult = await generateKlingLipSync(
      request.user_id,
      request.video_url, 
      request.audio_url,
      true
    )
    
    if ('message' in replicateResult && 'error' in replicateResult) {
      throw new Error(replicateResult.message)
    }
    
    const success = replicateResult as any
    return {
      id: success.id || `fallback-${Date.now()}`,
      status: success.status === 'succeeded' ? 'completed' : 'processing',
      result_url: success.output,
      error: success.error
    }
    
  } catch (error) {
    logger.error('❌ Критическая ошибка ai-server LipSync:', error)
    throw error
  }
}

/**
 * Проверяет статус LipSync задачи
 */
export async function getLipSyncStatusFromAiServer(
  taskId: string
): Promise<AiServerLipSyncResponse> {
  try {
    const response = await fetch(`${AI_SERVER_URL}/api/lipsync/${taskId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.AI_SERVER_API_KEY && {
          'Authorization': `Bearer ${process.env.AI_SERVER_API_KEY}`
        })
      }
    })
    
    if (response.ok) {
      const result = await response.json()
      return {
        id: result.id || taskId,
        status: result.status || 'processing',
        result_url: result.result_url || result.output,
        error: result.error,
        progress: result.progress
      }
    }
    
    // Fallback: проверяем через Replicate если задача начинается с префикса Replicate
    if (taskId.startsWith('pred_') || taskId.includes('replicate')) {
      const { getKlingLipSyncStatus } = await import('@/core/replicate/generateKlingLipSync')
      const replicateResult = await getKlingLipSyncStatus(taskId)
      
      if ('message' in replicateResult && 'error' in replicateResult) {
        throw new Error(replicateResult.message)
      }
      
      const success = replicateResult as any
      return {
        id: success.id || taskId,
        status: success.status === 'succeeded' ? 'completed' : 'processing', 
        result_url: success.output,
        error: success.error
      }
    }
    
    throw new Error(`Failed to get status: ${response.status}`)
    
  } catch (error) {
    logger.error('❌ Ошибка получения статуса из ai-server:', error)
    throw error
  }
}
