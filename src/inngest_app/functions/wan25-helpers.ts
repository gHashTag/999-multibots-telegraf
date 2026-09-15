/**
 * WAN 2.5 API Helpers для Inngest функций
 * Переиспользуем логику из ai-reels-wizard
 */

import { logger } from '@/utils/logger'
import {
  WAN25_API_CONFIG,
  type WAN25CreateTaskRequest,
  type WAN25TaskResponse,
  type WAN25StatusResponse,
} from '@/config/wan25-config'

/**
 * Создает задачу в WAN 2.5 API
 */
export async function createWAN25Task(
  request: WAN25CreateTaskRequest
): Promise<WAN25TaskResponse> {
  const { KIE_AI_API_KEY } = await import('@/config')

  if (!KIE_AI_API_KEY) {
    throw new Error('KIE_AI_API_KEY not configured')
  }

  const url = `${WAN25_API_CONFIG.BASE_URL}${WAN25_API_CONFIG.ENDPOINTS.CREATE_TASK}`

  logger.info('🔥 [WAN 2.5 API] Создание задачи', {
    url,
    model: request.model,
    duration: request.input.duration,
    resolution: request.input.resolution,
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...WAN25_API_CONFIG.HEADERS,
      Authorization: `Bearer ${KIE_AI_API_KEY}`,
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(WAN25_API_CONFIG.TIMEOUT.CREATE_TASK),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('❌ [WAN 2.5 API] Ошибка создания задачи', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    })
    throw new Error(
      `WAN 2.5 API error: ${response.status} ${response.statusText}`
    )
  }

  const result = await response.json()
  logger.info('✅ [WAN 2.5 API] Задача создана', {
    taskId: result.data?.taskId,
  })

  return result
}

/**
 * Проверяет статус задачи WAN 2.5
 */
export async function checkWAN25TaskStatus(
  taskId: string
): Promise<WAN25StatusResponse> {
  const { KIE_AI_API_KEY } = await import('@/config')

  if (!KIE_AI_API_KEY) {
    throw new Error('KIE_AI_API_KEY not configured')
  }

  const url = `${WAN25_API_CONFIG.BASE_URL}${WAN25_API_CONFIG.ENDPOINTS.RECORD_INFO}?taskId=${taskId}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${KIE_AI_API_KEY}`,
    },
    signal: AbortSignal.timeout(WAN25_API_CONFIG.TIMEOUT.STATUS_CHECK),
  })

  if (!response.ok) {
    throw new Error(
      `WAN 2.5 status check error: ${response.status} ${response.statusText}`
    )
  }

  return response.json()
}

/**
 * Ожидает завершения задачи WAN 2.5 с polling
 */
export async function waitForWAN25Task(
  taskId: string,
  maxWaitTimeMs: number = 120000
): Promise<string> {
  const startTime = Date.now()
  const pollInterval = WAN25_API_CONFIG.TIMEOUT.POLL_INTERVAL

  logger.info('⏳ [WAN 2.5 API] Начинаем ожидание результата', {
    taskId,
    maxWaitTimeMs,
    pollInterval,
  })

  while (Date.now() - startTime < maxWaitTimeMs) {
    try {
      console.log('🔍 [WAN 2.5 POLLING] Checking status...', {
        taskId,
        attempt: Math.floor((Date.now() - startTime) / pollInterval) + 1,
        elapsedTime: Math.floor((Date.now() - startTime) / 1000) + 's',
      })

      const status = await checkWAN25TaskStatus(taskId)

      console.log('📊 [WAN 2.5 POLLING] Status response:', {
        taskId,
        code: status.code,
        state: status.data?.state,
        hasResultJson: !!status.data?.resultJson,
        hasFailMsg: !!status.data?.failMsg,
        fullResponse: JSON.stringify(status),
      })

      logger.info('🔍 [WAN 2.5 API] Проверка статуса', {
        taskId,
        state: status.data.state,
        elapsedTime: Date.now() - startTime,
      })

      if (status.code === 200 && status.data.state === 'success') {
        const resultJson = status.data.resultJson
          ? JSON.parse(status.data.resultJson)
          : {}
        const videoUrl = resultJson.resultUrls?.[0] || ''

        if (videoUrl) {
          logger.info('✅ [WAN 2.5 API] Задача завершена успешно', {
            taskId,
            videoUrl: videoUrl.substring(0, 100),
            totalTime: Date.now() - startTime,
            consumeCredits: status.data.consumeCredits,
          })
          return videoUrl
        } else {
          throw new Error('WAN 2.5 task completed but no video URL in result')
        }
      }

      if (status.data.state === 'fail') {
        logger.error('❌ [WAN 2.5 API] Задача завершилась с ошибкой', {
          taskId,
          failMsg: status.data.failMsg,
        })
        throw new Error(
          `WAN 2.5 task failed: ${status.data.failMsg || 'Unknown error'}`
        )
      }

      // Если задача все еще обрабатывается, ждем
      if (status.data.state === 'processing') {
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        continue
      }

      // Неизвестное состояние
      logger.warn('⚠️ [WAN 2.5 API] Неизвестное состояние задачи', {
        taskId,
        state: status.data.state,
        response: status,
      })

      // Back off on an unknown/unexpected state too. Only 'processing' slept
      // above; any other non-terminal value (a queued/generating token, an
      // undefined state, or a non-200 body) fell straight through to the loop
      // condition and re-polled at network speed, hammering the kie API for the
      // whole wait window. Sleep like the 'processing' and error paths do.
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    } catch (pollError) {
      logger.error('❌ [WAN 2.5 API] Ошибка при проверке статуса', {
        taskId,
        error: pollError,
        elapsedTime: Date.now() - startTime,
      })

      // Если это последняя попытка, выбрасываем ошибку
      if (Date.now() - startTime + pollInterval >= maxWaitTimeMs) {
        throw pollError
      }

      // Иначе ждем и пробуем снова
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }

  logger.error('⏱️ [WAN 2.5 API] Timeout ожидания результата', {
    taskId,
    maxWaitTimeMs,
    elapsedTime: Date.now() - startTime,
  })

  throw new Error(`WAN 2.5 task timeout after ${maxWaitTimeMs}ms`)
}
