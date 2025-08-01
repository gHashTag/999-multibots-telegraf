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
// ✅ RETRY CONFIGURATION
const MAX_RETRIES = 2 // Максимум 2 попытки для каждого клипа
const RETRY_DELAY = 3000 // 3 секунды между попытками

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

      // ✅ ГЕНЕРАЦИЯ КЛИПА С RETRY ЛОГИКОЙ
      const videoUrl = await generateSingleClipWithRetry(
        pair,
        pair.index + 1,
        imagePairs.length
      )
      videoClipUrls.push(videoUrl)
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

/**
 * ✅ ГЕНЕРАЦИЯ ОДНОГО КЛИПА С RETRY ЛОГИКОЙ И УЛУЧШЕННЫМИ ОШИБКАМИ
 */
async function generateSingleClipWithRetry(
  pair: any,
  clipNumber: number,
  totalClips: number
): Promise<string> {
  const Replicate = require('replicate')
  const replicate: ReplicateClient = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  })

  const input = {
    start_image: pair.start,
    end_image: pair.end,
    prompt: 'cinematic video, beautiful, hd, 4k, morphing effect',
    duration: 5, // 5 секунд
    mode: 'pro',
    cfg_scale: 0.5,
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(
        `🔄 Attempt ${attempt}/${MAX_RETRIES} for clip ${clipNumber}/${totalClips}`
      )

      const output = await replicate.run('kwaivgi/kling-v1.6-pro', { input })

      // Результат может быть массивом URL или одним URL
      const videoUrl = Array.isArray(output) ? output[0] : output

      if (!videoUrl) {
        throw new Error(`Empty output from Replicate for clip ${clipNumber}`)
      }

      logger.info(`✅ Generated clip ${clipNumber}: ${videoUrl}`)
      return videoUrl
    } catch (replicateError) {
      const errorMessage =
        replicateError instanceof Error
          ? replicateError.message
          : String(replicateError)

      // ✅ ДЕТАЛЬНАЯ ОБРАБОТКА ОШИБОК
      const errorDetails = {
        attempt,
        maxRetries: MAX_RETRIES,
        clipNumber,
        totalClips,
        error: errorMessage,
        pair: pair.index,
      }

      // 🛡️ ОБРАБОТКА ОШИБКИ ЧУВСТВИТЕЛЬНОГО КОНТЕНТА (E005)
      if (
        errorMessage.includes('flagged as sensitive') ||
        errorMessage.includes('E005')
      ) {
        logger.error(`🛡️ Content filtered by Kling API (E005)`, errorDetails)

        // ❌ НЕ РЕТРАИТЬ ПРИ E005 - это не временная ошибка
        const userErrorRu =
          '🛡️ Ваши изображения были отклонены системой безопасности Kling AI.\n\n' +
          '📋 Возможные причины:\n' +
          '• Изображения содержат лица людей\n' +
          '• Защищенный контент (персонажи, знаменитости)\n' +
          '• Автоматические фильтры безопасности\n\n' +
          '💡 Решение: Попробуйте использовать другие изображения (пейзажи, предметы, абстракции)'

        const userErrorEn =
          '🛡️ Your images were rejected by Kling AI security system.\n\n' +
          '📋 Possible reasons:\n' +
          '• Images contain human faces\n' +
          '• Protected content (characters, celebrities)\n' +
          '• Automatic security filters\n\n' +
          '💡 Solution: Try using different images (landscapes, objects, abstractions)'

        throw new Error(`${userErrorRu}\n\n---\n\n${userErrorEn}`)
      }

      // 🔄 RETRY ДЛЯ ДРУГИХ ОШИБОК
      if (attempt < MAX_RETRIES) {
        logger.warn(
          `⚠️ Attempt ${attempt} failed, retrying in ${RETRY_DELAY}ms...`,
          errorDetails
        )

        // Пауза перед следующей попыткой
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        continue
      }

      // ❌ ФИНАЛЬНАЯ ОШИБКА ПОСЛЕ ВСЕХ ПОПЫТОК
      logger.error(
        `❌ All attempts failed for clip ${clipNumber}`,
        errorDetails
      )

      const finalErrorRu =
        `❌ Не удалось создать видео переход ${clipNumber}/${totalClips} после ${MAX_RETRIES} попыток.\n\n` +
        `🔍 Детали ошибки: ${errorMessage}\n\n` +
        `💡 Попробуйте:\n` +
        `• Использовать другие изображения\n` +
        `• Перезапустить процесс позже\n` +
        `• Обратиться в поддержку`

      const finalErrorEn =
        `❌ Failed to create video transition ${clipNumber}/${totalClips} after ${MAX_RETRIES} attempts.\n\n` +
        `🔍 Error details: ${errorMessage}\n\n` +
        `💡 Try to:\n` +
        `• Use different images\n` +
        `• Restart the process later\n` +
        `• Contact support`

      throw new Error(`${finalErrorRu}\n\n---\n\n${finalErrorEn}`)
    }
  }

  // Этот код никогда не должен выполниться
  throw new Error('Unexpected error in retry logic')
}
