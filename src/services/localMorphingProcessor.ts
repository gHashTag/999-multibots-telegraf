import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import axios from 'axios'
import { logger } from '@/utils/logger'

const execAsync = promisify(exec)

interface MorphingVideoOptions {
  imagePaths: string[]
  tempDir: string
  telegram_id: string
}

interface ReplicateClient {
  run: (model: string, options: { input: any }) => Promise<any>
}

/**
 * 🧬 Локальный процессор морфинга без Inngest
 * Использует прямые вызовы к Replicate API и FFmpeg
 */
export async function createMorphingVideo(
  options: MorphingVideoOptions
): Promise<string> {
  const { imagePaths, tempDir, telegram_id } = options

  logger.info('🧬 [LOCAL MORPHING] Starting video generation', {
    imageCount: imagePaths.length,
    tempDir,
    telegram_id,
  })

  // ✅ Инициализация Replicate
  const Replicate = require('replicate')
  const replicate: ReplicateClient = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  })

  try {
    // ✅ Шаг 1: Создание пар изображений для морфинга (A->B, B->C, C->D) - линейно
    const imagePairs = []
    for (let i = 0; i < imagePaths.length - 1; i++) {
      const currentImage = imagePaths[i]
      const nextImage = imagePaths[i + 1] // Следующее изображение (без зацикливания)

      // Конвертируем локальные пути в base64 для Replicate
      const currentImageBase64 = fs.readFileSync(currentImage, 'base64')
      const nextImageBase64 = fs.readFileSync(nextImage, 'base64')

      imagePairs.push({
        start: `data:image/jpeg;base64,${currentImageBase64}`,
        end: `data:image/jpeg;base64,${nextImageBase64}`,
        index: i,
      })
    }

    logger.info(`📸 Created ${imagePairs.length} image pairs for morphing`)

    // ✅ Шаг 2: Генерация морфинг клипов через Replicate Kling API
    const videoClipUrls: string[] = []

    for (const pair of imagePairs) {
      logger.info(
        `🧬 Generating morph clip ${pair.index + 1}/${imagePairs.length}`
      )

      const input = {
        image: pair.start,
        image_tail: pair.end,
        prompt: 'cinematic video, beautiful, hd, 4k, morphing effect',
        duration: 5, // 5 секунд
      }

      try {
        const output = await replicate.run('kwaivgi/kling-v1.6-pro', { input })

        // Результат может быть массивом URL или одним URL
        const videoUrl = Array.isArray(output) ? output[0] : output

        if (!videoUrl) {
          throw new Error(`Empty output from Replicate for pair ${pair.index}`)
        }

        videoClipUrls.push(videoUrl)
        logger.info(`✅ Generated clip ${pair.index + 1}: ${videoUrl}`)
      } catch (replicateError) {
        logger.error(`❌ Failed to generate clip ${pair.index + 1}`, {
          error: replicateError,
          pair: pair.index,
        })
        throw new Error(
          `Failed to generate morphing clip ${pair.index + 1}: ${replicateError}`
        )
      }
    }

    if (videoClipUrls.length !== imagePairs.length) {
      throw new Error(
        `Expected ${imagePairs.length} clips, got ${videoClipUrls.length}`
      )
    }

    // ✅ Шаг 3: Скачивание сгенерированных клипов
    const downloadedClipPaths: string[] = []

    for (let i = 0; i < videoClipUrls.length; i++) {
      const videoUrl = videoClipUrls[i]
      const clipPath = path.join(tempDir, `clip_${i}.mp4`)

      logger.info(`📥 Downloading clip ${i + 1}/${videoClipUrls.length}`)

      try {
        await downloadFile(videoUrl, clipPath)
        downloadedClipPaths.push(clipPath)
        logger.info(`✅ Downloaded clip ${i + 1}: ${clipPath}`)
      } catch (downloadError) {
        logger.error(`❌ Failed to download clip ${i + 1}`, {
          error: downloadError,
          url: videoUrl,
        })
        throw new Error(`Failed to download clip ${i + 1}: ${downloadError}`)
      }
    }

    // ✅ Шаг 4: Нормализация клипов (постоянная частота кадров)
    const normalizedClipPaths: string[] = []

    for (let i = 0; i < downloadedClipPaths.length; i++) {
      const inputClip = downloadedClipPaths[i]
      const normalizedClip = path.join(tempDir, `normalized_clip_${i}.mp4`)

      logger.info(`🔧 Normalizing clip ${i + 1}/${downloadedClipPaths.length}`)

      const normalizeCommand = `ffmpeg -y -i "${inputClip}" -r 25 -c:v libx264 -preset fast "${normalizedClip}"`

      try {
        await execAsync(normalizeCommand)
        normalizedClipPaths.push(normalizedClip)
        logger.info(`✅ Normalized clip ${i + 1}: ${normalizedClip}`)
      } catch (ffmpegError) {
        logger.error(`❌ Failed to normalize clip ${i + 1}`, {
          error: ffmpegError,
          command: normalizeCommand,
        })
        throw new Error(`Failed to normalize clip ${i + 1}: ${ffmpegError}`)
      }
    }

    // ✅ Шаг 5: Склеивание клипов с плавными переходами
    const finalVideoPath = path.join(tempDir, 'final_video.mp4')

    logger.info('🎬 Combining clips with smooth transitions')

    if (normalizedClipPaths.length === 2) {
      // Простое склеивание двух клипов с crossfade
      const combineCommand = `ffmpeg -y -i "${normalizedClipPaths[0]}" -i "${normalizedClipPaths[1]}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=1:offset=4,format=yuv420p[v]" -map "[v]" -c:v libx264 -preset fast "${finalVideoPath}"`

      await execAsync(combineCommand)
    } else {
      // Для нескольких клипов создаем concat файл
      const concatFilePath = path.join(tempDir, 'concat_list.txt')
      const concatContent = normalizedClipPaths
        .map(clipPath => `file '${path.basename(clipPath)}'`)
        .join('\n')

      fs.writeFileSync(concatFilePath, concatContent)

      const combineCommand = `ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -c:v libx264 -preset fast -movflags +faststart "${finalVideoPath}"`

      await execAsync(combineCommand)
    }

    // ✅ Проверяем, что файл создался
    if (!fs.existsSync(finalVideoPath)) {
      throw new Error('Final video file was not created')
    }

    const finalVideoSize = fs.statSync(finalVideoPath).size
    logger.info('✅ [LOCAL MORPHING] Video generation completed', {
      finalVideoPath,
      fileSizeMB: (finalVideoSize / (1024 * 1024)).toFixed(2),
      telegram_id,
    })

    return finalVideoPath
  } catch (error) {
    logger.error('❌ [LOCAL MORPHING] Video generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
      tempDir,
    })
    throw error
  }
}

/**
 * Скачивание файла по URL
 */
async function downloadFile(
  url: string,
  destinationPath: string
): Promise<void> {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    timeout: 300000, // 5 минут таймаут
  })

  const writer = fs.createWriteStream(destinationPath)
  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}
