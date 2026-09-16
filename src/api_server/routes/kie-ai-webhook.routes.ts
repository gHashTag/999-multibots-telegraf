import express from 'express'
import { createVideoDeliveryClaimer } from '@/helpers/videoDeliveryIdempotency'
import { Router } from 'express'
import { logger } from '@/utils/logger'
import { videoTaskStore } from '@/services/video-task-store'
import { Telegraf, Input } from 'telegraf'
import { VIDEO_MODELS_CONFIG as VIDEO_MODELS } from '@/config/unified-video-models.config'
import type { VideoModelId } from '@/services/generateTextToVideo'
import { sendMediaToPulse } from '@/helpers/pulse'
import {
  createVideoCompletionKeyboard,
  getVideoCompletionMessage,
} from '@/helpers/videoCompletionKeyboard'
import { verifyCallbackToken } from '@/utils/callbackToken'
import { getUserLanguageFromDB } from '@/core/supabase'
import { sanitizeUrl } from '@/utils/sanitize'
import { asyncLipSyncManager } from '@/core/lipsync/async-lipsync-manager'

const router: Router = express.Router()

// ✅ Локализация ошибок - переводим технические сообщения на русский
const ERROR_TRANSLATIONS: Record<string, string> = {
  // Sora/Image-to-Video ошибки
  'We currently do not support uploads of images containing photorealistic people.':
    'Мы не поддерживаем загрузку изображений с реалистичными людьми',
  'This image contains photorealistic people.':
    'Изображение содержит реалистичных людей',
  'Image contains faces.': 'Изображение содержит лица',

  // Общие ошибки
  'Content policy violation': 'Нарушение политики контента',
  'Invalid request': 'Недействительный запрос',
  'Generation timeout': 'Превышено время генерации',
  'Model not found': 'Модель не найдена',
  'Insufficient credits': 'Недостаточно кредитов',
  'Rate limit exceeded': 'Превышен лимит запросов',
}

// ✅ Функция для перевода ошибок на русский
function translateErrorToRussian(errorMessage: string): string {
  // Если сообщение на русском - возвращаем как есть
  if (/[а-яё]/i.test(errorMessage)) {
    return errorMessage
  }

  // Ищем перевод в карте
  if (ERROR_TRANSLATIONS[errorMessage]) {
    return ERROR_TRANSLATIONS[errorMessage]
  }

  // Если перевод не найден, возвращаем оригинал
  return errorMessage
}

/**
 * A PROVIDER REFUSAL THAT IS ACTUALLY OUR ACCOUNT.
 *
 * successFlag 3 means the provider refused the customer's own prompt or photo
 * (see the interface below), which is everyday traffic on a multi-bot platform
 * and nothing an operator can act on — so the content-policy handlers log it at
 * warn rather than paging the owner.
 *
 * But the translation map above carries two strings that are NOT the customer:
 * 'Insufficient credits' and 'Rate limit exceeded' describe OUR account with the
 * provider, and every generation stops until somebody tops it up. Flag 2 is the
 * documented place for those, so the overlap is unlikely — and a wrong guess
 * here costs a page, while the other way round costs an outage nobody is told
 * about. If one ever arrives under flag 3, it keeps paging.
 */
function isProviderAccountError(errorMessage?: string): boolean {
  return /insufficient credits|insufficient balance|rate limit exceeded|quota/i.test(
    errorMessage || ''
  )
}

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
  successFlag?: number // 0 = processing, 1 = completed, 2 = failed, 3 = content policy error
  resultUrls?: string[]
  resultWaterMarkUrls?: string[] // Sora возвращает отдельно URL с водяным знаком
  resultUrl?: string // camelCase variant for some providers
  result_url?: string
  videoUrl?: string
  errorMessage?: string
  errorCode?: string
  duration?: number
  code?: number // HTTP status code from Kie.ai
  data?: any // Kie.ai wraps some data in data field
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
 * Charge for a video this webhook just delivered.
 *
 * For Kie.ai models the bot deliberately skips polling and waits for this
 * webhook (handleTextToVideoDirect.ts:216, monitorVideoGeneration returns early
 * for Sora), and PR #977 moved image-to-video billing here too. That makes this
 * webhook the ONLY place the money can be taken — so a skip here means the
 * video was delivered for free.
 *
 * It used to skip silently whenever the model id was missing or unpriced, which
 * is exactly what happened: the direct-send path passed the literal
 * 'sora-2-image-to-video', which is not a key of UNIFIED_VIDEO_MODELS, so
 * checkBalanceVideoOperationHelper failed and the guard swallowed it. Now every
 * non-charge is logged as an error with the ids needed to find the case.
 */
// Job ids already charged in this process. A provider webhook is delivered
// at-least-once, and two concurrent deliveries of the same completed job both
// reach chargeForDeliveredVideo; the ledger row it inserts is keyed on a
// per-call timestamp, not the job, so it does not dedupe. This makes the charge
// idempotent per job. Reset on restart — a durable guard would be a unique
// inv_id per job on payments_v2 (owner migration).
const chargedVideoJobs = new Set<string>()

// Job ids already DELIVERED in this process. A provider webhook is delivered
// at-least-once; two concurrent deliveries of the same completed job both pass
// getTask before either deleteTask, so both reach sendVideo — the user gets the
// video (and the public Pulse repost) twice. This makes the DELIVERY idempotent
// per job, alongside the existing chargedVideoJobs charge guard. Bounded so a
// long-lived multi-bot process cannot grow the set without limit (copied from
// the sibling poller handleTextToVideoDirect.ts). Reset on restart.
const claimVideoJobDelivery = createVideoDeliveryClaimer()
// Separate claimer for FAILURE/content-policy notifications: at-least-once
// provider retries must not re-send the same error text. Its own set so it
// never collides with the success-delivery claim (see #1352).
const claimVideoFailureNotify = createVideoDeliveryClaimer()

async function chargeForDeliveredVideo(params: {
  telegramId: string
  modelId?: string
  jobId?: string
  where: string
}): Promise<void> {
  const { telegramId, modelId, jobId, where } = params
  // Idempotency (in-process): a synchronous check-and-add on jobId makes the
  // charge fire at most once per job, so a duplicate/concurrent webhook delivery
  // no longer double-debits. It only ever SKIPS a charge, never adds one.
  if (jobId) {
    if (chargedVideoJobs.has(jobId)) {
      logger.warn(
        `⏭️ [${where}] duplicate delivery — charge already applied for this job`,
        { jobId, telegramId }
      )
      return
    }
    chargedVideoJobs.add(jobId)
  }

  const notCharged = (reason: string, extra: Record<string, unknown> = {}) => {
    logger.error(`❌ [${where}] VIDEO DELIVERED BUT NOT CHARGED`, {
      alert: 'video delivered for free',
      reason,
      telegramId,
      jobId,
      modelId,
      ...extra,
    })
  }

  if (!modelId) {
    notCharged('no modelId in task context or callback metadata')
    return
  }

  try {
    const { checkBalanceVideoOperationHelper, deductBalanceAfterSuccess } =
      await import('@/modules/videoGenerator/helpers')

    const balanceResult = await checkBalanceVideoOperationHelper(
      telegramId,
      modelId,
      true, // isRu
      'image_to_video'
    )

    if (!balanceResult.success || balanceResult.paymentAmount === undefined) {
      notCharged('balance check failed (unknown model or insufficient funds)', {
        error: balanceResult.error,
      })
      return
    }

    const deductSuccess = await deductBalanceAfterSuccess(
      telegramId,
      modelId,
      'default',
      balanceResult.paymentAmount,
      'image_to_video'
    )

    if (deductSuccess) {
      logger.info(`✅ [${where}] Payment deducted`, {
        telegramId,
        modelId,
        paymentAmount: balanceResult.paymentAmount,
      })
    } else {
      notCharged('deductBalanceAfterSuccess returned false', {
        paymentAmount: balanceResult.paymentAmount,
      })
    }
  } catch (paymentError) {
    notCharged('exception while charging', {
      error:
        paymentError instanceof Error
          ? paymentError.message
          : String(paymentError),
    })
  }
}

/**
 * 📤 Отправка видео напрямую пользователю по telegramId (без videoTaskStore)
 * Используется когда telegramId передан в callback URL
 */
