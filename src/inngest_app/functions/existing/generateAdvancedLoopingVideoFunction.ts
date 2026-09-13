import { NonRetriableError } from 'inngest'
import { assertSafePathSegment } from '@/utils/pathSegment'
import { logger } from '@/utils/logger'
import { createInngestFailureHandler, inngest } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import path from 'path'
import fs from 'fs/promises'
import { Telegraf } from 'telegraf'
import fetch from 'node-fetch'
import { addMusic, combineVideos } from '@/helpers/video-helpers'
import { downloadFile } from '@/helpers'

const replicateApi = {
  createPrediction: async (version: string, input: object) => {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version, input }),
    })
    const prediction = await response.json()
    if (!response.ok) {
      logger.error('Replicate API error', {
        status: response.status,
        error: (prediction as any)?.detail || 'Unknown API error',
      })
      throw new Error(
        `Replicate API error: ${(prediction as any)?.detail || 'Unknown error'}`
      )
    }
    return prediction
  },
  waitForPrediction: async (predictionId: string) => {
    let prediction: any
    do {
      await new Promise(resolve => setTimeout(resolve, 4000)) // Increased delay
      const response = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: {
            Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
          },
        }
      )
      prediction = await response.json()
      if (response.status !== 200) {
        logger.error('Replicate API error on poll', {
          status: response.status,
          error: (prediction as any)?.detail || 'Unknown API error',
        })
        throw new Error(
          `Prediction poll failed: ${
            (prediction as any)?.detail || 'Unknown error'
          }`
        )
      }
      logger.info('Polling prediction status...', { status: prediction.status })
      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        logger.error('Prediction failed or canceled', {
          error: prediction.error,
        })
        throw new Error(
          `Prediction failed: ${JSON.stringify(prediction.error)}`
        )
      }
    } while (prediction.status !== 'succeeded')
    return prediction
  },
}

