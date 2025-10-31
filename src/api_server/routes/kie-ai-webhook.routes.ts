import express from 'express'
import { Router } from 'express'
import { logger } from '@/utils/logger'
import { asyncLipSyncManager } from '@/core/lipsync/async-lipsync-manager'

const router: Router = express.Router()

/**
 * Interface для webhook payload от Kie.ai
 */
interface KieAiWebhookPayload {
  taskId: string
  successFlag: number  // 0 = processing, 1 = completed, 2 = failed, 3 = content policy error
  resultUrls?: string[]
  result_url?: string
  videoUrl?: string
  errorMessage?: string
  errorCode?: string
  duration?: number
  response?: {
    resultUrls?: string[]
    result_url?: string
    errorMessage?: string
    duration?: number
  }
  data?: any; // Allow nested data object
  code?: number; // Allow 'code' for success/failure detection
}

/**
 * Kie.ai Webhook Handler для Sora 2 Video Generation
 * POST /api/kie-ai/sora-callback
 *
 * Следует лучшим практикам:
 * - Быстрый ответ (202 Accepted)
 * - Асинхронная обработка
 * - Детальное логирование
 * - Валидация payload
 */
router.post('/kie-ai/sora-callback', async (req: any, res: any) => {
  const startTime = Date.now()

  try {
    // ✅ Быстро отвечаем 202 Accepted согласно best practices
    res.status(202).json({
      message: 'Sora webhook received and will be processed asynchronously',
      timestamp: new Date().toISOString()
    })

    logger.info('🎬 [SORA WEBHOOK] Received callback', {
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
      },
      responseTime: Date.now() - startTime
    })

    const payload: KieAiWebhookPayload = req.body

    // ✅ Валидация обязательных полей
    if (!payload.taskId) {
      logger.error('❌ [SORA WEBHOOK] Missing taskId', { payload })
      return
    }

    if (typeof payload.successFlag !== 'number') {
      logger.error('❌ [SORA WEBHOOK] Missing or invalid successFlag', {
        payload,
        successFlagType: typeof payload.successFlag
      })
      return
    }

    // ✅ Асинхронная обработка Sora видео в фоне
    processSoraWebhookAsync(payload).catch(error => {
      logger.error('❌ [SORA WEBHOOK] Error in async processing', {
        taskId: payload.taskId,
        error: error.message,
        stack: error.stack
      })
    })

  } catch (error) {
    logger.error('❌ [SORA WEBHOOK] Error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
      processingTime: Date.now() - startTime
    })
  }
})

/**
 * Асинхронная обработка Sora webhook
 */