async function sendVideoDirectly(
  telegramId: string,
  videoUrl: string,
  metadata: { jobId?: string; duration?: number; modelId?: string }
): Promise<void> {
  try {
    logger.info('📤 [SEND VIDEO DIRECTLY] Starting direct video send', {
      telegramId,
      videoUrl: videoUrl.substring(0, 100),
      jobId: metadata.jobId,
      duration: metadata.duration,
    })

    // Получаем bot instance (используем default bot или находим подходящий)
    const botInstance = defaultBotInstance || getBotInstance()

    if (!botInstance) {
      logger.error('❌ [SEND VIDEO DIRECTLY] No bot instance available', {
        telegramId,
        hasDefaultBot: !!defaultBotInstance,
        availableBots: Array.from(botInstances.keys()),
      })
      throw new Error('No bot instance available')
    }

    const chatId = parseInt(telegramId)

    // ✅ ИСПРАВЛЕНО: Валидация chatId для предотвращения передачи NaN
    if (isNaN(chatId) || chatId <= 0) {
      logger.error('❌ [SEND VIDEO DIRECTLY] Invalid telegramId', {
        telegramId,
        parsedChatId: chatId,
        error: 'telegramId must be a valid positive number',
      })
      throw new Error(
        `Invalid telegramId: ${telegramId}. Must be a valid positive number.`
      )
    }

    // Idempotency: claim the delivery before any await so a duplicate/concurrent
    // webhook for this job — including a SEQUENTIAL duplicate that arrives after
    // the task was deleted and falls to this direct path — skips the re-send and
    // the downstream charge. Keys on the immutable jobId, same key as the charge
    // guard (chargedVideoJobs).
    if (metadata.jobId && !claimVideoJobDelivery(metadata.jobId)) return

    // SSRF guard: videoUrl comes from the untrusted webhook payload and is fetched
    // server-side (HEAD below). Reject private/local/cloud-metadata hosts and abort
    // delivery rather than probe an internal address.
    try {
      sanitizeUrl(videoUrl)
    } catch (ssrfErr) {
      logger.error(
        '❌ [SEND VIDEO DIRECTLY] Blocked non-public video URL (SSRF)',
        {
          telegramId,
          error: ssrfErr instanceof Error ? ssrfErr.message : String(ssrfErr),
        }
      )
      return
    }

    // ✅ Проверяем размер файла через HEAD запрос
    let fileSize = 0
    try {
      // redirect:'manual' so a public URL cannot 302 the HEAD to a private host;
      // Telegram still follows any legitimate redirect when the video is sent.
      const headResponse = await fetch(videoUrl, {
        method: 'HEAD',
        redirect: 'manual',
      })
      const contentLength = headResponse.headers.get('content-length')
      if (contentLength) {
        fileSize = parseInt(contentLength)
        logger.info('📏 [SEND VIDEO DIRECTLY] File size detected', {
          fileSize,
          fileSizeMB: (fileSize / 1024 / 1024).toFixed(2),
          isLargeFile: fileSize > 50 * 1024 * 1024,
        })
      }
    } catch (error) {
      logger.warn(
        '⚠️ [SEND VIDEO DIRECTLY] Could not get file size, will try to send as video',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
    }

    const MAX_TELEGRAM_VIDEO_SIZE = 50 * 1024 * 1024 // 50 MB

    logger.info('🎬 [SEND VIDEO DIRECTLY] Sending video to user', {
      telegramId,
      chatId,
      videoUrl: videoUrl.substring(0, 100),
      botUsername: botInstance.botInfo?.username,
      fileSize,
      willSendAsLink: fileSize > MAX_TELEGRAM_VIDEO_SIZE,
    })

    // ✅ Если файл > 50 MB - отправляем ссылку, иначе - видео
    const isRu = (await getUserLanguageFromDB(telegramId)) !== 'en'
    if (fileSize > MAX_TELEGRAM_VIDEO_SIZE) {
      logger.info('📎 [SEND VIDEO DIRECTLY] File too large, sending as link', {
        fileSizeMB: (fileSize / 1024 / 1024).toFixed(2),
      })

      await botInstance.telegram.sendMessage(
        chatId,
        (isRu ? `✅ Видео готово!\n\n` : `✅ Your video is ready!\n\n`) +
          (isRu
            ? `⚠️ Файл слишком большой (${(fileSize / 1024 / 1024).toFixed(1)} MB), отправляю ссылку:\n\n`
            : `⚠️ File too large (${(fileSize / 1024 / 1024).toFixed(1)} MB), sending a link:\n\n`) +
          `🔗 ${videoUrl}\n\n` +
          `🎬 Job ID: ${metadata.jobId || 'N/A'}\n` +
          (isRu
            ? `⏱ Длительность: ${metadata.duration || 'N/A'} сек`
            : `⏱ Duration: ${metadata.duration || 'N/A'} sec`),
        {
          link_preview_options: { is_disabled: false },
        }
      )

      // ✅ Отправляем клавиатуру с кнопками продолжения (для больших файлов)
      await botInstance.telegram.sendMessage(
        chatId,
        getVideoCompletionMessage(isRu),
        createVideoCompletionKeyboard(isRu)
      )
    } else {
      // Отправляем видео пользователю
      await botInstance.telegram.sendVideo(chatId, videoUrl, {
        caption: isRu
          ? `✅ Видео готово!\n\n🎬 Job ID: ${metadata.jobId || 'N/A'}\n⏱ Длительность: ${metadata.duration || 'N/A'} сек`
          : `✅ Your video is ready!\n\n🎬 Job ID: ${metadata.jobId || 'N/A'}\n⏱ Duration: ${metadata.duration || 'N/A'} sec`,
      })
    }

    // ✅ Отправляем клавиатуру с кнопками продолжения
    try {
      await botInstance.telegram.sendMessage(
        chatId,
        getVideoCompletionMessage(isRu),
        createVideoCompletionKeyboard(isRu)
      )
      logger.info('✅ [SEND VIDEO DIRECTLY] Completion keyboard sent', {
        telegramId,
        chatId,
      })
    } catch (keyboardError) {
      logger.warn(
        '⚠️ [SEND VIDEO DIRECTLY] Failed to send completion keyboard',
        {
          telegramId,
          error:
            keyboardError instanceof Error
              ? keyboardError.message
              : String(keyboardError),
        }
      )
    }

    // ✅ Снимаем деньги после успешной отправки видео (direct mode)
    await chargeForDeliveredVideo({
      telegramId,
      modelId: metadata.modelId,
      jobId: metadata.jobId,
      where: 'SEND VIDEO DIRECTLY',
    })

    logger.info('✅ [SEND VIDEO DIRECTLY] Video sent successfully', {
      telegramId,
      chatId,
      jobId: metadata.jobId,
      modelId: metadata.modelId,
    })
  } catch (error) {
    logger.error('❌ [SEND VIDEO DIRECTLY] Error sending video', {
      telegramId,
      videoUrl: videoUrl.substring(0, 100),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Пытаемся отправить сообщение об ошибке пользователю
    try {
      const botInstance = defaultBotInstance || getBotInstance()
      if (botInstance) {
        const chatId = parseInt(telegramId)
        // ✅ ИСПРАВЛЕНО: Валидация chatId
        if (!isNaN(chatId) && chatId > 0) {
          await botInstance.telegram.sendMessage(
            chatId,
            `❌ Ошибка при отправке видео.\n\nJob ID: ${metadata.jobId || 'N/A'}\nПопробуйте снова или обратитесь в поддержку.`
          )
        } else {
          logger.warn(
            '⚠️ [SEND VIDEO DIRECTLY] Invalid telegramId in error handler',
            { telegramId, chatId }
          )
        }
      }
    } catch (notifyError) {
      // A SECOND PAGE FOR AN INCIDENT ALREADY PAGED. This catch is nested in
      // the outer one, whose first statement above is an unconditional
      // logger.error for this same invocation, so nothing reaches here without
      // the owner already having been woken; and the error is rethrown below,
      // where the callers page a third time. The commonest cause is the
      // customer having blocked the bot (helpers/telegramErrors.ts), which no
      // operator can undo. Warn keeps the record without the duplicate push.
      logger.warn(
        '❌ [SEND VIDEO DIRECTLY] Failed to notify user about error',
        {
          telegramId,
          notifyError:
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError),
        }
      )
    }

    throw error
  }
}

// ❌ DELETED: Old simplified detectVideoWebhookProvider() function removed
// Now using detailed detectVideoProvider() which properly distinguishes between:
// - 'kie-sora' (Sora 2)
// - 'kie-wan' (Veo 3 / WAN 2.5)
// - 'kie-veed' (Veed Fabric)
// - 'render-server', 'replicate', 'unknown'

// ✅ NEW: Callback с telegramId в URL - /api/video-callback/:telegramId
// Два роута: с и без telegramId
router.post('/video-callback/:telegramId', async (req: any, res: any) => {
  const startTime = Date.now()

  try {
    console.log(
      '🔴🔴🔴 [VIDEO CALLBACK WITH TELEGRAM ID] Route handler called!'
    )

    // ✅ Быстро отвечаем 202 Accepted согласно best practices
    res.status(202).json({
      message: 'Video webhook received and will be processed asynchronously',
      timestamp: new Date().toISOString(),
    })

    const telegramIdFromUrl = req.params.telegramId
    // Метка, которую мы сами положили в адрес обратного вызова.
    const callbackToken = req.query.cb
    const payload = req.body

    // ✅ FIX: Игнорируем тестовые запросы от startup health check
    if (payload?.test === true && payload?.source === 'startup-health-check') {
      logger.info(
        '🏥 [UNIVERSAL VIDEO WEBHOOK] Health check ping received - OK'
      )
      return
    }

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
      responseTime: Date.now() - startTime,
    })

    // ✅ FIX: Use detailed detectVideoProvider instead of simplified detectVideoWebhookProvider
    // This properly distinguishes between kie-sora, kie-wan (Veo 3), and kie-veed
    const detectedProvider = detectVideoProvider(payload)
    logger.info('🔍 [UNIVERSAL VIDEO WEBHOOK] Provider detected', {
      provider: detectedProvider,
      payloadKeys: Object.keys(payload),
    })

    // The callback token is verified HERE, before the switch, so no provider
    // branch can route around it. It used to be checked in exactly one place —
    // inside processGenericVideoWebhook — while the kie-sora / kie-wan / kie-veed
    // branches called processSoraWebhookAsync / processKieAiWebhookAsync with the
    // url's telegramId and no token. A forged callback with a made-up taskId
    // misses videoTaskStore and falls into those handlers' direct-send branch,
    // delivering an attacker-chosen video (or, on the fail path, an
    // attacker-chosen error message) from the bot to any telegram_id.
    //
    // Legit provider callbacks DO carry the signature: getAvailableCallbackUrl
    // (utils/webhookHealthCheck.ts) and render-server-client both sign the url
    // with buildCallbackToken. verifyCallbackToken is fail-closed and timing-safe.
    //
    // When the token does not verify we withhold the url's telegramId from the
    // direct-send-capable branches: a task genuinely matched in videoTaskStore
    // still delivers (that path uses the STORED recipient, not this param), but a
    // caller can no longer direct-send to a recipient it named itself.
    const signatureOk = telegramIdFromUrl
      ? verifyCallbackToken(telegramIdFromUrl, callbackToken)
      : false
    const trustedTelegramId = signatureOk ? telegramIdFromUrl : undefined

    // Route to appropriate handler based on detected provider
    switch (detectedProvider) {
      case 'kie-sora':
        logger.info('🎬 [UNIVERSAL VIDEO WEBHOOK] Kie.ai Sora webhook detected')
        await processSoraWebhookAsync(
          normalizeKieSoraPayload(payload),
          trustedTelegramId
        )
        break

      case 'kie-wan':
      case 'kie-veed':
        logger.info(
          '🎬 [UNIVERSAL VIDEO WEBHOOK] Kie.ai WAN/Veo webhook detected',
          {
            provider: detectedProvider,
          }
        )
        await processKieAiWebhookAsync(
          normalizeKiePayload(payload),
          trustedTelegramId
        )
        break

      case 'render-server':
        logger.info(
          '🎬 [UNIVERSAL VIDEO WEBHOOK] Render Server webhook detected'
        )
        await processGenericVideoWebhook(
          payload,
          telegramIdFromUrl,
          callbackToken
        )
        break

      case 'replicate':
        logger.info('🔄 [UNIVERSAL VIDEO WEBHOOK] Replicate webhook detected')
        // TODO: Implement replicate handler if needed
        await processGenericVideoWebhook(
          payload,
          telegramIdFromUrl,
          callbackToken
        )
        break

      case 'unknown':
      default:
        logger.warn(
          '⚠️ [UNIVERSAL VIDEO WEBHOOK] Unknown provider, processing as generic',
          {
            payload,
          }
        )
        await processGenericVideoWebhook(
          payload,
          telegramIdFromUrl,
          callbackToken
        )
        break
    }
  } catch (error) {
    logger.error('❌ [UNIVERSAL VIDEO WEBHOOK] Error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
      timestamp: new Date().toISOString(),
    })

    const telegramIdFromUrl = req.params.telegramId
    const botNameFromQuery = req.query.bot_name
    // Метка, которую мы сами положили в адрес обратного вызова.
    const callbackToken = req.query.cb

    // ✅ FIX: Игнорируем тестовые запросы от startup health check (не логируем как ошибку)
    const payload = req.body
    if (payload?.test === true && payload?.source === 'startup-health-check') {
      logger.info(
        '🏥 [UNIVERSAL VIDEO WEBHOOK] Health check ping received - OK'
      )
      return // Не обрабатываем дальше, просто возвращаем 202
    }

    logger.info('🎬 [UNIVERSAL VIDEO WEBHOOK] Received callback', {
      body: req.body,
      telegramIdFromUrl,
      botNameFromQuery,
      queryParams: req.query,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
      },
      responseTime: Date.now() - startTime,
    })

    // ✅ Автоопределение провайдера по структуре payload
    const provider = detectVideoProvider(payload as KieAiWebhookPayload)

    logger.info('🔍 [UNIVERSAL VIDEO WEBHOOK] Provider detected', { provider })

    // Маршрутизируем на соответствующий обработчик
    switch (provider) {
      case 'kie-sora':
        await processSoraWebhookAsync(
          normalizeKieSoraPayload(payload),
          telegramIdFromUrl,
          botNameFromQuery
        )
        break
      case 'kie-wan':
      case 'kie-veed':
        await processKieAiWebhookAsync(
          normalizeKiePayload(payload),
          telegramIdFromUrl,
          botNameFromQuery
        )
        break
      case 'replicate':
        logger.info(
          '🔄 [UNIVERSAL VIDEO WEBHOOK] Replicate webhook - forwarding to replicate handler'
        )
        // TODO: Implement replicate handler
        break
      case 'render-server':
        logger.info(
          '🎬 [UNIVERSAL VIDEO WEBHOOK] Render Server webhook detected'
        )
        await processGenericVideoWebhook(
          payload,
          telegramIdFromUrl,
          callbackToken
        )
        break
      default:
        logger.warn(
          '⚠️ [UNIVERSAL VIDEO WEBHOOK] Unknown provider, attempting generic processing',
          { payload }
        )
        await processGenericVideoWebhook(
          payload,
          telegramIdFromUrl,
          callbackToken
        )
        break
    }
  } catch (error) {
    logger.error('❌ [UNIVERSAL VIDEO WEBHOOK] Error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
      processingTime: Date.now() - startTime,
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
  if (
    payload.job_id ||
    payload.renderTaskId ||
    (payload.videoUrl && payload.status === 'completed')
  ) {
    return 'render-server'
  }

  return 'unknown'
}

/**
 * Нормализация payload от Kie.ai Sora
 */
function normalizeKieSoraPayload(payload: any): KieAiWebhookPayload {
  const taskId = payload.taskId || payload.data?.taskId

  // ✅ Парсим resultJson СНАЧАЛА, чтобы проверить наличие resultUrls
  let resultUrls: string[] | undefined
  let resultWaterMarkUrls: string[] | undefined
  try {
    if (payload.data?.resultJson) {
      const resultJson = JSON.parse(payload.data.resultJson)
      resultUrls = resultJson.resultUrls
      resultWaterMarkUrls = resultJson.resultWaterMarkUrls

      logger.info('🔍 [SORA NORMALIZE] Parsed resultJson', {
        taskId,
        hasResultUrls: !!resultUrls,
        resultUrlsCount: resultUrls?.length || 0,
        hasResultWaterMarkUrls: !!resultWaterMarkUrls,
        waterMarkUrlsCount: resultWaterMarkUrls?.length || 0,
        cleanUrl: resultUrls?.[0]?.substring(0, 80) + '...',
        watermarkUrl: resultWaterMarkUrls?.[0]?.substring(0, 80) + '...',
      })
    }
  } catch (e) {
    logger.warn('[UNIVERSAL VIDEO WEBHOOK] Failed to parse Sora resultJson', {
      error: e,
    })
  }

  // ✅ FIX: Проверяем успешность по code===200 и наличию resultUrls (включая распарсенные)
  // Veo 3 отправляет: { code: 200, data: { info: { resultUrls: [...] } } } - БЕЗ state!
  // WAN 2.5, Sora отправляют: { code: 200, data: { state: "success", resultJson: "{...}" } }
  // Поэтому проверяем ЛИБО state === 'success', ЛИБО просто наличие resultUrls при code === 200
  const hasResultUrls = !!(
    resultUrls ||
    payload.data?.resultUrls ||
    payload.data?.info?.resultUrls
  )
  const successFlag =
    payload.successFlag !== undefined
      ? payload.successFlag
      : payload.code === 200 &&
          (payload.data?.state === 'success' || hasResultUrls)
        ? 1
        : 2

  return {
    ...payload,
    taskId,
    successFlag,
    resultUrls:
      resultUrls ||
      payload.resultUrls ||
      payload.data?.info?.resultUrls ||
      payload.data?.resultUrls,
    videoUrl:
      resultUrls?.[0] ||
      payload.videoUrl ||
      payload.resultUrls?.[0] ||
      payload.data?.info?.resultUrls?.[0] ||
      payload.data?.resultUrls?.[0],
    resultWaterMarkUrls: resultWaterMarkUrls,
  }
}

/**
 * Нормализация payload от Kie.ai WAN/Veed
 */
function normalizeKiePayload(payload: any): KieAiWebhookPayload {
  const taskId = payload.taskId || payload.data?.taskId
  const successFlag =
    payload.successFlag !== undefined
      ? payload.successFlag
      : payload.code === 200
        ? 1
        : 2

  let parsedResultUrls: string[] | undefined
  try {
    if (payload.data?.resultJson) {
      const resultJson = JSON.parse(payload.data.resultJson)
      parsedResultUrls = resultJson.resultUrls
    }
  } catch (e) {
    logger.warn('[UNIVERSAL VIDEO WEBHOOK] Failed to parse WAN resultJson', {
      error: e,
    })
  }

  return {
    ...payload,
    taskId,
    successFlag,
    resultUrls:
      payload.resultUrls ||
      parsedResultUrls ||
      payload.data?.info?.resultUrls ||
      payload.data?.resultUrls,
    videoUrl:
      payload.videoUrl ||
      parsedResultUrls?.[0] ||
      payload.data?.info?.resultUrls?.[0],
    errorMessage: payload.errorMessage || payload.data?.errorMessage,
  }
}

/**
 * Обработка webhook от неизвестного провайдера
 */
async function processGenericVideoWebhook(
  payload: any,
  telegramIdFromUrl?: string,
  // Метка из адреса обратного вызова. Без неё прямая отправка не выполняется —
  // см. пояснение ниже и utils/callbackToken.ts.
  callbackToken?: unknown
): Promise<void> {
  // ✅ FIX: Игнорируем тестовые health check запросы (не логируем как ошибку)
  if (payload?.test === true) {
    logger.info('🏥 [GENERIC VIDEO WEBHOOK] Health check ping received - OK', {
      source: payload.source || 'startup-health-check',
    })
    return
  }

  logger.info('🔄 [GENERIC VIDEO WEBHOOK] Processing render server webhook', {
    payload,
    telegramIdFromUrl,
    keys: Object.keys(payload),
  })

  // Пытаемся извлечь базовую информацию из всех возможных мест
  const taskId =
    payload.job_id ||
    payload.taskId ||
    payload.id ||
    payload.renderTaskId ||
    payload.data?.taskId ||
    payload.data?.id

  // ✅ КРИТИЧЕСКИ ВАЖНО: Проверяем ВСЕ возможные поля для videoUrl
  // Render Server отправляет download_url!
  const videoUrl =
    payload.download_url ||
    payload.videoUrl ||
    payload.video_url ||
    payload.resultUrl ||
    payload.result_url ||
    payload.url ||
    payload.output ||
    payload.data?.videoUrl ||
    payload.data?.video_url ||
    payload.data?.output

  // Render Server считается успешным, если есть download_url
  const success =
    payload.success !== undefined
      ? payload.success
      : payload.download_url
        ? true
        : payload.status === 'completed' ||
          payload.status === 'success' ||
          payload.state === 'success'

  logger.info('📊 [GENERIC VIDEO WEBHOOK] Extracted data', {
    taskId,
    telegramIdFromUrl,
    videoUrl: videoUrl?.substring(0, 100),
    success,
    hasVideoUrl: !!videoUrl,
  })

  // ПРЯМАЯ ОТПРАВКА — ТОЛЬКО ПО НАШЕЙ МЕТКЕ.
  //
  // Эта ветка берёт получателя из адреса, ссылку на видео из тела и шлёт
  // человеку, не сверяясь ни с какой задачей. Без проверки посторонний мог
  // заставить бота прислать любому пользователю что угодно — от имени бота,
  // которому тот доверяет.
  //
  // Подписи от поставщика нет, но адрес составляем мы сами, поэтому кладём в
  // него метку (utils/callbackToken.ts) и проверяем здесь. Метка привязана к
  // номеру получателя: подсмотрев чужую, не отправишь другому.
  //
  // Без метки прямая отправка НЕ выполняется — запрос уходит в запасной путь
  // ниже, который сверяется с реальной задачей.
  const tokenOk = telegramIdFromUrl
    ? verifyCallbackToken(telegramIdFromUrl, callbackToken)
    : false

  if (telegramIdFromUrl && videoUrl && success && !tokenOk) {
    logger.warn(
      '⛔ [VIDEO WEBHOOK] Прямая отправка отклонена: метка не совпала',
      {
        telegramId: telegramIdFromUrl,
        hasToken: Boolean(callbackToken),
      }
    )
  }

  // ✅ НОВАЯ ЛОГИКА: Если есть telegramId в URL и videoUrl - отправляем напрямую!
  if (telegramIdFromUrl && videoUrl && success && tokenOk) {
    logger.info(
      '🚀 [GENERIC VIDEO WEBHOOK] Direct send mode - telegramId from URL',
      {
        telegramId: telegramIdFromUrl,
        videoUrl: videoUrl.substring(0, 100),
      }
    )

    await sendVideoDirectly(telegramIdFromUrl, videoUrl, {
      jobId: taskId,
      duration: payload.duration || 10,
    })
    return
  }

  // Fallback: старая логика через videoTaskStore
  if (!taskId) {
    // THE SIGNATURE DECIDES WHETHER THIS IS AN INCIDENT. This route is public
    // (api_server/index.ts mounts it with no auth), so a body with nothing that
    // looks like a task id is most often a scanner — rejected traffic, and
    // logger.error is a push notification to the owner (utils/logger.ts).
    // `tokenOk` above is true only for a callback whose address WE signed; a
    // request we asked for that carries no task id IS our machinery failing
    // (the job can no longer be reconciled), so that one keeps paging.
    logger[tokenOk ? 'error' : 'warn'](
      '❌ [GENERIC VIDEO WEBHOOK] No task ID found in payload',
      {
        payloadKeys: Object.keys(payload),
      }
    )
    return
  }

  if (!videoUrl && success) {
    // payloadKeys above is the diagnosis; the body itself is untrusted text and
    // `payload` is not a content key in utils/logger.ts, so it used to be
    // rendered verbatim into the owner's Telegram group.
    logger.error('❌ [GENERIC VIDEO WEBHOOK] Success but no video URL found', {
      taskId,
      payloadKeys: Object.keys(payload),
    })
  }

  // Обрабатываем как стандартный Kie.ai webhook
  const normalizedPayload: KieAiWebhookPayload = {
    taskId,
    successFlag: success ? 1 : 2,
    videoUrl,
    resultUrls: videoUrl ? [videoUrl] : undefined,
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
      timestamp: new Date().toISOString(),
    })

    logger.info('🎬 [SORA WEBHOOK] Received callback', {
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
      },
      responseTime: Date.now() - startTime,
    })

    const payload: KieAiWebhookPayload = req.body

    // ✅ ИСПРАВЛЕНИЕ: Kie.ai отправляет taskId в data.taskId
    const taskId = payload.taskId || (payload.data as any)?.taskId
    const successFlag =
      payload.successFlag !== undefined
        ? payload.successFlag
        : (payload.data as any)?.state === 'success'
          ? 1
          : 2

    // ✅ Валидация обязательных полей
    if (!taskId) {
      // Keys, not the body: this endpoint is public and `payload` is not a
      // content key in utils/logger.ts, so a small malformed body was rendered
      // verbatim into the owner's Telegram group.
      //
      // The LEVEL stays at error, unlike the sibling checks in the AI Reels
      // callback: a Kie.ai callback carries no signature of ours, so nothing
      // here can tell a scanner from a real provider callback whose payload
      // shape changed — and the second one means tasks stop being reconciled
      // with no other alarm, the periodic stuck-task monitor having been
      // switched off (inngest_app/functions/kieAiWebhookMonitor.ts).
      logger.error('❌ [SORA WEBHOOK] Missing taskId', {
        payloadKeys: Object.keys(payload || {}),
        hasData: !!payload.data,
        dataKeys: payload.data ? Object.keys(payload.data) : [],
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
      resultUrls:
        payload.resultUrls || resultUrls || (payload.data as any)?.resultUrls,
      videoUrl:
        payload.videoUrl ||
        resultUrls?.[0] ||
        (payload.data as any)?.resultUrls?.[0],
    }

    // ✅ Асинхронная обработка Sora видео в фоне с нормализованным payload
    processSoraWebhookAsync(normalizedPayload).catch(error => {
      logger.error('❌ [SORA WEBHOOK] Error in async processing', {
        taskId: normalizedPayload.taskId,
        error: error.message,
        stack: error.stack,
      })
    })
  } catch (error) {
    logger.error('❌ [SORA WEBHOOK] Error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
      processingTime: Date.now() - startTime,
    })
  }
})

