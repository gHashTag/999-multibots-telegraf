import express from 'express'
import { createVideoDeliveryClaimer } from '@/helpers/videoDeliveryIdempotency'
import { Router } from 'express'
import { logger } from '@/utils/logger'
import { defaultBot, getBotByName } from '@/core/bot'
import { supabase, getUserLanguageFromDB } from '@/core/supabase'
import axios from 'axios'
import { Input } from 'telegraf'
import {
  createVideoCompletionKeyboard,
  getVideoCompletionMessage,
} from '@/helpers/videoCompletionKeyboard'
import { verifyCallbackToken } from '@/utils/callbackToken'
import { redactSensitiveHeaders } from '@/utils/redactHeaders'

const router: Router = express.Router()

/**
 * Interface для callback payload от Render Server
 * Реальный формат: { download_url: "https://.../jobs/telegram-ID-timestamp/results/file.mp4" }
 */
interface AIReelsCallbackPayload {
  download_url?: string // Render Server format
  job_id?: string
  status?: 'completed' | 'failed' | 'processing'
  result_url?: string
  video_url?: string
  error?: string
  error_message?: string
  bot_name?: string // Добавляем bot_name из payload
  metadata?: {
    telegram_id?: string
    chat_id?: string
    message_id?: number
    duration?: number
    bot_name?: string // Может быть и в metadata
    [key: string]: any
  }
}

/**
 * AI Reels Callback Handler для Render Server
 * POST /api/telegram/ai-reels-callback
 *
 * Обрабатывает callback от Render Server после завершения рендеринга видео
 */
router.post('/telegram/ai-reels-callback', async (req: any, res: any) => {
  const startTime = Date.now()

  // ✅ Логируем сразу при получении callback
  logger.info('🔔 [AI REELS CALLBACK] Webhook received', {
    timestamp: new Date().toISOString(),
    headers: redactSensitiveHeaders(req.headers),
    bodyKeys: Object.keys(req.body || {}),
    bodyPreview: JSON.stringify(req.body).substring(0, 200),
  })

  try {
    // ✅ Быстро отвечаем 202 Accepted согласно best practices
    res.status(202).json({
      message:
        'AI Reels callback received and will be processed asynchronously',
      timestamp: new Date().toISOString(),
    })

    logger.info('🔔 [AI REELS CALLBACK] Inside try block')

    const payload: AIReelsCallbackPayload = req.body

    // Render Server отправляет download_url вместо структурированного payload
    // Извлекаем job_id из download_url: .../jobs/telegram-ID-timestamp/results/...
    let jobId = payload.job_id
    const videoUrl =
      payload.result_url || payload.video_url || payload.download_url
    const status = payload.status || 'completed' // Default to completed if we have download_url

    if (!jobId && payload.download_url) {
      const match = payload.download_url.match(/jobs\/(telegram-\d+-\d+)\//)
      if (match) {
        jobId = match[1]
      }
    }

    logger.info('🎬 [AI REELS CALLBACK] Received callback from Render Server', {
      jobId,
      status,
      videoUrl,
      hasError: !!payload.error,
      rawPayload: payload,
    })

    // Валидация обязательных полей
    if (!jobId) {
      logger.error('❌ [AI REELS CALLBACK] Cannot extract job_id', { payload })
      return
    }

    if (!videoUrl) {
      logger.error('❌ [AI REELS CALLBACK] No video URL found', { payload })
      return
    }

    // Извлекаем Telegram ID из metadata или job_id
    const telegramId =
      payload.metadata?.telegram_id ||
      payload.metadata?.chat_id ||
      extractTelegramIdFromJobId(jobId)

    if (!telegramId) {
      logger.error('❌ [AI REELS CALLBACK] Cannot extract Telegram ID', {
        jobId,
        metadata: payload.metadata,
      })
      return
    }

    // ПРОВЕРКА МЕТКИ. Получатель берётся из ТЕЛА запроса, ссылка на видео —
    // оттуда же, и дальше это уходит человеку от имени бота. Без проверки
    // посторонний мог прислать кому угодно что угодно: подписи от
    // рендер-сервера нет, а POST принимается любой.
    //
    // Адрес обратного вызова составляем мы сами (render-server-client.ts),
    // поэтому кладём в него метку, привязанную к получателю. Тот же приём уже
    // закрыл /api/video-callback (PR #527).
    //
    // Отказ ЗАКРЫТЫЙ: без совпавшей метки ничего не отправляем.
    if (!verifyCallbackToken(telegramId, req.query?.cb)) {
      logger.warn('⛔ [AI REELS CALLBACK] Отклонено: метка не совпала', {
        jobId,
        telegramId,
        hasToken: Boolean(req.query?.cb),
      })
      return
    }

    // Обработка в зависимости от статуса
    if (status === 'completed') {
      await handleCompletedRender(telegramId, {
        bot_name: (req.query?.bot as string) || undefined,
        ...payload,
        job_id: jobId,
        result_url: videoUrl,
      })
    } else if (status === 'failed') {
      // Forward the per-request bot (?bot=) exactly as the completed branch
      // above does. Without it handleFailedRender's botName resolves to
      // undefined -> defaultBot, so the failure notice would be sent from the
      // wrong tenant's bot (a cross-tenant leak / a 403 loss). This branch is
      // currently unreachable (the render server posts only { download_url } on
      // success, never status:'failed'), so this is a latent defense-in-depth
      // fix that keeps the two branches consistent for when failure callbacks
      // are enabled.
      await handleFailedRender(telegramId, {
        bot_name: (req.query?.bot as string) || undefined,
        ...payload,
        job_id: jobId,
      })
    } else if (status === 'processing') {
      await handleProcessingUpdate(telegramId, { ...payload, job_id: jobId })
    }

    const duration = Date.now() - startTime
    logger.info('✅ [AI REELS CALLBACK] Processed successfully', {
      jobId,
      status,
      duration: `${duration}ms`,
    })
  } catch (error) {
    logger.error('❌ [AI REELS CALLBACK] CAUGHT ERROR', { error })
    logger.error('❌ [AI REELS CALLBACK] Processing error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
    })
  }
})