async function processSoraWebhookAsync(payload: KieAiWebhookPayload): Promise<void> {
  const { taskId, successFlag } = payload

  logger.info('🎬 [SORA WEBHOOK] Processing Sora callback', {
    taskId,
    successFlag,
    hasResultUrls: !!(payload.resultUrls || payload.response?.resultUrls),
    hasVideoUrl: !!payload.videoUrl,
    hasErrorMessage: !!payload.errorMessage
  })

  try {
    switch (successFlag) {
      case 1: // ✅ Completed successfully
        await handleSoraSuccess(payload)
        break

      case 2: // ❌ Generation failed
        await handleSoraFailure(payload)
        break

      case 3: // ❌ Content policy violation
        await handleSoraContentPolicy(payload)
        break

      case 0: // ⏳ Still processing
        logger.info('⏳ [SORA WEBHOOK] Task still processing', { taskId })
        break

      default:
        logger.warn('⚠️ [SORA WEBHOOK] Unknown successFlag value', {
          taskId,
          successFlag
        })
        break
    }
  } catch (error) {
    logger.error('❌ [SORA WEBHOOK] Error in async processing', {
      taskId,
      successFlag,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Обработка успешной генерации Sora видео
 */
async function handleSoraSuccess(payload: KieAiWebhookPayload): Promise<void> {
  const { taskId } = payload
  const videoUrl = payload.videoUrl ||
                  payload.resultUrls?.[0] ||
                  payload.result_url ||
                  payload.response?.resultUrls?.[0] ||
                  payload.response?.result_url

  if (!videoUrl) {
    logger.error('❌ [SORA WEBHOOK] Success but no video URL', { taskId, payload })
    return
  }

  logger.info('✅ [SORA WEBHOOK] Sora video generation successful', {
    taskId,
    videoUrl: videoUrl.substring(0, 100) + '...',
    duration: 10 // Sora всегда 10 секунд
  })

  // TODO: Уведомить пользователя о готовом видео через Telegram
  // Можно использовать систему как в handleSuccessfulGeneration для LipSync
  // Или хранить taskId -> telegram_id mapping для отправки видео
}

/**
 * Обработка ошибки генерации Sora
 */
async function handleSoraFailure(payload: KieAiWebhookPayload): Promise<void> {
  const { taskId, errorMessage, errorCode } = payload

  logger.error('❌ [SORA WEBHOOK] Sora generation failed', {
    taskId,
    errorMessage,
    errorCode
  })

  // TODO: Уведомить пользователя об ошибке
}

/**
 * Обработка ошибки политики контента Sora
 */
async function handleSoraContentPolicy(payload: KieAiWebhookPayload): Promise<void> {
  const { taskId, errorMessage, errorCode } = payload

  logger.error('🚫 [SORA WEBHOOK] Sora content policy violation', {
    taskId,
    errorMessage,
    errorCode
  })

  // TODO: Уведомить пользователя о нарушении политики
}

/**
 * Kie.ai Webhook Handler для Veed Fabric LipSync
 * POST /api/kie-ai/callback
 *
 * Следует лучшим практикам:
 * - Быстрый ответ (202 Accepted)
 * - Асинхронная обработка
 * - Детальное логирование
 * - Валидация payload
 */
router.post('/kie-ai/callback', async (req: any, res: any) => {
  const startTime = Date.now()

  try {
    // ✅ Быстро отвечаем 202 Accepted согласно best practices
    res.status(202).json({
      message: 'Webhook received and will be processed asynchronously',
      timestamp: new Date().toISOString()
    })

    logger.info('🔔 [KIE.AI WEBHOOK] Received callback', {
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
      },
      responseTime: Date.now() - startTime
    })

    const payload: KieAiWebhookPayload = req.body

    // ✅ ИСПРАВЛЕНИЕ: Kie.ai отправляет taskId в payload.data.taskId
    const taskId = payload.taskId || (payload.data && payload.data.taskId) || (payload as any).data?.taskId
    const successFlag = payload.successFlag !== undefined ? payload.successFlag : (payload.code === 200 ? 1 : 2)

    // ✅ Валидация обязательных полей
    if (!taskId) {
      logger.error('❌ [KIE.AI WEBHOOK] Missing taskId', {
        payload,
        hasData: !!payload.data,
        dataKeys: payload.data ? Object.keys(payload.data) : []
      })
      return
    }

    // ✅ Нормализуем payload для дальнейшей обработки
    const normalizedPayload: KieAiWebhookPayload = {
      ...payload,
      taskId,
      successFlag,
      resultUrls: payload.resultUrls || (payload.data as any)?.info?.resultUrls || (payload.data as any)?.resultUrls,
      errorMessage: payload.errorMessage || (payload.data as any)?.errorMessage
    }

    if (typeof normalizedPayload.successFlag !== 'number') {
      logger.error('❌ [KIE.AI WEBHOOK] Missing or invalid successFlag', {
        payload,
        successFlagType: typeof normalizedPayload.successFlag
      })
      return
    }

    // ✅ Асинхронная обработка в фоне с нормализованным payload
    processKieAiWebhookAsync(normalizedPayload).catch(error => {
      logger.error('❌ [KIE.AI WEBHOOK] Error in async processing', {
        taskId: normalizedPayload.taskId,
        error: error.message,
        stack: error.stack
      })
    })

  } catch (error) {
    logger.error('❌ [KIE.AI WEBHOOK] Error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
      processingTime: Date.now() - startTime
    })

    // Уже отправили 202, поэтому не отправляем ошибку в response
  }
})

/**
 * Асинхронная обработка webhook от Kie.ai
 */
async function processKieAiWebhookAsync(payload: KieAiWebhookPayload): Promise<void> {
  const { taskId, successFlag } = payload

  logger.info('🔄 [KIE.AI WEBHOOK] Processing callback', {
    taskId,
    successFlag,
    hasResultUrls: !!(payload.resultUrls || payload.response?.resultUrls),
    hasVideoUrl: !!payload.videoUrl,
    hasErrorMessage: !!payload.errorMessage
  })

  try {
    switch (successFlag) {
      case 1: // ✅ Completed successfully
        await handleSuccessfulGeneration(payload)
        break

      case 2: // ❌ Generation failed
        await handleFailedGeneration(payload)
        break

      case 3: // ❌ Content policy violation
        await handleContentPolicyError(payload)
        break

      case 0: // ⏳ Still processing (обычно не отправляется webhook)
        logger.info('⏳ [KIE.AI WEBHOOK] Task still processing', { taskId })
        break

      default:
        logger.warn('⚠️ [KIE.AI WEBHOOK] Unknown successFlag value', {
          taskId,
          successFlag
        })
        break
    }
  } catch (error) {
    logger.error('❌ [KIE.AI WEBHOOK] Error in async processing', {
      taskId,
      successFlag,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Обработка успешной генерации
 */
async function handleSuccessfulGeneration(payload: KieAiWebhookPayload): Promise<void> {
  const { taskId } = payload

  // Извлекаем URL видео из разных возможных полей
  const videoUrl = payload.videoUrl ||
                  payload.resultUrls?.[0] ||
                  payload.result_url ||
                  payload.response?.resultUrls?.[0] ||
                  payload.response?.result_url

  if (!videoUrl) {
    logger.error('❌ [KIE.AI WEBHOOK] Success callback but no video URL', {
      taskId,
      payload
    })

    // Обрабатываем как ошибку
    await notifyJobCompletion(taskId, {
      success: false,
      message: 'Video generation completed but no URL provided',
      code: 'NO_VIDEO_URL',
      provider: 'kie',
      modelId: 'veed-fabric'
    })
    return
  }

  const duration = payload.duration ||
                   payload.response?.duration ||
                   8 // default

  logger.info('✅ [KIE.AI WEBHOOK] Video generation successful', {
    taskId,
    videoUrl: videoUrl.substring(0, 100) + '...',
    duration
  })

  // Уведомляем AsyncLipSyncManager об успешном завершении
  await notifyJobCompletion(taskId, {
    success: true,
    id: taskId,
    output: videoUrl,
    modelUsed: 'Veed Fabric AI',
    duration,
    provider: 'kie'
  })
}

/**
 * Обработка ошибки генерации
 */
async function handleFailedGeneration(payload: KieAiWebhookPayload): Promise<void> {
  const { taskId, errorMessage, errorCode } = payload

  logger.error('❌ [KIE.AI WEBHOOK] Video generation failed', {
    taskId,
    errorMessage,
    errorCode
  })

  await notifyJobCompletion(taskId, {
    success: false,
    message: errorMessage || 'Video generation failed',
    code: errorCode || 'GENERATION_FAILED',
    provider: 'kie',
    modelId: 'veed-fabric'
  })
}

/**
 * Обработка ошибки политики контента
 */
async function handleContentPolicyError(payload: KieAiWebhookPayload): Promise<void> {
  const { taskId, errorMessage, errorCode } = payload

  logger.error('🚫 [KIE.AI WEBHOOK] Content policy violation', {
    taskId,
    errorMessage,
    errorCode
  })

  await notifyJobCompletion(taskId, {
    success: false,
    message: errorMessage || 'Content rejected by policy. Please try different prompt or image.',
    code: 'CONTENT_POLICY_VIOLATION',
    provider: 'kie',
    modelId: 'veed-fabric'
  })
}

/**
 * Уведомление AsyncLipSyncManager о завершении задачи
 */
async function notifyJobCompletion(
  taskId: string,
  result: any
): Promise<void> {
  try {
    logger.info('🔔 [KIE.AI WEBHOOK] Notifying job completion', {
      taskId,
      success: result.success,
      hasOutput: !!(result.output || result.id),
      errorMessage: result.message
    })

    // ✅ Используем новый метод для обновления задачи по taskId
    const updated = await asyncLipSyncManager.completeJobByTaskId(taskId, result)

    if (!updated) {
      logger.warn('⚠️ [KIE.AI WEBHOOK] Job not found by taskId - might be orphaned webhook', {
        taskId,
        allJobsStats: asyncLipSyncManager.getStats()
      })
    } else {
      logger.info('✅ [KIE.AI WEBHOOK] Job successfully updated and user notified', {
        taskId
      })
    }

  } catch (error) {
    logger.error('❌ [KIE.AI WEBHOOK] Error notifying job completion', {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export default router