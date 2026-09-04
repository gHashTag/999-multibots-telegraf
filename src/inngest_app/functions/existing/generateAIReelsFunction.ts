import { logger } from '@/utils/logger'
import { assertSafePathSegment } from '@/utils/pathSegment'
import { inngest } from '@/inngest_app/client'

/**
 * 🎬 AI REELS GENERATION FUNCTION
 *
 * Генерирует AI Reels через Inngest с двумя видео:
 * 1. Lip-sync видео (veed_fabric)
 * 2. WAN 2.5 видео (image-to-video)
 * 3. Склеивание через FFmpeg
 *
 * Преимущества Inngest:
 * - Автоматические retry при ошибках
 * - Timeout handling
 * - Progress tracking
 * - Webhook notifications
 */

export interface AIReelsPayload {
  telegramId: string
  imageUrl: string
  text?: string
  audioUrl?: string
  resolution?: '480p' | '720p' | '1080p'
  botName?: string

  // Webhook для уведомления бота
  webhookUrl?: string
}

export interface AIReelsResult {
  success: boolean
  firstVideoUrl?: string
  secondVideoUrl?: string
  finalVideoUrl?: string
  error?: string
  processingTime?: number
}

/**
 * ✅ Inngest function for AI Reels generation
 */
export const generateAIReelsFunction = inngest.createFunction(
  {
    id: 'ai-reels-generation',
    name: '🎬 AI Reels Generation',
    retries: 2, // Повторить 2 раза при ошибке
    rateLimit: {
      limit: 5, // Максимум 5 одновременных генераций
      period: '1m',
      key: 'event.data.telegramId',
    },
  },
  { event: 'ai-reels/generate' },
  async ({ event, step }) => {
    const {
      telegramId,
      imageUrl,
      text,
      audioUrl,
      resolution = '720p',
      botName,
      webhookUrl,
    } = event.data as AIReelsPayload

    logger.info('🎬 [INNGEST AI REELS] Function started', {
      telegramId,
      hasText: !!text,
      hasAudio: !!audioUrl,
      resolution,
    })

    try {
      // Step 1: Генерация lip-sync видео (30-60 сек)
      const firstVideo = await step.run('generate-lipsync-video', async () => {
        logger.info('1️⃣ [INNGEST] Генерация lip-sync видео', { telegramId })

        const { lipSyncOrchestrator } = await import(
          '@/core/lipsync/lipsync-orchestrator'
        )
        const { LipSyncInputBuilder } = await import(
          '@/core/lipsync/schemas/lipsync-schemas'
        )

        const input = LipSyncInputBuilder.forVeedFabric(
          imageUrl,
          audioUrl || text || '',
          telegramId,
          {
            botName: botName || 'unknown_bot',
            resolution: '720p', // Lip-sync только 720p
            isAudioUrl: !!audioUrl,
          }
        )

        const result = await lipSyncOrchestrator.generate(input)

        if (!('id' in result)) {
          throw new Error(
            `Lip-sync generation failed: ${JSON.stringify(result)}`
          )
        }

        logger.info('✅ [INNGEST] Lip-sync видео готово', {
          telegramId,
          videoUrl: result.output?.substring(0, 100),
        })

        return result.output
      })

      // Step 2: Генерация WAN 2.5 видео (60-90 сек)
      const secondVideo = await step.run('generate-wan25-video', async () => {
        logger.info('2️⃣ [INNGEST] Генерация WAN 2.5 видео', { telegramId })

        const { WAN25_MODELS, WAN25ModelType, WAN25_DEFAULT_PROMPTS } =
          await import('@/config/wan25-config')

        type WAN25CreateTaskRequest =
          import('@/config/wan25-config').WAN25CreateTaskRequest

        const wan25Prompt = WAN25_DEFAULT_PROMPTS.CINEMATIC.en

        const wan25Request: WAN25CreateTaskRequest = {
          model: WAN25_MODELS[WAN25ModelType.IMAGE_TO_VIDEO].modelId,
          input: {
            prompt: wan25Prompt,
            image_url: imageUrl,
            duration: '5',
            resolution: resolution as '720p' | '1080p',
            enable_prompt_expansion: true,
          },
        }

        // Импортируем функции из ai-reels-wizard
        const { createWAN25Task, waitForWAN25Task } = await import(
          '../wan25-helpers'
        )

        const taskResponse = await createWAN25Task(wan25Request)

        if (taskResponse.code !== 200) {
          throw new Error(`WAN 2.5 API error: ${taskResponse.message}`)
        }

        const videoUrl = await waitForWAN25Task(
          taskResponse.data.taskId,
          120000
        )

        logger.info('✅ [INNGEST] WAN 2.5 видео готово', {
          telegramId,
          videoUrl: videoUrl.substring(0, 100),
        })

        return videoUrl
      })

      // Step 3: Склеивание видео (30-45 сек)
      const finalVideo = await step.run('merge-videos', async () => {
        logger.info('3️⃣ [INNGEST] Склеивание видео', { telegramId })

        const { combineVideos } = await import('@/helpers/video-helpers')
        const { downloadFile } = await import('@/helpers/file-helpers')
        const path = await import('path')
        const fs = await import('fs/promises')
        const os = await import('os')

        // Создаем временную директорию
        assertSafePathSegment(String(telegramId), 'telegramId')
        const tempDir = path.join(
          os.tmpdir(),
          `ai-reels-inngest-${telegramId}-${Date.now()}`
        )
        await fs.mkdir(tempDir, { recursive: true })

        try {
          const firstVideoPath = path.join(tempDir, 'first-video.mp4')
          const secondVideoPath = path.join(tempDir, 'second-video.mp4')
          const finalVideoPath = path.join(tempDir, 'final-reels.mp4')

          // Скачиваем оба видео
          await Promise.all([
            downloadFile(firstVideo!, firstVideoPath),
            downloadFile(secondVideo!, secondVideoPath),
          ])

          // Склеиваем
          await combineVideos(
            [firstVideoPath, secondVideoPath],
            finalVideoPath,
            'none',
            0
          )

          // Загружаем в Supabase
          const { uploadVideoToSupabase } = await import(
            '../video-upload-helper'
          )
          const finalVideoUrl = await uploadVideoToSupabase(
            finalVideoPath,
            `ai-reels-inngest-${telegramId}-${Date.now()}.mp4`,
            telegramId
          )

          logger.info('✅ [INNGEST] Видео склеено и загружено', {
            telegramId,
            finalVideoUrl: finalVideoUrl.substring(0, 100),
          })

          return finalVideoUrl
        } finally {
          // Очищаем временные файлы
          try {
            await fs.rm(tempDir, { recursive: true, force: true })
          } catch (cleanupError) {
            logger.warn('⚠️ [INNGEST] Ошибка очистки', { error: cleanupError })
          }
        }
      })

      // Step 4: Отправка уведомления в Telegram (опционально)
      if (webhookUrl) {
        await step.run('notify-telegram', async () => {
          logger.info('📢 [INNGEST] Отправка webhook уведомления', {
            telegramId,
            webhookUrl,
          })

          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              telegramId,
              success: true,
              firstVideoUrl: firstVideo,
              secondVideoUrl: secondVideo,
              finalVideoUrl: finalVideo,
            }),
          })

          if (!response.ok) {
            logger.warn('⚠️ [INNGEST] Webhook notification failed', {
              status: response.status,
              statusText: response.statusText,
            })
            // Throw so Inngest retries this delivery handoff. This callback is
            // the SOLE trigger that sends the finished reel to the user, and the
            // user was charged before dispatch (ai-reels-inngest-wizard). The
            // callback is idempotent (delivered-job-ids dedup), so a retry
            // re-attempts delivery without duplicating; prior generation steps
            // are memoized, so nothing is re-charged. Swallowing a non-2xx made
            // the run report success while the paid reel was never delivered --
            // a silent charged-not-delivered.
            throw new Error(
              `AI Reels delivery webhook failed: ${response.status} ${response.statusText}`
            )
          }
        })
      }

      const result: AIReelsResult = {
        success: true,
        firstVideoUrl: firstVideo,
        secondVideoUrl: secondVideo,
        finalVideoUrl: finalVideo,
      }

      logger.info('🎉 [INNGEST AI REELS] Function completed successfully', {
        telegramId,
        finalVideoUrl: finalVideo?.substring(0, 100),
      })

      return result
    } catch (error) {
      logger.error('❌ [INNGEST AI REELS] Function failed', {
        telegramId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      const errorResult: AIReelsResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }

      // Отправляем уведомление об ошибке
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(errorResult),
          })
        } catch (webhookError) {
          logger.error('❌ [INNGEST] Failed to send error webhook', {
            webhookError,
          })
        }
      }

      throw error
    }
  }
)