// 🔎 Health/ping endpoint for reverse proxy and healthchecks
// GET /api/telegram/ai-reels-callback should return 200 OK quickly
router.get('/telegram/ai-reels-callback', async (_req: any, res: any) => {
  try {
    return res.status(200).json({
      status: 'ok',
      service: 'ai-reels-callback',
      timestamp: new Date().toISOString(),
    })
  } catch {
    return res.status(200).end()
  }
})

/**
 * Извлечение Telegram ID из job_id
 * Формат: telegram-{id}-{timestamp}
 */
function extractTelegramIdFromJobId(jobId: string): string | null {
  try {
    const match = jobId.match(/telegram-(\d+)-/)
    return match ? match[1] : null
  } catch (error) {
    logger.error('❌ [AI REELS CALLBACK] Error extracting Telegram ID', {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Обработка успешного рендеринга
 */
// Delivered job ids (in-process). AI Reels callbacks are delivered
// at-least-once (provider retry); verifyCallbackToken checks the recipient, not
// duplicates, so a retry re-enters handleCompletedRender and re-sends the video.
// Claim the delivery by the immutable job_id before any await. Bounded so a
// long-lived multi-bot process cannot grow the set without limit — same pattern
// as the kie/sora webhook and the sibling poller handleTextToVideoDirect.ts.
// Reset on restart (a durable guard would be a per-job marker on payments_v2).
const claimVideoJobDelivery = createVideoDeliveryClaimer()

async function handleCompletedRender(
  telegramId: string,
  payload: AIReelsCallbackPayload
) {
  // Idempotency: an at-least-once webhook re-enters this delivery for the same
  // completed job. Claim it by the immutable job_id before any await so a
  // duplicate skips the re-send (video + completion keyboard).
  if (payload.job_id && !claimVideoJobDelivery(payload.job_id)) return

  // Определяем правильного бота в начале функции
  let botName = payload.bot_name || payload.metadata?.bot_name

  // bot_name В PAYLOAD НЕ ПРИХОДИТ НИКОГДА.
  //
  // sendCallback (functions/render/helpers/renderSteps.ts:315) шлёт ровно
  // { download_url: downloadUrl } — ни bot_name, ни telegram_id, ни metadata.
  // Значит эта ветка берётся ВСЕГДА, и раньше она упиралась в захардкоженную
  // карту из пяти владельцев. Для всех остальных botName оставался undefined,
  // и готовое видео уходило через defaultBot — то есть человеку писал не тот
  // бот, в котором он его заказывал, либо не писал никто.
  //
  // ЗАПАСНОЙ путь — на случай старых задач, чей callback_url собран без ?bot=.
  //
  // users.bot_name заполнен у всех 2341 пользователя, но означает он «бот, через
  // которого человек зарегистрировался», а не «бот, которым он владеет».
  // Проверено: по всем четырём владельцам из прежней захардкоженной карты база
  // даёт ДРУГОЕ значение (144022504 → HaimGroupMedia_bot против
  // neuro_blogger_bot в карте), а пятого владельца в users нет вовсе. То есть
  // карта и база противоречат друг другу, и достоверен только ?bot= выше.
  // Кто из двух источников прав — выяснено по платежам (payments_v2, каким
  // ботом человек РЕАЛЬНО пользуется). Ответ: ни один не прав целиком.
  //
  //   352374518   → MetaMuse_Manifest_bot (1767 платежей)  база ✓  карта ✗
  //   1254048880  → ZavaraBot (8)                          база ✓  карта ✗
  //   7669741878  → HaimGroupMedia_bot (79)                база ✗  карта ✓
  //   1852726961  → neuro_blogger_bot (19)                 в базе нет, карта ✗
  //   144022504   → доминирующего бота нет вовсе (всё по 1)
  //
  // Поэтому ?bot= из самой задачи — единственный достоверный источник, а всё
  // ниже лишь смягчает последствия для старых задач без него.
  if (!botName) {
    try {
      const { data, error: dbError } = await supabase
        .from('users')
        .select('bot_name')
        .eq('telegram_id', telegramId.toString())
        .maybeSingle()

      if (dbError) {
        logger.warn('⚠️ [AI REELS CALLBACK] Не удалось спросить бота у базы', {
          telegramId,
          error: dbError.message,
        })
      } else if (data?.bot_name) {
        botName = data.bot_name
        logger.info('✅ [AI REELS CALLBACK] Бот определён по базе', {
          telegramId,
          botName,
        })
      } else {
        logger.warn(
          '⚠️ [AI REELS CALLBACK] У пользователя нет bot_name в базе',
          {
            telegramId,
          }
        )
      }
    } catch (e) {
      // Падать нельзя: ниже есть defaultBot, и лучше отдать видео хоть
      // каким-то ботом, чем не отдать вовсе.
      logger.error('❌ [AI REELS CALLBACK] Ошибка запроса bot_name', {
        telegramId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const { bot, error } = botName
    ? getBotByName(botName)
    : { bot: defaultBot, error: null }

  if (error) {
    logger.warn(
      `⚠️ [AI REELS CALLBACK] Bot not found: ${botName}, using defaultBot`
    )
  }

  const botToUse = bot || defaultBot

  try {
    const videoUrl =
      payload.result_url || payload.video_url || payload.download_url

    if (!videoUrl) {
      logger.error('❌ [AI REELS CALLBACK] Completed render but no video URL', {
        jobId: payload.job_id,
        telegramId,
      })

      await botToUse.telegram.sendMessage(
        telegramId,
        '⚠️ Видео готово, но произошла ошибка при получении ссылки. Попробуйте ещё раз.'
      )
      return
    }

    logger.info('🎉 [AI REELS CALLBACK] Sending completed video to user', {
      telegramId,
      jobId: payload.job_id,
      videoUrl,
      botName: botName || 'defaultBot',
    })

    // Скачиваем видео с Selectel S3 и отправляем как Buffer
    const videoResponse = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 120000, // 120 секунд таймаут для больших файлов
      maxContentLength: 100 * 1024 * 1024, // 100MB max
      maxBodyLength: 100 * 1024 * 1024,
    })

    const videoBuffer = Buffer.from(videoResponse.data)

    logger.info('📥 [AI REELS CALLBACK] Video downloaded', {
      telegramId,
      size: videoBuffer.length,
      sizeKB: Math.round(videoBuffer.length / 1024),
      sizeMB: (videoBuffer.length / (1024 * 1024)).toFixed(2),
    })

    // ✅ Telegram лимит: 50MB. Если видео больше - отправляем URL
    const TELEGRAM_VIDEO_LIMIT = 50 * 1024 * 1024 // 50MB

    const isRu = (await getUserLanguageFromDB(telegramId)) !== 'en'
    if (videoBuffer.length > TELEGRAM_VIDEO_LIMIT) {
      logger.warn(
        '⚠️ [AI REELS CALLBACK] Video exceeds Telegram limit, sending URL',
        {
          telegramId,
          videoSize: videoBuffer.length,
          limit: TELEGRAM_VIDEO_LIMIT,
        }
      )

      // Отправляем URL вместо файла
      await botToUse.telegram.sendMessage(
        telegramId,
        (isRu
          ? `✅ Ваше AI Reels видео готово!\n\n`
          : `✅ Your AI Reels video is ready!\n\n`) +
          (isRu
            ? `⚠️ Видео слишком большое для Telegram (${(videoBuffer.length / (1024 * 1024)).toFixed(1)}MB > 50MB)\n\n`
            : `⚠️ Video too large for Telegram (${(videoBuffer.length / (1024 * 1024)).toFixed(1)}MB > 50MB)\n\n`) +
          (isRu
            ? `📥 Скачайте видео по ссылке:\n${videoUrl}\n\n`
            : `📥 Download the video:\n${videoUrl}\n\n`) +
          (isRu
            ? `🎬 Создано с помощью Template 2 (Inngest + Render Server)`
            : `🎬 Created with Template 2 (Inngest + Render Server)`)
      )

      // ✅ Отправляем клавиатуру с кнопками продолжения (для больших файлов)
      await botToUse.telegram.sendMessage(
        telegramId,
        getVideoCompletionMessage(isRu),
        createVideoCompletionKeyboard(isRu)
      )

      logger.info('✅ [AI REELS CALLBACK] URL sent successfully', {
        telegramId,
        jobId: payload.job_id,
      })
      return
    }

    // Отправляем видео как InputFile (Buffer)
    await botToUse.telegram.sendVideo(
      telegramId,
      Input.fromBuffer(videoBuffer, `ai-reels-${Date.now()}.mp4`),
      {
        caption: isRu
          ? '✅ Ваше AI Reels видео готово!\n\n🎬 Создано с помощью Template 2 (Inngest + Render Server)'
          : '✅ Your AI Reels video is ready!\n\n🎬 Created with Template 2 (Inngest + Render Server)',
      }
    )

    // ✅ Отправляем клавиатуру с кнопками продолжения
    await botToUse.telegram.sendMessage(
      telegramId,
      getVideoCompletionMessage(isRu),
      createVideoCompletionKeyboard(isRu)
    )

    logger.info('✅ [AI REELS CALLBACK] Video sent successfully', {
      telegramId,
      jobId: payload.job_id,
    })
  } catch (error) {
    logger.error('❌ [AI REELS CALLBACK] Error sending completed video', {
      telegramId,
      jobId: payload.job_id,
      error: error instanceof Error ? error.message : String(error),
    })

    // Отправляем сообщение об ошибке пользователю
    try {
      await botToUse.telegram.sendMessage(
        telegramId,
        '⚠️ Видео готово, но произошла ошибка при отправке. Попробуйте ещё раз.'
      )
    } catch (sendError) {
      logger.error('❌ [AI REELS CALLBACK] Failed to send error message', {
        error:
          sendError instanceof Error ? sendError.message : String(sendError),
      })
    }
  }
}

/**
 * Обработка ошибки рендеринга
 */
async function handleFailedRender(
  telegramId: string,
  payload: AIReelsCallbackPayload
) {
  try {
    const errorMessage =
      payload.error || payload.error_message || 'Неизвестная ошибка'

    logger.error('❌ [AI REELS CALLBACK] Render failed', {
      telegramId,
      jobId: payload.job_id,
      error: errorMessage,
    })

    // Определяем правильного бота для отправки
    const botName = payload.bot_name || payload.metadata?.bot_name
    const { bot, error } = botName
      ? getBotByName(botName)
      : { bot: defaultBot, error: null }

    if (error) {
      logger.warn(
        `⚠️ [AI REELS CALLBACK] Bot not found: ${botName}, using defaultBot`
      )
    }

    const botToUse = bot || defaultBot

    await botToUse.telegram.sendMessage(
      telegramId,
      `❌ Ошибка при создании видео:\n\n${errorMessage}\n\nПопробуйте ещё раз или выберите другой шаблон.`
    )
  } catch (error) {
    logger.error('❌ [AI REELS CALLBACK] Error handling failed render', {
      telegramId,
      jobId: payload.job_id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Обработка промежуточного статуса (processing)
 */
async function handleProcessingUpdate(
  telegramId: string,
  payload: AIReelsCallbackPayload
) {
  try {
    logger.info('⏳ [AI REELS CALLBACK] Render in progress', {
      telegramId,
      jobId: payload.job_id,
    })

    // Опционально: можно отправить обновление статуса пользователю
    // await bot.telegram.sendMessage(
    //   telegramId,
    //   '⏳ Ваше видео создаётся... Пожалуйста, подождите.'
    // )
  } catch (error) {
    logger.error('❌ [AI REELS CALLBACK] Error handling processing update', {
      telegramId,
      jobId: payload.job_id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export default router
