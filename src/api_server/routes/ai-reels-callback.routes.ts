import express from 'express'
import { Router } from 'express'
import { logger } from '@/utils/logger'
import { defaultBot } from '@/core/bot'

const router: Router = express.Router()

/**
 * Interface для callback payload от Railway render-server
 * Реальный формат: { download_url: "https://.../jobs/telegram-ID-timestamp/results/file.mp4" }
 */
interface AIReelsCallbackPayload {
  download_url?: string  // Railway format
  job_id?: string
  status?: 'completed' | 'failed' | 'processing'
  result_url?: string
  video_url?: string
  error?: string
  error_message?: string
  metadata?: {
    telegram_id?: string
    chat_id?: string
    message_id?: number
    duration?: number
    [key: string]: any
  }
}

/**
 * AI Reels Callback Handler для Railway render-server
 * POST /api/telegram/ai-reels-callback
 *
 * Обрабатывает callback от Railway render-server после завершения рендеринга видео
 */
router.post('/telegram/ai-reels-callback', async (req: any, res: any) => {
  const startTime = Date.now()

  try {
    // ✅ Быстро отвечаем 202 Accepted согласно best practices
    res.status(202).json({
      message: 'AI Reels callback received and will be processed asynchronously',
      timestamp: new Date().toISOString()
    })

    const payload: AIReelsCallbackPayload = req.body

    // Railway отправляет download_url вместо структурированного payload
    // Извлекаем job_id из download_url: .../jobs/telegram-ID-timestamp/results/...
    let jobId = payload.job_id
    let videoUrl = payload.result_url || payload.video_url || payload.download_url
    let status = payload.status || 'completed' // Default to completed if we have download_url

    if (!jobId && payload.download_url) {
      const match = payload.download_url.match(/jobs\/(telegram-\d+-\d+)\//)
      if (match) {
        jobId = match[1]
      }
    }

    logger.info('🎬 [AI REELS CALLBACK] Received callback from Railway', {
      jobId,
      status,
      videoUrl,
      hasError: !!payload.error,
      rawPayload: payload
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
    const telegramId = payload.metadata?.telegram_id ||
                       payload.metadata?.chat_id ||
                       extractTelegramIdFromJobId(jobId)

    if (!telegramId) {
      logger.error('❌ [AI REELS CALLBACK] Cannot extract Telegram ID', {
        jobId,
        metadata: payload.metadata
      })
      return
    }

    // Обработка в зависимости от статуса
    if (status === 'completed') {
      await handleCompletedRender(telegramId, { ...payload, job_id: jobId, result_url: videoUrl })
    } else if (status === 'failed') {
      await handleFailedRender(telegramId, { ...payload, job_id: jobId })
    } else if (status === 'processing') {
      await handleProcessingUpdate(telegramId, { ...payload, job_id: jobId })
    }

    const duration = Date.now() - startTime
    logger.info('✅ [AI REELS CALLBACK] Processed successfully', {
      jobId,
      status,
      duration: `${duration}ms`
    })

  } catch (error) {
    logger.error('❌ [AI REELS CALLBACK] Processing error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body
    })
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
      error: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}

/**
 * Обработка успешного рендеринга
 */
async function handleCompletedRender(telegramId: string, payload: AIReelsCallbackPayload) {
  try {
    const videoUrl = payload.result_url || payload.video_url

    if (!videoUrl) {
      logger.error('❌ [AI REELS CALLBACK] Completed render but no video URL', {
        jobId: payload.job_id,
        telegramId
      })

      await defaultBot.telegram.sendMessage(
        telegramId,
        '⚠️ Видео готово, но произошла ошибка при получении ссылки. Попробуйте ещё раз.'
      )
      return
    }

    logger.info('🎉 [AI REELS CALLBACK] Sending completed video to user', {
      telegramId,
      jobId: payload.job_id,
      videoUrl
    })

    // Отправляем готовое видео пользователю
    await defaultBot.telegram.sendVideo(telegramId, videoUrl, {
      caption: '✅ Ваше AI Reels видео готово!\n\n🎬 Создано с помощью Template 2 (Inngest + Railway)'
    })

    logger.info('✅ [AI REELS CALLBACK] Video sent successfully', {
      telegramId,
      jobId: payload.job_id
    })

  } catch (error) {
    logger.error('❌ [AI REELS CALLBACK] Error sending completed video', {
      telegramId,
      jobId: payload.job_id,
      error: error instanceof Error ? error.message : String(error)
    })

    // Отправляем сообщение об ошибке пользователю
    try {
      await defaultBot.telegram.sendMessage(
        telegramId,
        '⚠️ Видео готово, но произошла ошибка при отправке. Попробуйте ещё раз.'
      )
    } catch (sendError) {
      logger.error('❌ [AI REELS CALLBACK] Failed to send error message', {
        error: sendError instanceof Error ? sendError.message : String(sendError)
      })
    }
  }
}

/**
 * Обработка ошибки рендеринга
 */
async function handleFailedRender(telegramId: string, payload: AIReelsCallbackPayload) {
  try {
    const errorMessage = payload.error || payload.error_message || 'Неизвестная ошибка'

    logger.error('❌ [AI REELS CALLBACK] Render failed', {
      telegramId,
      jobId: payload.job_id,
      error: errorMessage
    })

    await defaultBot.telegram.sendMessage(
      telegramId,
      `❌ Ошибка при создании видео:\n\n${errorMessage}\n\nПопробуйте ещё раз или выберите другой шаблон.`
    )

  } catch (error) {
    logger.error('❌ [AI REELS CALLBACK] Error handling failed render', {
      telegramId,
      jobId: payload.job_id,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Обработка промежуточного статуса (processing)
 */
async function handleProcessingUpdate(telegramId: string, payload: AIReelsCallbackPayload) {
  try {
    logger.info('⏳ [AI REELS CALLBACK] Render in progress', {
      telegramId,
      jobId: payload.job_id
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
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export default router
