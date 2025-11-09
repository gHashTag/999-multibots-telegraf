import express from 'express'
import { Router } from 'express'
import { logger } from '@/utils/logger'
import { videoTaskStore } from '@/services/video-task-store'
import { Telegraf, Input } from 'telegraf'
import { VIDEO_MODELS_CONFIG as VIDEO_MODELS } from '@/config/unified-video-models.config'
import type { VideoModelId } from '@/services/generateTextToVideo'
// ✅ EMERGENCY DISABLE: asyncLipSyncManager import causing TypeScript errors
// import { asyncLipSyncManager } from '@/core/lipsync/async-lipsync-manager'

const router: Router = express.Router()

// Получаем bot instance для отправки сообщений
let botInstance: Telegraf | null = null
export function setBotInstance(bot: Telegraf): void {
  botInstance = bot
  logger.info('✅ [KIE.AI WEBHOOK] Bot instance set for webhook handler')
}

/**
 * Interface для webhook payload от Kie.ai
 */
interface KieAiWebhookPayload {
  taskId?: string
  successFlag?: number  // 0 = processing, 1 = completed, 2 = failed, 3 = content policy error
  resultUrls?: string[]
  result_url?: string
  videoUrl?: string
  errorMessage?: string
  errorCode?: string
  duration?: number
  code?: number  // HTTP status code from Kie.ai
  data?: any  // Kie.ai wraps some data in data field
  response?: {
    resultUrls?: string[]
    result_url?: string
    errorMessage?: string
    duration?: number
  }
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

    // ✅ ИСПРАВЛЕНИЕ: Kie.ai отправляет taskId в data.taskId
    const taskId = payload.taskId || (payload.data as any)?.taskId
    const successFlag = payload.successFlag !== undefined
      ? payload.successFlag
      : ((payload.data as any)?.state === 'success' ? 1 : 2)

    // ✅ Валидация обязательных полей
    if (!taskId) {
      logger.error('❌ [SORA WEBHOOK] Missing taskId', {
        payload,
        hasData: !!payload.data,
        dataKeys: payload.data ? Object.keys(payload.data) : []
      })
      return
    }

    // Нормализуем payload
    // Kie.ai отправляет resultJson как строку JSON, нужно распарсить
    let resultUrls: string[] | undefined
    try {
      if ((payload.data as any)?.resultJson) {
        const resultJson = JSON.parse((payload.data as any).resultJson)
        resultUrls = resultJson.resultUrls
      }
    } catch (e) {
      logger.warn('[SORA WEBHOOK] Failed to parse resultJson', { error: e })
    }

    const normalizedPayload: KieAiWebhookPayload = {
      ...payload,
      taskId,
      successFlag,
      resultUrls: payload.resultUrls || resultUrls || (payload.data as any)?.resultUrls,
      videoUrl: payload.videoUrl || resultUrls?.[0] || (payload.data as any)?.resultUrls?.[0]
    }