/**
 * Асинхронная обработка Sora webhook
 */
async function processSoraWebhookAsync(
  payload: KieAiWebhookPayload,
  telegramId?: string,
  botName?: string
): Promise<void> {
  const { taskId, successFlag } = payload

  logger.info('🎬 [SORA WEBHOOK] Processing Sora callback', {
    taskId,
    successFlag,
    hasResultUrls: !!(payload.resultUrls || payload.response?.resultUrls),
    hasVideoUrl: !!payload.videoUrl,
    hasErrorMessage: !!payload.errorMessage,
    telegramId,
  })

  try {
    switch (successFlag) {
      case 1: // ✅ Completed successfully
        await handleSoraSuccess(payload, telegramId)
        break

      case 2: // ❌ Generation failed
        await handleSoraFailure(payload, telegramId)
        break

      case 3: // ❌ Content policy violation
        await handleSoraContentPolicy(payload, telegramId)
        break

      case 0: // ⏳ Still processing
        logger.info('⏳ [SORA WEBHOOK] Task still processing', { taskId })
        break

      default:
        // Skip warning for deployment test webhooks
        if (!taskId.startsWith('test-deployment-')) {
          logger.warn('⚠️ [SORA WEBHOOK] Unknown successFlag value', {
            taskId,
            successFlag,
          })
        }
        break
    }
  } catch (error) {
    logger.error('❌ [SORA WEBHOOK] Error in async processing', {
      taskId,
      successFlag,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Обработка успешной генерации Sora видео
 */
async function handleSoraSuccess(
  payload: KieAiWebhookPayload,
  telegramId?: string
): Promise<void> {
  const { taskId } = payload

  // ✅ ИСПРАВЛЕНИЕ: Проверяем отдельно URL с водяным знаком и без
  const videoUrl =
    payload.videoUrl ||
    payload.resultUrls?.[0] ||
    payload.resultUrl ||
    payload.result_url ||
    payload.response?.resultUrls?.[0] ||
    payload.response?.result_url

  const watermarkUrl = payload.resultWaterMarkUrls?.[0]

  if (!videoUrl) {
    // Keys, not the body — `payload` is not a content key in utils/logger.ts.
    logger.error('❌ [SORA WEBHOOK] Success but no video URL', {
      taskId,
      payloadKeys: Object.keys(payload || {}),
    })
    return
  }

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ: Проверяем какой URL отправляем
  logger.info('✅ [SORA WEBHOOK] Sora video generation successful', {
    taskId,
    cleanVideoUrl: videoUrl.substring(0, 100) + '...',
    watermarkVideoUrl: watermarkUrl
      ? watermarkUrl.substring(0, 100) + '...'
      : 'NONE',
    hasWatermarkUrl: !!watermarkUrl,
    duration: 10, // Sora всегда 10 секунд
    telegramId,
    isSendingWatermark: videoUrl === watermarkUrl,
    urlMatch: videoUrl === watermarkUrl ? 'SAME URLs!' : 'Different URLs',
  })

  // Получаем контекст задачи
  const taskContext = videoTaskStore.getTask(taskId)
  if (taskContext) {
    // ✅ Task found - normal mode (update original message)

    // ✅ MULTI-BOT FIX: Получаем правильный bot instance для этой задачи
    const botInstance = getBotInstance(taskContext.botName)
    if (!botInstance) {
      logger.error('❌ [SORA WEBHOOK] Bot instance not found', {
        taskId,
        requestedBot: taskContext.botName,
        availableBots: Array.from(botInstances.keys()),
      })
      return
    }

    logger.info('✅ [SORA WEBHOOK] Using bot instance', {
      taskId,
      botName: taskContext.botName || 'default',
    })

    // Idempotency: claim the delivery before any await so a duplicate/concurrent
    // webhook for this job skips the re-send (video + status keyboard). Keys on
    // the immutable taskId — the same key as the chargedVideoJobs charge guard.
    if (!claimVideoJobDelivery(taskId)) return

    try {
      // Обновляем сообщение о статусе
      // Isolated try: the progress message may be stale/deleted (>48h old or the
      // user removed it while Sora ran) -> a Telegram 400 here must NOT abort the
      // paid video delivery below. The delivery claim is already spent (line
      // above), so a thrown status edit would lose the finished Sora video for
      // good -- Kie models skip polling, so this webhook is the only delivery
      // path. Mirrors the guarded status edit in handleVideoReady (#1528).
      try {
        await botInstance.telegram.editMessageText(
          taskContext.chatId,
          taskContext.messageId,
          undefined,
          '✅ Видео успешно сгенерировано! Отправляю...'
        )
      } catch (editErr) {
        logger.warn(
          '[KIE WEBHOOK] status edit failed (stale message); continuing to delivery',
          {
            taskId,
            error: editErr instanceof Error ? editErr.message : String(editErr),
          }
        )
      }

      // Получаем информацию о модели
      const modelInfo = VIDEO_MODELS[taskContext.modelId as VideoModelId]
      const modelName = modelInfo?.nameRu || 'Sora 2'

      // Отправляем видео с простым текстом (без Markdown чтобы избежать ошибок парсинга)
      const isRu = (await getUserLanguageFromDB(taskContext.chatId)) !== 'en'
      await botInstance.telegram.sendVideo(
        taskContext.chatId,
        Input.fromURL(videoUrl),
        {
          caption: isRu
            ? `🤖 Модель: ${modelName}\n⏱️ Длительность: ${taskContext.duration} сек\n⚡ Сгенерировано через AI`
            : `🤖 Model: ${modelName}\n⏱️ Duration: ${taskContext.duration} sec\n⚡ Generated with AI`,
        }
      )

      // ✅ Отправляем клавиатуру для продолжения работы
      await botInstance.telegram.sendMessage(
        taskContext.chatId,
        getVideoCompletionMessage(isRu),
        createVideoCompletionKeyboard(isRu)
      )

      // Удаляем сообщение о процессе генерации
      try {
        await botInstance.telegram.deleteMessage(
          taskContext.chatId,
          taskContext.messageId
        )
      } catch (e) {
        // Игнорируем ошибку, если сообщение уже удалено
        logger.warn('[SORA WEBHOOK] Could not delete processing message', {
          error: e,
        })
      }

      logger.info('✅ [SORA WEBHOOK] Video sent to user', {
        taskId,
        telegramId: taskContext.telegramId,
      })

      // Charge for the delivered video. This branch never charged: for Kie
      // models the bot skips polling (handleTextToVideoDirect.ts:216), so
      // handleVideoReady -- the only other charge site -- never runs, and the
      // user got the video announced with a price for free.
      await chargeForDeliveredVideo({
        telegramId: String(taskContext.telegramId),
        modelId: taskContext.modelId,
        jobId: taskId,
        where: 'SORA WEBHOOK',
      })

      // Удаляем задачу из хранилища
      videoTaskStore.deleteTask(taskId)
    } catch (error) {
      logger.error('❌ [SORA WEBHOOK] Error sending video to user', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
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
        logger.error('[SORA WEBHOOK] Could not send error message', {
          error: e,
        })
      }
    }
  } else if (telegramId) {
    // ✅ Task NOT found (direct mode) - send video directly
    logger.info('📤 [SORA WEBHOOK] Sending video directly to user', {
      telegramId,
      taskId,
      videoUrl: videoUrl.substring(0, 100) + '...',
    })

    try {
      await sendVideoDirectly(telegramId, videoUrl, {
        jobId: taskId,
        duration: 10,
        // No modelId: without task context we do not know which model the user
        // actually picked ('sora-2' and 'sora-2-pro' cost differently), and
        // guessing would charge the wrong price. The literal that used to sit
        // here ('sora-2-image-to-video') is not a price key at all, so it
        // charged NOTHING while looking deliberate. chargeForDeliveredVideo now
        // logs this as "delivered but not charged" instead of skipping quietly.
      })
      logger.info('✅ [SORA WEBHOOK] Direct video send successful', {
        telegramId,
        taskId,
      })
    } catch (error) {
      logger.error('❌ [SORA WEBHOOK] Error sending video directly', {
        telegramId,
        taskId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return
  } else {
    logger.error('❌ [SORA WEBHOOK] Task context not found and no telegramId', {
      taskId,
    })
    return
  }
}

/**
 * Обработка ошибки генерации Sora
 */
async function handleSoraFailure(
  payload: KieAiWebhookPayload,
  telegramId?: string
): Promise<void> {
  const { taskId, errorMessage, errorCode } = payload

  // ✅ FIXED: Extract error from data.failMsg (for Sora)
  const actualErrorMessage =
    errorMessage || (payload.data as any)?.failMsg || 'Неизвестная ошибка'
  const translatedError = translateErrorToRussian(actualErrorMessage)

  logger.error('❌ [SORA WEBHOOK] Sora generation failed', {
    taskId,
    errorMessage: actualErrorMessage,
    translatedError,
    errorCode,
    telegramId,
  })

  const taskContext = videoTaskStore.getTask(taskId)
  if (taskContext) {
    // ✅ Task found in videoTaskStore - edit the original message
    const botInstance = getBotInstance(taskContext.botName)
    if (!botInstance) {
      logger.error(
        '❌ [SORA WEBHOOK] Bot instance not found for failure handler',
        {
          taskId,
          requestedBot: taskContext.botName,
        }
      )
      return
    }

    try {
      await botInstance.telegram.editMessageText(
        taskContext.chatId,
        taskContext.messageId,
        undefined,
        `❌ Ошибка генерации: ${translatedError}`
      )
      videoTaskStore.deleteTask(taskId)
    } catch (error) {
      logger.error('[SORA WEBHOOK] Error sending failure notification', {
        error,
      })
    }
  } else if (telegramId) {
    // ✅ Task NOT found (direct mode) - send error message directly
    const botInstance = defaultBotInstance || getBotInstance()
    if (!botInstance) {
      logger.error(
        '❌ [SORA WEBHOOK] No bot instance available for direct failure notification',
        {
          telegramId,
          taskId,
        }
      )
      return
    }

    try {
      const chatId = parseInt(telegramId)
      // ✅ ИСПРАВЛЕНО: Валидация chatId
      if (isNaN(chatId) || chatId <= 0) {
        logger.warn('⚠️ [SORA WEBHOOK] Invalid telegramId', {
          telegramId,
          chatId,
        })
        return
      }

      // Idempotent: an at-least-once retry must not re-send this error. #1352
      // Idempotent: an at-least-once retry must not re-send this error. #1352
      if (taskId && !claimVideoFailureNotify(taskId)) return
      await botInstance.telegram.sendMessage(
        chatId,
        `❌ Ошибка генерации видео.\n\nПричина: ${translatedError}\n\nПопробуйте другой запрос или обратитесь в поддержку.`
      )
      logger.info('✅ [SORA WEBHOOK] Direct failure notification sent', {
        telegramId,
        taskId,
        errorMessage: actualErrorMessage,
        translatedError,
      })
    } catch (error) {
      logger.error(
        '❌ [SORA WEBHOOK] Error sending direct failure notification',
        {
          telegramId,
          taskId,
          error,
        }
      )
    }
  } else {
    logger.warn(
      '⚠️ [SORA WEBHOOK] No task context and no telegramId for failure notification',
      { taskId }
    )
  }
}

/**
 * Обработка ошибки политики контента Sora
 */
async function handleSoraContentPolicy(
  payload: KieAiWebhookPayload,
  telegramId?: string
): Promise<void> {
  const { taskId, errorMessage, errorCode } = payload

  // ✅ FIXED: Extract error from data.failMsg (for Sora)
  const actualErrorMessage =
    errorMessage || (payload.data as any)?.failMsg || 'Некорректный контент'
  const translatedError = translateErrorToRussian(actualErrorMessage)

  // THE CUSTOMER'S OWN UPLOAD WAS REFUSED — NOT AN INCIDENT.
  //
  // The recurring texts are in ERROR_TRANSLATIONS at the top of this file:
  // "This image contains photorealistic people.", "Image contains faces." —
  // people sending selfies to an image-to-video model. Everything this handler
  // does is translate the refusal and pass it on (editMessageText below, or the
  // direct sendMessage), so at 3am there is nothing to do but read a stranger's
  // rejected upload. logger.error is a push notification to the owner
  // (utils/logger.ts binds the Telegram transport at level 'error'); warn keeps
  // the record without the page. The neighbouring failure handler stays at
  // error — flag 2 mixes refusals with genuine provider outages.
  logger[isProviderAccountError(actualErrorMessage) ? 'error' : 'warn'](
    '🚫 [SORA WEBHOOK] Sora content policy violation',
    {
      taskId,
      errorMessage: actualErrorMessage,
      translatedError,
      errorCode,
      telegramId,
    }
  )

  const taskContext = videoTaskStore.getTask(taskId)
  if (taskContext) {
    // ✅ Task found in videoTaskStore - edit the original message
    const botInstance = getBotInstance(taskContext.botName)
    if (!botInstance) {
      logger.error(
        '❌ [SORA WEBHOOK] Bot instance not found for content policy handler',
        {
          taskId,
          requestedBot: taskContext.botName,
        }
      )
      return
    }

    try {
      await botInstance.telegram.editMessageText(
        taskContext.chatId,
        taskContext.messageId,
        undefined,
        `🚫 Контент отклонен политикой безопасности. Попробуйте другой запрос.\n\n${translatedError}`
      )
      videoTaskStore.deleteTask(taskId)
    } catch (error) {
      logger.error('[SORA WEBHOOK] Error sending content policy notification', {
        error,
      })
    }
  } else if (telegramId) {
    // ✅ Task NOT found (direct mode) - send error message directly
    const botInstance = defaultBotInstance || getBotInstance()
    if (!botInstance) {
      logger.error(
        '❌ [SORA WEBHOOK] No bot instance available for direct content policy notification',
        {
          telegramId,
          taskId,
        }
      )
      return
    }

    try {
      const chatId = parseInt(telegramId)
      // ✅ ИСПРАВЛЕНО: Валидация chatId
      if (isNaN(chatId) || chatId <= 0) {
        logger.warn(
          '⚠️ [SORA WEBHOOK] Invalid telegramId in content policy error',
          { telegramId, chatId }
        )
        return
      }

      // Idempotent: an at-least-once retry must not re-send this error. #1352
      if (taskId && !claimVideoFailureNotify(taskId)) return
      await botInstance.telegram.sendMessage(
        chatId,
        `🚫 Контент отклонен политикой безопасности.\n\nПричина: ${translatedError}\n\nПопробуйте другой запрос.`,
        {
          link_preview_options: { is_disabled: true },
        }
      )
      logger.info('✅ [SORA WEBHOOK] Direct content policy notification sent', {
        telegramId,
        taskId,
        errorMessage: actualErrorMessage,
        translatedError,
      })
    } catch (error) {
      logger.error(
        '❌ [SORA WEBHOOK] Error sending direct content policy notification',
        {
          telegramId,
          taskId,
          error,
        }
      )
    }
  } else {
    logger.warn(
      '⚠️ [SORA WEBHOOK] No task context and no telegramId for content policy notification',
      { taskId }
    )
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
      timestamp: new Date().toISOString(),
    })

    logger.info('🔔 [KIE.AI WEBHOOK] Received callback', {
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
      },
      responseTime: Date.now() - startTime,
    })

    const payload: KieAiWebhookPayload = req.body

    // ✅ ИСПРАВЛЕНИЕ: Kie.ai отправляет taskId в payload.data.taskId
    const taskId =
      payload.taskId ||
      (payload.data && payload.data.taskId) ||
      (payload as any).data?.taskId

    // ✅ Нормализация successFlag: поддерживаем числа (1,2,3,0) и булевы значения (true/false)
    let successFlag: number
    if (payload.successFlag !== undefined) {
      // Преобразуем булевы значения в числа
      if (typeof payload.successFlag === 'boolean') {
        successFlag = payload.successFlag ? 1 : 2
      } else if (typeof payload.successFlag === 'number') {
        successFlag = payload.successFlag
      } else {
        // Неизвестный тип - пытаемся определить по code
        successFlag = payload.code === 200 ? 1 : 2
      }
    } else {
      // Если successFlag не указан, определяем по code
      successFlag = payload.code === 200 ? 1 : 2
    }

    // ✅ Валидация обязательных полей
    if (!taskId) {
      // Keys, not the body: this endpoint is public (no auth on the mount, no
      // token check in this handler) and `payload` is not a content key in
      // utils/logger.ts, so an anonymous POST could put text of its own
      // choosing into the owner's Telegram group.
      //
      // The LEVEL stays at error for the same reason as the Sora twin above:
      // there is no signature to tell a scanner from a real Kie.ai callback
      // whose payload shape changed, and silencing both would leave a provider
      // format change with no alarm at all.
      logger.error('❌ [KIE.AI WEBHOOK] Missing taskId', {
        payloadKeys: Object.keys(payload || {}),
        hasData: !!payload.data,
        dataKeys: payload.data ? Object.keys(payload.data) : [],
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
          originalResultJson: (payload.data as any).resultJson.substring(
            0,
            100
          ),
        })
      }
    } catch (e) {
      logger.warn('⚠️ [KIE.AI WEBHOOK] Failed to parse resultJson', {
        taskId,
        error: e instanceof Error ? e.message : String(e),
      })
    }

    // ✅ Нормализуем payload для дальнейшей обработки
    const normalizedPayload: KieAiWebhookPayload = {
      ...payload,
      taskId,
      successFlag,
      resultUrls:
        payload.resultUrls ||
        parsedResultUrls ||
        (payload.data as any)?.info?.resultUrls ||
        (payload.data as any)?.resultUrls,
      videoUrl:
        payload.videoUrl ||
        parsedResultUrls?.[0] ||
        (payload.data as any)?.info?.resultUrls?.[0],
      errorMessage: payload.errorMessage || (payload.data as any)?.errorMessage,
    }

    // Unreachable today: successFlag is a `number` on every branch above and is
    // assigned into normalizedPayload after the spread, so this never fires.
    // Kept as a guard for whoever changes that; the body is logged by shape
    // only, since `payload` is not a content key in utils/logger.ts.
    if (typeof normalizedPayload.successFlag !== 'number') {
      logger.error('❌ [KIE.AI WEBHOOK] Missing or invalid successFlag', {
        taskId,
        payloadKeys: Object.keys(payload || {}),
        successFlagType: typeof normalizedPayload.successFlag,
      })
      return
    }

    // ✅ Асинхронная обработка в фоне с нормализованным payload
    processKieAiWebhookAsync(normalizedPayload).catch(error => {
      logger.error('❌ [KIE.AI WEBHOOK] Error in async processing', {
        taskId: normalizedPayload.taskId,
        error: error.message,
        stack: error.stack,
      })
    })
  } catch (error) {
    logger.error('❌ [KIE.AI WEBHOOK] Error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
      processingTime: Date.now() - startTime,
    })

    // Уже отправили 202, поэтому не отправляем ошибку в response
  }
})

/**
 * Асинхронная обработка webhook от Kie.ai
 */
async function processKieAiWebhookAsync(
  payload: KieAiWebhookPayload,
  telegramId?: string,
  botName?: string
): Promise<void> {
  const { taskId, successFlag } = payload

  logger.info('🔄 [KIE.AI WEBHOOK] Processing callback', {
    taskId,
    successFlag,
    hasResultUrls: !!(payload.resultUrls || payload.response?.resultUrls),
    hasVideoUrl: !!payload.videoUrl,
    hasErrorMessage: !!payload.errorMessage,
    telegramId,
  })

  try {
    switch (successFlag) {
      case 1: // ✅ Completed successfully
        await handleSuccessfulGeneration(payload, telegramId)
        break

      case 2: // ❌ Generation failed
        await handleFailedGeneration(payload, telegramId)
        break

      case 3: // ❌ Content policy violation
        await handleContentPolicyError(payload, telegramId)
        break

      case 0: // ⏳ Still processing (обычно не отправляется webhook)
        logger.info('⏳ [KIE.AI WEBHOOK] Task still processing', { taskId })
        break

      default:
        // Skip warning for deployment test webhooks
        if (!taskId.startsWith('test-deployment-')) {
          logger.warn('⚠️ [KIE.AI WEBHOOK] Unknown successFlag value', {
            taskId,
            successFlag,
          })
        }
        break
    }
  } catch (error) {
    logger.error('❌ [KIE.AI WEBHOOK] Error in async processing', {
      taskId,
      successFlag,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Обработка успешной генерации
 */
async function handleSuccessfulGeneration(
  payload: KieAiWebhookPayload,
  telegramId?: string
): Promise<void> {
  const { taskId } = payload

  // Извлекаем URL видео из разных возможных полей
  const videoUrl =
    payload.videoUrl ||
    payload.resultUrls?.[0] ||
    payload.resultUrl ||
    payload.result_url ||
    payload.response?.resultUrls?.[0] ||
    payload.response?.result_url

  logger.info('✅ [KIE.AI WEBHOOK] Video generation successful', {
    taskId,
    hasVideoUrl: !!videoUrl,
    videoUrl: videoUrl?.substring(0, 100),
    duration: payload.duration || 'unknown',
    telegramId,
  })

  if (!videoUrl) {
    // payloadKeys is the diagnosis; the body itself is untrusted text and
    // `payload` is not a content key in utils/logger.ts, so it used to be
    // rendered verbatim into the owner's Telegram group.
    logger.error('❌ [KIE.AI WEBHOOK] Success callback but no video URL', {
      taskId,
      payloadKeys: Object.keys(payload),
    })

    // Обрабатываем как ошибку
    await notifyJobCompletion(taskId, {
      success: false,
      message: 'Video generation completed but no URL provided',
      code: 'NO_VIDEO_URL',
      provider: 'render-server',
      modelId: 'render-server',
    })
    return
  }

  const duration = payload.duration || payload.response?.duration || 10 // default

  // ✅ DIRECT MODE: Если есть telegramId и нет taskContext - отправляем напрямую
  if (telegramId) {
    const taskContext = videoTaskStore.getTask(taskId)
    if (!taskContext) {
      logger.info(
        '📤 [KIE.AI WEBHOOK] Sending video directly to user (direct mode)',
        {
          telegramId,
          taskId,
          videoUrl: videoUrl.substring(0, 100) + '...',
        }
      )

      try {
        await sendVideoDirectly(telegramId, videoUrl, {
          jobId: taskId,
          duration,
        })
        logger.info('✅ [KIE.AI WEBHOOK] Direct video send successful', {
          telegramId,
          taskId,
        })
        return
      } catch (error) {
        logger.error('❌ [KIE.AI WEBHOOK] Error sending video directly', {
          telegramId,
          taskId,
          error: error instanceof Error ? error.message : String(error),
        })
        // Continue to normal mode if direct mode fails
      }
    }
  }

  // Уведомляем об успешном завершении (нормальный режим)
  await notifyJobCompletion(taskId, {
    success: true,
    id: taskId,
    output: videoUrl,
    modelUsed: 'Render Server',
    duration,
    provider: 'render-server',
  })
}

/**
 * Обработка ошибки генерации
 */
async function handleFailedGeneration(
  payload: KieAiWebhookPayload,
  telegramId?: string
): Promise<void> {
  const { taskId, errorMessage, errorCode } = payload

  // ✅ FIX: Переводим ошибку на русский
  const translatedError = translateErrorToRussian(
    errorMessage || 'Неизвестная ошибка'
  )

  logger.error('❌ [KIE.AI WEBHOOK] Video generation failed', {
    taskId,
    errorMessage,
    translatedError,
    errorCode,
    telegramId,
  })

  await notifyJobCompletion(taskId, {
    success: false,
    message: translatedError,
    code: errorCode || 'GENERATION_FAILED',
    provider: 'kie',
    modelId: 'veed-fabric',
  })

  // ✅ FIX: Send error directly if task not found and telegramId provided (direct mode)
  const taskContext = videoTaskStore.getTask(taskId)
  if (!taskContext && telegramId) {
    const botInstance = defaultBotInstance || getBotInstance()
    if (botInstance) {
      try {
        const chatId = parseInt(telegramId)
        // ✅ ИСПРАВЛЕНО: Валидация chatId
        if (isNaN(chatId) || chatId <= 0) {
          logger.warn(
            '⚠️ [KIE.AI WEBHOOK] Invalid telegramId in error handler',
            { telegramId, chatId }
          )
          return
        }

        // Idempotent: an at-least-once retry must not re-send this error. #1352
        if (taskId && !claimVideoFailureNotify(taskId)) return
        await botInstance.telegram.sendMessage(
          chatId,
          `❌ Ошибка генерации видео.\n\nПричина: ${translatedError}\n\nПопробуйте другой запрос или обратитесь в поддержку.`
        )
        logger.info('✅ [KIE.AI WEBHOOK] Direct failure notification sent', {
          telegramId,
          taskId,
          errorMessage,
          translatedError,
        })
      } catch (error) {
        logger.error(
          '❌ [KIE.AI WEBHOOK] Error sending direct failure notification',
          {
            telegramId,
            taskId,
            error,
          }
        )
      }
    }
  }
}

/**
 * Обработка ошибки политики контента
 */
async function handleContentPolicyError(
  payload: KieAiWebhookPayload,
  telegramId?: string
): Promise<void> {
  const { taskId, errorMessage, errorCode } = payload

  // ✅ FIX: Переводим ошибку на русский
  const translatedError = translateErrorToRussian(
    errorMessage || 'Некорректный контент'
  )

  // THE CUSTOMER'S OWN UPLOAD WAS REFUSED — NOT AN INCIDENT.
  //
  // successFlag 3 is the provider telling us the input broke its rules (see the
  // flag table at the top of this file). Nothing here is ours to fix: the
  // handler translates the refusal and forwards it to the same customer. warn
  // keeps the record; error would push it to the owner's Telegram, because
  // utils/logger.ts binds the Telegram transport at level 'error'.
  //
  // The discriminator is the RAW errorMessage, never translatedError: the map
  // at the top of this file also translates 'Insufficient credits' and 'Rate
  // limit exceeded', which are OUR account with the provider. If one of those
  // ever arrives under flag 3 it still pages.
  logger[isProviderAccountError(errorMessage) ? 'error' : 'warn'](
    '🚫 [KIE.AI WEBHOOK] Content policy violation',
    {
      taskId,
      errorMessage,
      translatedError,
      errorCode,
      telegramId,
    }
  )

  await notifyJobCompletion(taskId, {
    success: false,
    message: translatedError,
    code: 'CONTENT_POLICY_VIOLATION',
    provider: 'kie',
    modelId: 'veed-fabric',
  })

  // ✅ FIX: Send error directly if task not found and telegramId provided (direct mode)
  const taskContext = videoTaskStore.getTask(taskId)
  if (!taskContext && telegramId) {
    const botInstance = defaultBotInstance || getBotInstance()
    if (botInstance) {
      try {
        const chatId = parseInt(telegramId)
        // ✅ ИСПРАВЛЕНО: Валидация chatId
        if (isNaN(chatId) || chatId <= 0) {
          logger.warn(
            '⚠️ [KIE.AI WEBHOOK] Invalid telegramId in content policy error',
            { telegramId, chatId }
          )
          return
        }

        // Idempotent: an at-least-once retry must not re-send this error. #1352
        if (taskId && !claimVideoFailureNotify(taskId)) return
        await botInstance.telegram.sendMessage(
          chatId,
          `🚫 Контент отклонен политикой безопасности.\n\nПричина: ${translatedError}\n\nПопробуйте другой запрос.`,
          {
            link_preview_options: { is_disabled: true },
          }
        )
        logger.info(
          '✅ [KIE.AI WEBHOOK] Direct content policy notification sent',
          {
            telegramId,
            taskId,
            errorMessage,
            translatedError,
          }
        )
      } catch (error) {
        logger.error(
          '❌ [KIE.AI WEBHOOK] Error sending direct content policy notification',
          {
            telegramId,
            taskId,
            error,
          }
        )
      }
    }
  }
}

/**
 * Уведомление AsyncLipSyncManager о завершении задачи
 */
async function notifyJobCompletion(taskId: string, result: any): Promise<void> {
  try {
    logger.info('🔔 [KIE.AI WEBHOOK] Notifying job completion', {
      taskId,
      success: result.success,
      hasOutput: !!(result.output || result.id),
      errorMessage: result.message,
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
          availableBots: Array.from(botInstances.keys()),
        })
        return
      }

      logger.info(
        '📤 [KIE.AI WEBHOOK] Found task context, sending video to user',
        {
          taskId,
          telegramId: taskContext.telegramId,
          chatId: taskContext.chatId,
          messageId: taskContext.messageId,
          hasVideoUrl: !!result.output,
          videoUrl: result.output?.substring(0, 80),
          botName: taskContext.botName || 'default',
          success: result.success,
        }
      )

      // Idempotency: claim the delivery before any await so a duplicate/concurrent
      // webhook skips the re-send AND the public Pulse repost (sendMediaToPulse).
      // Keys on the immutable taskId — the same key as the charge guard.
      if (!claimVideoJobDelivery(taskId)) return
      try {
        if (result.success && result.output) {
          logger.info('🎬 [KIE.AI WEBHOOK] Sending video URL to user', {
            taskId,
            chatId: taskContext.chatId,
            videoUrl: result.output.substring(0, 100),
          })

          // Успешная генерация - отправляем видео
          const isRu =
            (await getUserLanguageFromDB(taskContext.chatId)) !== 'en'
          await botInstance.telegram.sendVideo(
            taskContext.chatId,
            result.output,
            {
              caption: isRu
                ? `✅ Видео готово!\n\n🎬 Модель: ${taskContext.modelId}\n⏱ Длительность: ${result.duration || 'N/A'} сек`
                : `✅ Your video is ready!\n\n🎬 Model: ${taskContext.modelId}\n⏱ Duration: ${result.duration || 'N/A'} sec`,
            }
          )

          // Send to Pulse channel
          try {
            await sendMediaToPulse({
              mediaType: 'video',
              mediaSource: result.output,
              telegramId: String(taskContext.telegramId),
              prompt: taskContext.prompt || 'Video Generation',
              serviceType: `Video Generation (${taskContext.modelId})`,
              additionalInfo: {
                model: taskContext.modelId,
                duration: result.duration || 'N/A',
                botName: taskContext.botName || 'unknown_bot',
                generatedAt: new Date().toISOString(),
              },
            })
          } catch (pulseError) {
            logger.warn('Failed to send to Pulse channel', {
              error: pulseError,
              taskId,
              telegramId: taskContext.telegramId,
            })
            // Don't fail the whole process if Pulse fails
          }

          logger.info('✅ [KIE.AI WEBHOOK] Video sent to user successfully', {
            taskId,
          })

          // ✅ Отправляем клавиатуру для продолжения работы
          await botInstance.telegram.sendMessage(
            taskContext.chatId,
            getVideoCompletionMessage(isRu),
            createVideoCompletionKeyboard(isRu)
          )

          // Удаляем status message
          try {
            await botInstance.telegram.deleteMessage(
              taskContext.chatId,
              taskContext.messageId
            )
            logger.info('🗑️ [KIE.AI WEBHOOK] Status message deleted', {
              taskId,
            })
          } catch (deleteError) {
            logger.warn('⚠️ [KIE.AI WEBHOOK] Could not delete status message', {
              taskId,
              error:
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError),
            })
          }

          // Удаляем задачу из store после успешной отправки
          videoTaskStore.deleteTask(taskId)
        } else {
          // ✅ FIX: Переводим ошибку на русский
          const translatedError = translateErrorToRussian(
            result.message || 'Неизвестная ошибка'
          )

          // ONE REJECTION IS ONE RECORD, AND ONLY OURS IS A PAGE.
          //
          // This is a shared sink: every caller of notifyJobCompletion with
          // success:false lands here, so it must keep paging by default — a
          // provider outage or a failed charge arrives through this same line.
          // The single exception is the code handleContentPolicyError sets: it
          // has already logged that refusal above, and the throttle fingerprints
          // on the message text (utils/alertThrottle.ts), so the two titles can
          // never collapse. Without this discriminator one refused selfie woke
          // the owner twice.
          //
          // Note result.message is ALREADY translated by the caller, so it
          // cannot be classified here; the raw text is only in scope upstream,
          // which is why the account-level check lives there and not here.
          logger[result.code === 'CONTENT_POLICY_VIOLATION' ? 'warn' : 'error'](
            '❌ [KIE.AI WEBHOOK] Generation failed',
            {
              taskId,
              message: result.message,
              translatedError,
              code: result.code,
            }
          )

          // Ошибка генерации - отправляем сообщение об ошибке
          await botInstance.telegram.sendMessage(
            taskContext.chatId,
            `❌ Ошибка генерации видео: ${translatedError}`
          )

          logger.info('📢 [KIE.AI WEBHOOK] Error message sent to user', {
            taskId,
            translatedError,
          })
          videoTaskStore.deleteTask(taskId)
        }
      } catch (sendError) {
        logger.error('❌ [KIE.AI WEBHOOK] Error sending message to user', {
          taskId,
          error:
            sendError instanceof Error ? sendError.message : String(sendError),
          stack: sendError instanceof Error ? sendError.stack : undefined,
        })
      }
    } else {
      logger.warn('⚠️ [KIE.AI WEBHOOK] No task context found', {
        taskId,
        hasTaskContext: !!taskContext,
      })

      // Fallback for lip-sync jobs: videoTaskStore holds no context for jobs
      // started through asyncLipSyncManager (only ai-reels-render-wizard saves
      // there), so without this the webhook does nothing and delivery waits on
      // the 30s poller. Restored after testing the "causing TypeScript errors"
      // note that disabled it: the project typechecks clean with it back.
      // completeJobByTaskId refuses a job the poller already settled, so this
      // cannot re-deliver to somebody who was already refunded.
      const updated = await asyncLipSyncManager.completeJobByTaskId(
        taskId,
        result
      )
      logger.info('[KIE.AI WEBHOOK] asyncLipSyncManager fallback applied', {
        taskId,
        updated,
      })
    }
  } catch (error) {
    logger.error('❌ [KIE.AI WEBHOOK] Error notifying job completion', {
      taskId,
      error: error instanceof Error ? error.message : String(error),
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
  // Debug-only endpoint. It creates a delivery task for an ARBITRARY telegramId
  // with no token, so the companion /kie-ai/sora-callback would then deliver and
  // charge that user. Unlike the real callbacks (verifyCallbackToken, fail-closed)
  // it authenticates nothing. Gate it out of production; enable only in dev.
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' })
  }
  try {
    logger.info('🧪 [SORA DEBUG] Test webhook endpoint called')

    // Получаем telegramId из query параметров
    const telegramId = parseInt(
      req.query.telegramId || req.body.telegramId || '144022504'
    )
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
      botName: undefined, // Тестовая задача - bot будет выбран автоматически
    })

    logger.info('🧪 [SORA DEBUG] Test task created', {
      taskId: testTaskId,
      telegramId,
      storeSize: videoTaskStore.getAllTasks().size,
    })

    // Быстрый ответ
    res.status(200).json({
      message: 'Test task created successfully',
      taskId: testTaskId,
      telegramId,
      nextStep: `Send webhook callback to trigger video delivery: curl -X POST ${process.env.BASE_WEBHOOK_URL}/api/kie-ai/sora-callback -H "Content-Type: application/json" -d '{"code":200,"data":{"taskId":"${testTaskId}","state":"success","resultJson":"{\\"resultUrls\\":[\\"https://via.placeholder.com/1920x1080.mp4\\"]}"}}' `,
    })
  } catch (error) {
    logger.error('❌ [SORA DEBUG] Error in test endpoint', {
      error: error instanceof Error ? error.message : String(error),
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
  // Debug-only endpoint. It calls processSoraWebhookAsync DIRECTLY for an
  // ARBITRARY telegramId, bypassing verifyCallbackToken, so an unauthenticated
  // request delivers a video to any user and charges their balance
  // (chargeForDeliveredVideo). Gate it out of production; enable only in dev.
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' })
  }
  try {
    const telegramId = parseInt(
      req.query.telegramId || req.body.telegramId || '144022504'
    )
    const testTaskId = `test-full-${Date.now()}`

    logger.info('🧪 [SORA FULL TEST] Starting full test', {
      telegramId,
      testTaskId,
    })

    // 1. Создаём тестовую задачу
    videoTaskStore.saveTask(testTaskId, {
      telegramId: telegramId,
      chatId: telegramId,
      messageId: 999999,
      prompt: '🧪 FULL TEST: Автоматический тест webhook callback',
      modelId: 'sora-2-text-to-video',
      duration: 10,
      createdAt: Date.now(),
      botName: undefined, // Тестовая задача - bot будет выбран автоматически
    })

    logger.info('🧪 [SORA FULL TEST] Task created', { testTaskId })

    // 2. Симулируем успешный callback от Kie.ai
    const testPayload: KieAiWebhookPayload = {
      code: 200,
      data: {
        taskId: testTaskId,
        state: 'success',
        resultJson: JSON.stringify({
          resultUrls: [
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          ],
        }),
      } as any,
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
      videoUrl: resultUrls?.[0],
    }

    logger.info('🧪 [SORA FULL TEST] Calling processSoraWebhookAsync', {
      taskId,
      successFlag,
    })

    // 3. Обрабатываем асинхронно
    processSoraWebhookAsync(normalizedPayload).catch(error => {
      logger.error('❌ [SORA FULL TEST] Error in async processing', {
        error: error.message,
      })
    })

    // Быстрый ответ
    res.status(200).json({
      message: 'Full test initiated - video should be sent to Telegram',
      taskId: testTaskId,
      telegramId,
      videoUrl: resultUrls?.[0],
      checkLogs: 'Check logs for "✅ [SORA WEBHOOK] Video sent to user"',
    })
  } catch (error) {
    logger.error('❌ [SORA FULL TEST] Error', {
      error: error instanceof Error ? error.message : String(error),
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
    'POST /api/kie-ai/sora-full-test',
  ],
})

export default router
