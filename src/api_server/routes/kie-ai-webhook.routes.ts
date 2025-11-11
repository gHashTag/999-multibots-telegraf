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

// ✅ MULTI-BOT SUPPORT: Храним Map всех bot instances
const botInstances: Map<string, Telegraf> = new Map()
let defaultBotInstance: Telegraf | null = null

export function setBotInstance(bot: Telegraf, botName?: string): void {
  if (botName) {
    botInstances.set(botName, bot)
    logger.info('✅ [KIE.AI WEBHOOK] Bot instance registered', { botName })
  } else {
    // Legacy support: первый бот становится default
    defaultBotInstance = bot
    logger.info('✅ [KIE.AI WEBHOOK] Default bot instance set')
  }
}

// Получить нужный bot instance по имени или fallback на default
function getBotInstance(botName?: string): Telegraf | null {
  if (botName && botInstances.has(botName)) {
    return botInstances.get(botName) || null
  }
  return defaultBotInstance
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
 * 🌐 УНИВЕРСАЛЬНЫЙ Webhook Handler для ВСЕХ видео-моделей
 * POST /api/video-callback
 *
 * Принимает webhook'и от любых видео-провайдеров:
 * - Kie.ai (Sora, WAN 2.5, Veed Fabric)
 * - Replicate
 * - AI Reels
 * - Любые другие провайдеры
 *
 * Следует лучшим практикам:
 * - Быстрый ответ (202 Accepted)
 * - Асинхронная обработка
 * - Детальное логирование
 * - Валидация payload
 */

/**
 * 📤 Отправка видео напрямую пользователю по telegramId (без videoTaskStore)
 * Используется когда telegramId передан в callback URL
 */
async function sendVideoDirectly(
  telegramId: string,
  videoUrl: string,
  metadata: { jobId?: string; duration?: number }
): Promise<void> {
  try {
    logger.info('📤 [SEND VIDEO DIRECTLY] Starting direct video send', {
      telegramId,
      videoUrl: videoUrl.substring(0, 100),
      jobId: metadata.jobId,
      duration: metadata.duration
    })

    // Получаем bot instance (используем default bot или находим подходящий)
    const botInstance = defaultBotInstance || getBotInstance()

    if (!botInstance) {
      logger.error('❌ [SEND VIDEO DIRECTLY] No bot instance available', {
        telegramId,
        hasDefaultBot: !!defaultBotInstance,
        availableBots: Array.from(botInstances.keys())
      })
      throw new Error('No bot instance available')
    }

    const chatId = parseInt(telegramId)

    // ✅ Проверяем размер файла через HEAD запрос
    let fileSize = 0
    try {
      const headResponse = await fetch(videoUrl, { method: 'HEAD' })
      const contentLength = headResponse.headers.get('content-length')
      if (contentLength) {
        fileSize = parseInt(contentLength)
        logger.info('📏 [SEND VIDEO DIRECTLY] File size detected', {
          fileSize,
          fileSizeMB: (fileSize / 1024 / 1024).toFixed(2),
          isLargeFile: fileSize > 50 * 1024 * 1024
        })
      }
    } catch (error) {
      logger.warn('⚠️ [SEND VIDEO DIRECTLY] Could not get file size, will try to send as video', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    const MAX_TELEGRAM_VIDEO_SIZE = 50 * 1024 * 1024 // 50 MB

    logger.info('🎬 [SEND VIDEO DIRECTLY] Sending video to user', {
      telegramId,
      chatId,
      videoUrl: videoUrl.substring(0, 100),
      botUsername: botInstance.botInfo?.username,
      fileSize,
      willSendAsLink: fileSize > MAX_TELEGRAM_VIDEO_SIZE
    })

    // ✅ Если файл > 50 MB - отправляем ссылку, иначе - видео
    if (fileSize > MAX_TELEGRAM_VIDEO_SIZE) {
      logger.info('📎 [SEND VIDEO DIRECTLY] File too large, sending as link', {
        fileSizeMB: (fileSize / 1024 / 1024).toFixed(2)
      })

      await botInstance.telegram.sendMessage(
        chatId,
        `✅ Видео готово!\n\n` +
        `⚠️ Файл слишком большой (${(fileSize / 1024 / 1024).toFixed(1)} MB), отправляю ссылку:\n\n` +
        `🔗 ${videoUrl}\n\n` +
        `🎬 Job ID: ${metadata.jobId || 'N/A'}\n` +
        `⏱ Длительность: ${metadata.duration || 'N/A'} сек`,
        {
          disable_web_page_preview: false
        }
      )
    } else {
      // Отправляем видео пользователю
      await botInstance.telegram.sendVideo(
        chatId,
        videoUrl,
        {
          caption: `✅ Видео готово!\n\n🎬 Job ID: ${metadata.jobId || 'N/A'}\n⏱ Длительность: ${metadata.duration || 'N/A'} сек`,
        }
      )
    }

    logger.info('✅ [SEND VIDEO DIRECTLY] Video sent successfully', {
      telegramId,
      chatId,
      jobId: metadata.jobId
    })

  } catch (error) {
    logger.error('❌ [SEND VIDEO DIRECTLY] Error sending video', {
      telegramId,
      videoUrl: videoUrl.substring(0, 100),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    // Пытаемся отправить сообщение об ошибке пользователю
    try {
      const botInstance = defaultBotInstance || getBotInstance()
      if (botInstance) {
        await botInstance.telegram.sendMessage(
          parseInt(telegramId),
          `❌ Ошибка при отправке видео.\n\nJob ID: ${metadata.jobId || 'N/A'}\nПопробуйте снова или обратитесь в поддержку.`
        )
      }
    } catch (notifyError) {
      logger.error('❌ [SEND VIDEO DIRECTLY] Failed to notify user about error', {
        telegramId,
        notifyError: notifyError instanceof Error ? notifyError.message : String(notifyError)
      })
    }

    throw error
  }
}

/**
 * ✅ AUTO-DETECT PROVIDER: Определяем провайдера по структуре payload
 */
function detectVideoWebhookProvider(payload: any): 'kie-ai' | 'render-server' | 'unknown' {
  // Kie.ai - проверяем на наличие taskId или data.taskId
  if (payload.taskId || payload.data?.taskId) {
    return 'kie-ai'
  }

  // Render Server - проверяем download_url (Render Server)
  if (payload.download_url || payload.job_id) {
    return 'render-server'
  }

  return 'unknown'
}

// ✅ NEW: Callback с telegramId в URL - /api/video-callback/:telegramId
// Два роута: с и без telegramId
router.post('/video-callback/:telegramId', async (req: any, res: any) => {
  const startTime = Date.now()

  try {
    console.log('🔴🔴🔴 [VIDEO CALLBACK WITH TELEGRAM ID] Route handler called!')

    // ✅ Быстро отвечаем 202 Accepted согласно best practices
    res.status(202).json({
      message: 'Video webhook received and will be processed asynchronously',
      timestamp: new Date().toISOString()
    })

    const telegramIdFromUrl = req.params.telegramId

    console.log('🔴 telegramIdFromUrl:', telegramIdFromUrl)
    console.log('🔴 req.body:', req.body)

    logger.info('🎬 [UNIVERSAL VIDEO WEBHOOK] Received callback', {
      body: req.body,
      telegramIdFromUrl,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
      },
      responseTime: Date.now() - startTime
    })

    const payload = req.body

    // ✅ AUTO-DETECT PROVIDER: Определяем провайдера по структуре payload
    const detectedProvider = detectVideoWebhookProvider(payload)
    logger.info('🔍 [UNIVERSAL VIDEO WEBHOOK] Provider detected', {
      provider: detectedProvider,
      payloadKeys: Object.keys(payload)
    })

    switch (detectedProvider) {
      case 'kie-ai':
        logger.info('🎬 [UNIVERSAL VIDEO WEBHOOK] Kie.ai webhook detected')
        // Нормализуем payload и обрабатываем асинхронно
        const normalizedPayload = normalizeKieSoraPayload(payload)
        await processSoraWebhookAsync(normalizedPayload)
        break

      case 'render-server':
        logger.info('🎬 [UNIVERSAL VIDEO WEBHOOK] Render Server webhook detected')
        await processGenericVideoWebhook(payload, telegramIdFromUrl)
        break

      case 'unknown':
      default:
        logger.warn('⚠️ [UNIVERSAL VIDEO WEBHOOK] Unknown provider, processing as generic', {
          payload
        })
        await processGenericVideoWebhook(payload, telegramIdFromUrl)
        break
    }

  } catch (error) {
    logger.error('❌ [UNIVERSAL VIDEO WEBHOOK] Error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
  }
})

// Fallback route без telegramId (для обратной совместимости)
router.post('/video-callback', async (req: any, res: any) => {
  const startTime = Date.now()

  try {
    // ✅ Быстро отвечаем 202 Accepted согласно best practices
    res.status(202).json({
      message: 'Video webhook received and will be processed asynchronously',
      timestamp: new Date().toISOString()
    })

    const telegramIdFromUrl = req.params.telegramId

    logger.info('🎬 [UNIVERSAL VIDEO WEBHOOK] Received callback', {
      body: req.body,
      telegramIdFromUrl,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
      },
      responseTime: Date.now() - startTime
    })

    const payload: KieAiWebhookPayload = req.body

    // ✅ Автоопределение провайдера по структуре payload
    const provider = detectVideoProvider(payload)

    logger.info('🔍 [UNIVERSAL VIDEO WEBHOOK] Provider detected', { provider })

    // Маршрутизируем на соответствующий обработчик
    switch (provider) {
      case 'kie-sora':
        await processSoraWebhookAsync(normalizeKieSoraPayload(payload))
        break
      case 'kie-wan':
      case 'kie-veed':
        await processKieAiWebhookAsync(normalizeKiePayload(payload))
        break
      case 'replicate':
        logger.info('🔄 [UNIVERSAL VIDEO WEBHOOK] Replicate webhook - forwarding to replicate handler')
        // TODO: Implement replicate handler
        break
      case 'render-server':
        logger.info('🎬 [UNIVERSAL VIDEO WEBHOOK] Render Server webhook detected')
        await processGenericVideoWebhook(payload, telegramIdFromUrl)
        break
      default:
        logger.warn('⚠️ [UNIVERSAL VIDEO WEBHOOK] Unknown provider, attempting generic processing', { payload })
        await processGenericVideoWebhook(payload, telegramIdFromUrl)
        break
    }

  } catch (error) {
    logger.error('❌ [UNIVERSAL VIDEO WEBHOOK] Error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
      processingTime: Date.now() - startTime
    })
  }
})

/**
 * Автоопределение провайдера видео по структуре payload
 */
function detectVideoProvider(payload: any): string {
  // Kie.ai обычно имеет data.taskId или taskId
  if (payload.taskId || payload.data?.taskId) {
    // Sora имеет data.state и data.resultJson
    if (payload.data?.state && payload.data?.resultJson) {
      return 'kie-sora'
    }
    // WAN/Veed имеет successFlag и resultUrl на верхнем уровне
    if (payload.successFlag !== undefined && payload.resultUrl) {
      return 'kie-wan'
    }
    // Fallback: если есть data.state - это Sora
    if (payload.data?.state) {
      return 'kie-sora'
    }
    return 'kie-wan'
  }

  // Replicate обычно имеет prediction.id
  if (payload.prediction?.id || payload.id) {
    return 'replicate'
  }

  // Render Server (local Inngest) - проверяем job_id как основной индикатор
  if (payload.job_id || payload.renderTaskId || (payload.videoUrl && payload.status === 'completed')) {
    return 'render-server'
  }

  return 'unknown'
}

/**
 * Нормализация payload от Kie.ai Sora
 */
function normalizeKieSoraPayload(payload: any): KieAiWebhookPayload {
  const taskId = payload.taskId || payload.data?.taskId

  // ✅ FIX: Проверяем успешность по code===200 и наличию resultUrls
  // Veo 3 Fast отправляет: { code: 200, data: { resultUrls: [...] } }
  const successFlag = payload.successFlag !== undefined
    ? payload.successFlag
    : (payload.code === 200 && (payload.data?.resultUrls || payload.data?.info?.resultUrls) ? 1 : 2)

  let resultUrls: string[] | undefined
  try {
    if (payload.data?.resultJson) {
      const resultJson = JSON.parse(payload.data.resultJson)
      resultUrls = resultJson.resultUrls
    }
  } catch (e) {
    logger.warn('[UNIVERSAL VIDEO WEBHOOK] Failed to parse Sora resultJson', { error: e })
  }

  return {
    ...payload,
    taskId,
    successFlag,
    resultUrls: payload.resultUrls || resultUrls || payload.data?.info?.resultUrls || payload.data?.resultUrls,
    videoUrl: payload.videoUrl || resultUrls?.[0] || payload.data?.info?.resultUrls?.[0] || payload.data?.resultUrls?.[0]
  }
}

/**
 * Нормализация payload от Kie.ai WAN/Veed
 */
function normalizeKiePayload(payload: any): KieAiWebhookPayload {
  const taskId = payload.taskId || payload.data?.taskId
  const successFlag = payload.successFlag !== undefined
    ? payload.successFlag
    : (payload.code === 200 ? 1 : 2)

  let parsedResultUrls: string[] | undefined
  try {
    if (payload.data?.resultJson) {
      const resultJson = JSON.parse(payload.data.resultJson)
      parsedResultUrls = resultJson.resultUrls
    }
  } catch (e) {
    logger.warn('[UNIVERSAL VIDEO WEBHOOK] Failed to parse WAN resultJson', { error: e })
  }

  return {
    ...payload,
    taskId,
    successFlag,
    resultUrls: payload.resultUrls || parsedResultUrls || payload.data?.info?.resultUrls || payload.data?.resultUrls,
    videoUrl: payload.videoUrl || parsedResultUrls?.[0] || payload.data?.info?.resultUrls?.[0],
    errorMessage: payload.errorMessage || payload.data?.errorMessage
  }
}

/**
 * Обработка webhook от неизвестного провайдера
 */
async function processGenericVideoWebhook(payload: any, telegramIdFromUrl?: string): Promise<void> {
  logger.info('🔄 [GENERIC VIDEO WEBHOOK] Processing render server webhook', {
    payload,
    telegramIdFromUrl,
    keys: Object.keys(payload)
  })

  // Пытаемся извлечь базовую информацию из всех возможных мест
  const taskId = payload.job_id || payload.taskId || payload.id || payload.renderTaskId || payload.data?.taskId || payload.data?.id

  // ✅ КРИТИЧЕСКИ ВАЖНО: Проверяем ВСЕ возможные поля для videoUrl
  // Render Server отправляет download_url!
  const videoUrl = payload.download_url ||
                   payload.videoUrl ||
                   payload.video_url ||
                   payload.url ||
                   payload.result_url ||
                   payload.output ||
                   payload.data?.videoUrl ||
                   payload.data?.video_url ||
                   payload.data?.output

  // Render Server считается успешным, если есть download_url
  const success = payload.success !== undefined
    ? payload.success
    : (payload.download_url ? true : (payload.status === 'completed' || payload.status === 'success' || payload.state === 'success'))

  logger.info('📊 [GENERIC VIDEO WEBHOOK] Extracted data', {
    taskId,
    telegramIdFromUrl,
    videoUrl: videoUrl?.substring(0, 100),
    success,
    hasVideoUrl: !!videoUrl
  })

  // ✅ НОВАЯ ЛОГИКА: Если есть telegramId в URL и videoUrl - отправляем напрямую!
  if (telegramIdFromUrl && videoUrl && success) {
    logger.info('🚀 [GENERIC VIDEO WEBHOOK] Direct send mode - telegramId from URL', {
      telegramId: telegramIdFromUrl,
      videoUrl: videoUrl.substring(0, 100)
    })

    await sendVideoDirectly(telegramIdFromUrl, videoUrl, {
      jobId: taskId,
      duration: payload.duration || 10
    })
    return
  }

  // Fallback: старая логика через videoTaskStore
  if (!taskId) {
    logger.error('❌ [GENERIC VIDEO WEBHOOK] No task ID found in payload', {
      payloadKeys: Object.keys(payload)
    })
    return
  }

  if (!videoUrl && success) {
    logger.error('❌ [GENERIC VIDEO WEBHOOK] Success but no video URL found', {
      taskId,
      payloadKeys: Object.keys(payload),
      payload
    })
  }

  // Обрабатываем как стандартный Kie.ai webhook
  const normalizedPayload: KieAiWebhookPayload = {
    taskId,
    successFlag: success ? 1 : 2,
    videoUrl,
    resultUrls: videoUrl ? [videoUrl] : undefined
  }

  await processKieAiWebhookAsync(normalizedPayload)
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

  // ✅ MULTI-BOT FIX: Получаем правильный bot instance для этой задачи
  const botInstance = getBotInstance(taskContext.botName)
  if (!botInstance) {
    logger.error('❌ [SORA WEBHOOK] Bot instance not found', {
      taskId,
      requestedBot: taskContext.botName,
      availableBots: Array.from(botInstances.keys())
    })
    return
  }

  logger.info('✅ [SORA WEBHOOK] Using bot instance', {
    taskId,
    botName: taskContext.botName || 'default'
  })

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
  if (!taskContext) {
    return
  }

  // ✅ MULTI-BOT FIX: Получаем правильный bot instance
  const botInstance = getBotInstance(taskContext.botName)
  if (!botInstance) {
    logger.error('❌ [SORA WEBHOOK] Bot instance not found for failure handler', {
      taskId,
      requestedBot: taskContext.botName
    })
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

  logger.info('✅ [KIE.AI WEBHOOK] Video generation successful', {
    taskId,
    hasVideoUrl: !!videoUrl,
    videoUrl: videoUrl?.substring(0, 100),
    duration: payload.duration || 'unknown'
  })

  if (!videoUrl) {
    logger.error('❌ [KIE.AI WEBHOOK] Success callback but no video URL', {
      taskId,
      payloadKeys: Object.keys(payload),
      payload
    })

    // Обрабатываем как ошибку
    await notifyJobCompletion(taskId, {
      success: false,
      message: 'Video generation completed but no URL provided',
      code: 'NO_VIDEO_URL',
      provider: 'render-server',
      modelId: 'render-server'
    })
    return
  }

  const duration = payload.duration ||
                   payload.response?.duration ||
                   10 // default

  // Уведомляем об успешном завершении
  await notifyJobCompletion(taskId, {
    success: true,
    id: taskId,
    output: videoUrl,
    modelUsed: 'Render Server',
    duration,
    provider: 'render-server'
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

    if (taskContext) {
      // ✅ MULTI-BOT FIX: Получаем правильный bot instance для этой задачи
      const botInstance = getBotInstance(taskContext.botName)

      if (!botInstance) {
        logger.error('❌ [KIE.AI WEBHOOK] Bot instance not found', {
          taskId,
          requestedBot: taskContext.botName,
          availableBots: Array.from(botInstances.keys())
        })
        return
      }

      logger.info('📤 [KIE.AI WEBHOOK] Found task context, sending video to user', {
        taskId,
        telegramId: taskContext.telegramId,
        chatId: taskContext.chatId,
        messageId: taskContext.messageId,
        hasVideoUrl: !!result.output,
        videoUrl: result.output?.substring(0, 80),
        botName: taskContext.botName || 'default',
        success: result.success
      })

      try {
        if (result.success && result.output) {
          logger.info('🎬 [KIE.AI WEBHOOK] Sending video URL to user', {
            taskId,
            chatId: taskContext.chatId,
            videoUrl: result.output.substring(0, 100)
          })

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

          // Удаляем status message
          try {
            await botInstance.telegram.deleteMessage(taskContext.chatId, taskContext.messageId)
            logger.info('🗑️ [KIE.AI WEBHOOK] Status message deleted', { taskId })
          } catch (deleteError) {
            logger.warn('⚠️ [KIE.AI WEBHOOK] Could not delete status message', {
              taskId,
              error: deleteError instanceof Error ? deleteError.message : String(deleteError)
            })
          }

          // Удаляем задачу из store после успешной отправки
          videoTaskStore.deleteTask(taskId)
        } else {
          logger.error('❌ [KIE.AI WEBHOOK] Generation failed', {
            taskId,
            message: result.message,
            code: result.code
          })

          // Ошибка генерации - отправляем сообщение об ошибке
          await botInstance.telegram.sendMessage(
            taskContext.chatId,
            `❌ Ошибка генерации видео: ${result.message || 'Неизвестная ошибка'}`,
            { reply_to_message_id: taskContext.messageId }
          )

          logger.info('📢 [KIE.AI WEBHOOK] Error message sent to user', { taskId })
          videoTaskStore.deleteTask(taskId)
        }
      } catch (sendError) {
        logger.error('❌ [KIE.AI WEBHOOK] Error sending message to user', {
          taskId,
          error: sendError instanceof Error ? sendError.message : String(sendError),
          stack: sendError instanceof Error ? sendError.stack : undefined
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
      createdAt: Date.now(),
      botName: undefined // Тестовая задача - bot будет выбран автоматически
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
      createdAt: Date.now(),
      botName: undefined // Тестовая задача - bot будет выбран автоматически
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

// ✅ Логируем регистрацию роутов
logger.info('📋 [VIDEO WEBHOOK ROUTES] Registered routes:', {
  routes: [
    'POST /api/video-callback/:telegramId',
    'POST /api/video-callback',
    'POST /api/kie-ai/callback',
    'POST /api/kie-ai/sora-callback',
    'POST /api/kie-ai/sora-callback-test',
    'POST /api/kie-ai/sora-full-test'
  ]
})

export default router