export const generateAdvancedLoopingVideoFunction = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was
    // 'generate-advanced-looping-video'.
    id: 'reels-loop-generate',
    name: '🔄 Generate Kling Morphing Loop v7',
    retries: 2,
    // Paid Replicate calls + Telegram delivery → admin visibility on failure.
    onFailure: createInngestFailureHandler('reels-loop-generate'),
    concurrency: {
      limit: 1, // Run one at a time to avoid overwhelming API
    },
  },
  // Canonical event first, legacy event kept for existing senders.
  [{ event: 'reels/loop.generate' }, { event: 'reels/generate-advanced-loop' }],
  async ({ event, step }) => {
    // ✅ Деструктурируем переменные вне try блока для правильной области видимости
    const {
      telegram_id,
      image_urls = [],
      music_url,
      bot_token,
      model_version, // 'kwaivgi/kling-v1.6-pro' version
      prompt,
    } = event.data

    try {
      logger.info('🎬 [KLING MORPH v7] Function initialized')

      // Check environment variables first
      if (!process.env.REPLICATE_API_TOKEN) {
        logger.error('❌ REPLICATE_API_TOKEN not found in environment')
        throw new Error(
          'REPLICATE_API_TOKEN is required but not found in environment variables'
        )
      }

      logger.info('🎬 [KLING MORPH v7] Function started', {
        telegram_id,
        images_count: image_urls.length,
        has_bot_token: !!bot_token,
        model_version,
      })
    } catch (error) {
      logger.error('❌ [KLING MORPH v7] Function initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }

    // Guard: a loop needs at least two images. Retrying cannot add images.
    if (!Array.isArray(image_urls) || image_urls.length < 2) {
      throw new NonRetriableError(
        'This function requires at least 2 images for a loop.'
      )
    }
    if (!telegram_id) {
      throw new NonRetriableError('telegram_id is required')
    }

    assertSafePathSegment(String(telegram_id), 'telegram_id')

    // Safe mode: Replicate (Kling) is a paid API → skip before spending.
    if (isSafeMode(event)) {
      const skipped = skippedInSafeMode('replicate kling morph clips')
      logger.warn('🛡️ [KLING MORPH v7] safe mode — paid generation skipped', {
        telegram_id,
        ...skipped,
      })
      return { success: false, ...skipped }
    }
    const filePrefix = `reels_kling_v7_${telegram_id}_${Date.now()}`
    const tempDir = path.join(process.cwd(), 'assets', 'temp_reels_images')
    await fs.mkdir(tempDir, { recursive: true })

    // Create pairs for morphing, including the loop back to start
    const imagePairs = []
    for (let i = 0; i < image_urls.length; i++) {
      imagePairs.push({
        start: image_urls[i],
        end: image_urls[(i + 1) % image_urls.length], // Loops back to the start
      })
    }

    const videoClipUrls = await step.run(
      'generate-morphing-clips',
      async () => {
        const clipPromises = imagePairs.map(async (pair, index) => {
          logger.info(
            `🧬 Generating morph clip ${index + 1}/${imagePairs.length}`,
            {
              from: pair.start.slice(-20),
              to: pair.end.slice(-20),
            }
          )
          const input = {
            image: pair.start,
            image_tail: pair.end,
            prompt:
              prompt || 'cinematic video, beautiful, hd, 4k, morphing effect',
            duration: 5, // 5s clips
          }
          const prediction = await replicateApi.createPrediction(
            model_version,
            input
          )
          const result = await replicateApi.waitForPrediction(
            (prediction as any)?.id
          )
          return result.output
        })
        const urls = await Promise.all(clipPromises)
        // Replicate sometimes returns an array of URLs, sometimes a single URL string.
        // We flatten and take the first valid URL from each result.
        return urls.flat().filter(Boolean)
      }
    )

    if (!videoClipUrls || videoClipUrls.length !== imagePairs.length) {
      throw new Error('Failed to generate one or more video clips.')
    }

    const downloadedClipPaths = await step.run(
      'download-video-clips',
      async () => {
        const downloadPromises = videoClipUrls.map((url, index) => {
          const videoPath = path.join(
            tempDir,
            `${filePrefix}_clip_${index}.mp4`
          )
          // downloadFile returns a Buffer and writes nothing: without this
          // write the merge step always failed on a missing file (audit 2026-09-13).
          return downloadFile(url)
            .then(buffer => fs.writeFile(videoPath, buffer))
            .then(() => videoPath)
        })
        return Promise.all(downloadPromises)
      }
    )

    const combinedVideoPath = await step.run(
      'combine-video-clips',
      async () => {
        const outputPath = path.join(
          tempDir,
          `${filePrefix}_combined_no_music.mp4`
        )
        // Using simple concat now, not crossfade, as the clips are already morphed
        return await combineVideos(downloadedClipPaths, outputPath, 'none')
      }
    )

    const finalVideoPath = await step.run('add-music', async () => {
      if (!music_url) return combinedVideoPath
      const outputPath = path.join(tempDir, `${filePrefix}_final_music.mp4`)
      return await addMusic(combinedVideoPath, music_url, outputPath, tempDir)
    })

    await step.run('send-to-telegram', async () => {
      const bot = new Telegraf(bot_token!)
      await bot.telegram.sendVideo(
        telegram_id,
        { source: finalVideoPath },
        {
          caption: '🎬 Ваше циклическое morphing-видео готово!',
        }
      )
      logger.info('✅ Final video sent to Telegram')
    })

    await step.run('send-to-pulse', async () => {
      // Импортируем функцию отправки в pulse группу
      const { sendMediaToPulse } = await import('../../../helpers/pulse')

      // Создаем публичный URL для видео (предполагаем что nginx настроен)
      const videoUrl = `http://localhost:2999/${finalVideoPath.replace(
        process.cwd() + '/',
        ''
      )}`

      const pulseOptions = {
        mediaType: 'video' as const,
        mediaSource: videoUrl,
        telegramId: telegram_id,
        username: 'telegram_bot',
        language: 'ru' as const,
        serviceType: 'Morphing Loop (Kling)',
        prompt: prompt || 'Морфинг видео',
        botName: 'ai_koshey_bot', // Можно сделать динамическим если нужно
        additionalInfo: {
          images_count: image_urls.length.toString(),
          morphing_type: 'loop',
          model: 'kling-v1.6-pro',
        },
      }

      await sendMediaToPulse(pulseOptions)
      logger.info('✅ Morphing video sent to pulse group', {
        telegramId: telegram_id,
        videoUrl,
      })
    })

    await step.run('cleanup', async () => {
      const files = await fs.readdir(tempDir)
      for (const file of files) {
        if (file.startsWith(filePrefix)) {
          await fs.unlink(path.join(tempDir, file))
        }
      }
      logger.info('✅ Temporary files cleaned up')
    })

    return {
      success: true,
      message: 'Kling morphing loop generated successfully.',
    }
  }
)
