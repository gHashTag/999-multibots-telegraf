/**
 * AI Reels Callback Handler для Railway render-server
 * Это Inngest функция, которая обрабатывает callback после завершения рендеринга видео
 *
 * ВЫЗЫВАЕТСЯ ЧЕРЕЗ: POST событие 'ai-reels-callback'
 * ИСТОЧНИК: Railway render-server
 * НАЗНАЧЕНИЕ: Отправка готового видео пользователю в Telegram
 */

import { NonRetriableError } from 'inngest'
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { safeRecipient, skippedInSafeMode } from '@/inngest_app/safeMode'
import axios from 'axios'
import { Input } from 'telegraf'
import { logger } from '@/utils/logger'
import FormData from 'form-data'

/**
 * Interface для callback payload от Railway render-server
 */
interface AIReelsCallbackPayload {
  download_url?: string
  job_id?: string
  status?: 'completed' | 'failed' | 'processing'
  result_url?: string
  video_url?: string
  error?: string
  error_message?: string
  bot_name?: string
  metadata?: {
    telegram_id?: string
    chat_id?: string
    message_id?: number
    duration?: number
    bot_name?: string
    [key: string]: any
  }
}

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN_AI_STARS || process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
const TELEGRAM_VIDEO_LIMIT = 50 * 1024 * 1024

function extractTelegramIdFromJobId(jobId: string): string | null {
  try {
    const match = jobId.match(/telegram-(\d+)-/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

async function sendTelegramMessage(
  telegramId: string,
  text: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not configured')

  await axios.post(
    `${TELEGRAM_API_URL}/sendMessage`,
    {
      chat_id: telegramId,
      text,
      parse_mode: 'HTML',
    },
    // Raw Telegram call (bypasses telegraf). Without a timeout a stuck request
    // hangs the Inngest step forever; on timeout axios throws and Inngest retries
    // (delivery is deduped, #1242).
    { timeout: 30000 }
  )
}

async function sendTelegramVideo(
  telegramId: string,
  videoBuffer: Buffer,
  filename: string,
  caption: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not configured')

  const url = `${TELEGRAM_API_URL}/sendVideo`
  const formData = new FormData()
  formData.append('chat_id', telegramId)
  formData.append('video', videoBuffer, { filename })
  formData.append('caption', caption)

  await axios.post(url, formData, {
    headers: formData.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    // A hung upload holds the whole video buffer in memory indefinitely and the
    // reel never delivers. 3 min is generous for a <=50MB Telegram video; on
    // timeout axios throws and Inngest retries (delivery is deduped, #1242).
    timeout: 180000,
  })
}

async function handleCompletedRender(
  telegramId: string,
  payload: AIReelsCallbackPayload
): Promise<void> {
  const videoUrl =
    payload.result_url || payload.video_url || payload.download_url

  if (!videoUrl) {
    await sendTelegramMessage(
      telegramId,
      '⚠️ Видео готово, но произошла ошибка при получении ссылки.'
    )
    return
  }

  const videoResponse = await axios.get(videoUrl, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: 100 * 1024 * 1024,
  })

  const videoBuffer = Buffer.from(videoResponse.data)

  if (videoBuffer.length > TELEGRAM_VIDEO_LIMIT) {
    await sendTelegramMessage(
      telegramId,
      `✅ Ваше AI Reels видео готово!\n\n` +
        `⚠️ Видео слишком большое (${(videoBuffer.length / (1024 * 1024)).toFixed(1)}MB)\n\n` +
        `📥 Скачайте видео: ${videoUrl}\n\n` +
        `🎬 Template 2 (Inngest + Railway)`
    )
    return
  }

  await sendTelegramVideo(
    telegramId,
    videoBuffer,
    `ai-reels-${Date.now()}.mp4`,
    '✅ Ваше AI Reels видео готово!\n\n🎬 Template 2 (Inngest + Railway)'
  )
}

async function handleFailedRender(
  telegramId: string,
  payload: AIReelsCallbackPayload
): Promise<void> {
  const errorMessage =
    payload.error || payload.error_message || 'Неизвестная ошибка'
  await sendTelegramMessage(
    telegramId,
    `❌ Ошибка при создании видео:\n\n${errorMessage}\n\nПопробуйте ещё раз.`
  )
}

async function handleProcessingUpdate(
  telegramId: string,
  payload: AIReelsCallbackPayload
): Promise<void> {
  logger.info('Render in progress', { telegramId, jobId: payload.job_id })
}

export const aiReelsCallbackFunction = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'ai-reels-callback'.
    id: 'reels-ai-callback',
    name: '🔔 AI Reels Callback Handler',
    retries: 3,
    // Without onFailure, exhausted retries silently drop the user's paid AI
    // Reels result — no admin visibility. Every sibling Inngest function
    // (welcomeAvatarGeneration, morphImages, kieAiWebhookMonitor, ...) declares
    // this handler; this callback was the anomaly missing it.
    onFailure: createInngestFailureHandler('AI Reels Callback'),
  },
  // Canonical event first, legacy event kept for the Railway render-server.
  [{ event: 'reels/ai.callback' }, { event: 'ai-reels-callback' }],
  async ({ event, step, logger }) => {
    const startTime = Date.now()
    const payload: AIReelsCallbackPayload = event.data

    logger.info('AI Reels callback received', {
      eventId: event.id,
      bodyKeys: Object.keys(payload),
    })

    let jobId = payload.job_id
    const videoUrl =
      payload.result_url || payload.video_url || payload.download_url
    const status = payload.status || 'completed'

    if (!jobId && payload.download_url) {
      const match = payload.download_url.match(/jobs\/(telegram-\d+-\d+)\//)
      if (match) jobId = match[1]
    }

    // Malformed callback payloads cannot be fixed by retrying — fail fast.
    if (!jobId) throw new NonRetriableError('Cannot extract job_id')
    if (!videoUrl && status === 'completed')
      throw new NonRetriableError('No video URL found')

    const telegramId =
      payload.metadata?.telegram_id ||
      payload.metadata?.chat_id ||
      extractTelegramIdFromJobId(jobId)

    if (!telegramId) throw new NonRetriableError('Cannot extract Telegram ID')

    // Safe mode: deliver only to ADMIN_CHAT_ID, never to the real user.
    const recipient = safeRecipient(event, telegramId)
    if (recipient === null) {
      const skipped = skippedInSafeMode('telegram delivery (no ADMIN_CHAT_ID)')
      logger.warn('🛡️ AI Reels callback in safe mode without ADMIN_CHAT_ID', {
        jobId,
        ...skipped,
      })
      return { success: false, jobId, status, ...skipped }
    }
    if (recipient !== String(telegramId)) {
      logger.warn('🛡️ AI Reels callback in safe mode — redirected to admin', {
        jobId,
        intended: telegramId,
        recipient,
      })
    }

    if (status === 'completed') {
      await step.run('send-completed-video', async () => {
        return handleCompletedRender(recipient, {
          ...payload,
          job_id: jobId!,
          result_url: videoUrl,
        })
      })
    } else if (status === 'failed') {
      await step.run('send-failed-message', async () => {
        return handleFailedRender(recipient, { ...payload, job_id: jobId! })
      })
    } else if (status === 'processing') {
      await step.run('send-processing-update', async () => {
        return handleProcessingUpdate(recipient, {
          ...payload,
          job_id: jobId!,
        })
      })
    }

    const duration = Date.now() - startTime
    logger.info('✅ Callback processed successfully', {
      jobId,
      status,
      duration: `${duration}ms`,
    })

    return { success: true, jobId, status, telegramId }
  }
)