    // ✅ Асинхронная обработка Sora видео в фоне с нормализованным payload
    processSoraWebhookAsync(normalizedPayload).catch(error => {
      logger.error('❌ [SORA WEBHOOK] Error in async processing', {
        taskId: normalizedPayload.taskId,
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

  // Получаем контекст задачи
  const taskContext = videoTaskStore.getTask(taskId)
  if (!taskContext) {
    logger.error('❌ [SORA WEBHOOK] Task context not found', { taskId })
    return
  }

  if (!botInstance) {
    logger.error('❌ [SORA WEBHOOK] Bot instance not initialized')
    return
  }

  try {
    // Обновляем сообщение о статусе
    await botInstance.telegram.editMessageText(
      taskContext.chatId,
      taskContext.messageId,
      undefined,
      '✅ Видео успешно сгенерировано! Отправляю...'
    )

    // Получаем информацию о модели
    const modelInfo = VIDEO_MODELS[taskContext.modelId as VideoModelId]
    const modelName = modelInfo?.nameRu || 'Sora 2'

    // Отправляем видео с простым текстом (без Markdown чтобы избежать ошибок парсинга)
    await botInstance.telegram.sendVideo(
      taskContext.chatId,
      Input.fromURL(videoUrl),
      {
        caption:
          `🤖 Модель: ${modelName}\n` +
          `⏱️ Длительность: ${taskContext.duration} сек\n` +
          `⚡ Сгенерировано через AI`,
      }
    )

    // Отправляем промпт отдельным сообщением (без Markdown)
    await botInstance.telegram.sendMessage(
      taskContext.chatId,
      `📝 Ваш запрос:\n\n${taskContext.prompt}`
    )

    // Удаляем сообщение о процессе генерации
    try {
      await botInstance.telegram.deleteMessage(taskContext.chatId, taskContext.messageId)
    } catch (e) {
      // Игнорируем ошибку, если сообщение уже удалено
      logger.warn('[SORA WEBHOOK] Could not delete processing message', { error: e })
    }

    logger.info('✅ [SORA WEBHOOK] Video sent to user', {
      taskId,
      telegramId: taskContext.telegramId
    })

    // Удаляем задачу из хранилища
    videoTaskStore.deleteTask(taskId)

  } catch (error) {
    logger.error('❌ [SORA WEBHOOK] Error sending video to user', {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    })

    // Отправляем сообщение об ошибке
    try {
      await botInstance.telegram.editMessageText(
        taskContext.chatId,
        taskContext.messageId,
        undefined,
        '❌ Ошибка при отправке видео. Попробуйте позже.'
      )
    } catch (e) {
      logger.error('[SORA WEBHOOK] Could not send error message', { error: e })
    }
  }
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

  const taskContext = videoTaskStore.getTask(taskId)
  if (!taskContext || !botInstance) {
    return
  }

  try {
    await botInstance.telegram.editMessageText(
      taskContext.chatId,
      taskContext.messageId,
      undefined,
      `❌ Ошибка генерации: ${errorMessage || 'Неизвестная ошибка'}`
    )
    videoTaskStore.deleteTask(taskId)
  } catch (error) {
    logger.error('[SORA WEBHOOK] Error sending failure notification', { error })
  }
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

  const taskContext = videoTaskStore.getTask(taskId)
  if (!taskContext || !botInstance) {
    return
  }

  try {
    await botInstance.telegram.editMessageText(
      taskContext.chatId,
      taskContext.messageId,
      undefined,
      `🚫 Контент отклонен политикой безопасности. Попробуйте другой запрос.\n\n${errorMessage || ''}`
    )
    videoTaskStore.deleteTask(taskId)
  } catch (error) {
    logger.error('[SORA WEBHOOK] Error sending content policy notification', { error })
  }
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

    // ✅ Парсим resultJson если он присутствует (WAN 2.5 отправляет его как строку)
    let parsedResultUrls: string[] | undefined
    try {
      if ((payload.data as any)?.resultJson) {
        const resultJson = JSON.parse((payload.data as any).resultJson)
        parsedResultUrls = resultJson.resultUrls
        logger.info('✅ [KIE.AI WEBHOOK] Parsed resultJson', {
          taskId,
          parsedResultUrls,
          originalResultJson: (payload.data as any).resultJson.substring(0, 100)
        })
      }
    } catch (e) {
      logger.warn('⚠️ [KIE.AI WEBHOOK] Failed to parse resultJson', {
        taskId,
        error: e instanceof Error ? e.message : String(e)
      })
    }

    // ✅ Нормализуем payload для дальнейшей обработки
    const normalizedPayload: KieAiWebhookPayload = {
      ...payload,
      taskId,
      successFlag,
      resultUrls: payload.resultUrls || parsedResultUrls || (payload.data as any)?.info?.resultUrls || (payload.data as any)?.resultUrls,
      videoUrl: payload.videoUrl || parsedResultUrls?.[0] || (payload.data as any)?.info?.resultUrls?.[0],
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

    // ✅ Используем videoTaskStore для WAN/Sora моделей
    const taskContext = videoTaskStore.getTask(taskId)

    if (taskContext && botInstance) {
      logger.info('📤 [KIE.AI WEBHOOK] Found task context, sending video to user', {
        taskId,
        telegramId: taskContext.telegramId,
        hasVideoUrl: !!result.output
      })

      try {
        if (result.success && result.output) {
          // Успешная генерация - отправляем видео
          await botInstance.telegram.sendVideo(
            taskContext.chatId,
            result.output,
            {
              caption: `✅ Видео готово!\n\n🎬 Модель: ${taskContext.modelId}\n⏱ Длительность: ${result.duration || 'N/A'} сек`,
              reply_to_message_id: taskContext.messageId
            }
          )

          logger.info('✅ [KIE.AI WEBHOOK] Video sent to user successfully', { taskId })

          // Удаляем задачу из store после успешной отправки
          videoTaskStore.deleteTask(taskId)
        } else {
          // Ошибка генерации - отправляем сообщение об ошибке
          await botInstance.telegram.sendMessage(
            taskContext.chatId,
            `❌ Ошибка генерации видео: ${result.message || 'Неизвестная ошибка'}`,
            { reply_to_message_id: taskContext.messageId }
          )

          logger.error('❌ [KIE.AI WEBHOOK] Generation failed, notified user', { taskId })
          videoTaskStore.deleteTask(taskId)
        }
      } catch (sendError) {
        logger.error('❌ [KIE.AI WEBHOOK] Error sending message to user', {
          taskId,
          error: sendError instanceof Error ? sendError.message : String(sendError)
        })
      }
    } else {
      logger.warn('⚠️ [KIE.AI WEBHOOK] No task context or bot instance', {
        taskId,
        hasTaskContext: !!taskContext,
        hasBotInstance: !!botInstance
      })

      // Fallback: используем asyncLipSyncManager если он доступен (для lip-sync задач)
      // ✅ EMERGENCY DISABLE: asyncLipSyncManager causing TypeScript errors
      // const updated = await asyncLipSyncManager.completeJobByTaskId(taskId, result)
    }

  } catch (error) {
    logger.error('❌ [KIE.AI WEBHOOK] Error notifying job completion', {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * 🧪 DEBUG ENDPOINT: Тестирование Sora webhook с фейковыми данными
 * POST /api/kie-ai/sora-callback-test
 *
 * Создаёт тестовую задачу в video-task-store и симулирует успешный callback
 * Позволяет проверить всю цепочку отправки видео пользователю
 */
router.post('/kie-ai/sora-callback-test', async (req: any, res: any) => {
  try {
    logger.info('🧪 [SORA DEBUG] Test webhook endpoint called')

    // Получаем telegramId из query параметров
    const telegramId = parseInt(req.query.telegramId || req.body.telegramId || '144022504')
    const testTaskId = `test-${Date.now()}`

    // Создаём тестовую задачу в store
    videoTaskStore.saveTask(testTaskId, {
      telegramId: telegramId,
      chatId: telegramId,
      messageId: 999999, // Фейковый messageId
      prompt: '🧪 TEST: Это тестовое видео для проверки webhook callback',
      modelId: 'sora-2-text-to-video',
      duration: 10,
      createdAt: Date.now()
    })

    logger.info('🧪 [SORA DEBUG] Test task created', {
      taskId: testTaskId,
      telegramId,
      storeSize: videoTaskStore.getAllTasks().size
    })

    // Быстрый ответ
    res.status(200).json({
      message: 'Test task created successfully',
      taskId: testTaskId,
      telegramId,
      nextStep: `Send webhook callback to trigger video delivery: curl -X POST https://three-head-dragon.shop/api/kie-ai/sora-callback -H "Content-Type: application/json" -d '{"code":200,"data":{"taskId":"${testTaskId}","state":"success","resultJson":"{\\"resultUrls\\":[\\"https://via.placeholder.com/1920x1080.mp4\\"]}"}}' `
    })

  } catch (error) {
    logger.error('❌ [SORA DEBUG] Error in test endpoint', {
      error: error instanceof Error ? error.message : String(error)
    })
    res.status(500).json({ error: 'Test endpoint failed' })
  }
})

/**
 * 🧪 DEBUG ENDPOINT: Полная эмуляция Sora callback
 * POST /api/kie-ai/sora-full-test
 *
 * Создаёт тестовую задачу И сразу отправляет callback с результатом
 * Query params:
 * - telegramId: ID пользователя (default: 144022504)
 */
router.post('/kie-ai/sora-full-test', async (req: any, res: any) => {
  try {
    const telegramId = parseInt(req.query.telegramId || req.body.telegramId || '144022504')
    const testTaskId = `test-full-${Date.now()}`

    logger.info('🧪 [SORA FULL TEST] Starting full test', { telegramId, testTaskId })

    // 1. Создаём тестовую задачу
    videoTaskStore.saveTask(testTaskId, {
      telegramId: telegramId,
      chatId: telegramId,
      messageId: 999999,
      prompt: '🧪 FULL TEST: Автоматический тест webhook callback',
      modelId: 'sora-2-text-to-video',
      duration: 10,
      createdAt: Date.now()
    })

    logger.info('🧪 [SORA FULL TEST] Task created', { testTaskId })

    // 2. Симулируем успешный callback от Kie.ai
    const testPayload: KieAiWebhookPayload = {
      code: 200,
      data: {
        taskId: testTaskId,
        state: 'success',
        resultJson: JSON.stringify({
          resultUrls: ['https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4']
        })
      } as any
    }

    // Парсим payload как в основном обработчике
    const taskId = testPayload.taskId || (testPayload.data as any)?.taskId
    const successFlag = (testPayload.data as any)?.state === 'success' ? 1 : 2

    let resultUrls: string[] | undefined
    try {
      if ((testPayload.data as any)?.resultJson) {
        const resultJson = JSON.parse((testPayload.data as any).resultJson)
        resultUrls = resultJson.resultUrls
      }
    } catch (e) {
      logger.warn('[SORA FULL TEST] Failed to parse resultJson', { error: e })
    }

    const normalizedPayload: KieAiWebhookPayload = {
      ...testPayload,
      taskId,
      successFlag,
      resultUrls: resultUrls,
      videoUrl: resultUrls?.[0]
    }

    logger.info('🧪 [SORA FULL TEST] Calling processSoraWebhookAsync', { taskId, successFlag })

    // 3. Обрабатываем асинхронно
    processSoraWebhookAsync(normalizedPayload).catch(error => {
      logger.error('❌ [SORA FULL TEST] Error in async processing', {
        error: error.message
      })
    })

    // Быстрый ответ
    res.status(200).json({
      message: 'Full test initiated - video should be sent to Telegram',
      taskId: testTaskId,
      telegramId,
      videoUrl: resultUrls?.[0],
      checkLogs: 'Check logs for "✅ [SORA WEBHOOK] Video sent to user"'
    })

  } catch (error) {
    logger.error('❌ [SORA FULL TEST] Error', {
      error: error instanceof Error ? error.message : String(error)
    })
    res.status(500).json({ error: 'Full test failed' })
  }
})

export default router