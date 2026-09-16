import fs from 'fs'
import { assertPublicRedirect } from '@/utils/sanitize'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import axios from 'axios'
import { logger } from '@/utils/logger'
import {
  ContentRefusalError,
  isContentRefusal,
} from '@/helpers/isContentRefusal'
import { replicate } from '@/core/replicate'

// Увеличиваем размер буфера до 50MB для обработки больших выводов от FFmpeg
const execAsync = (
  cmd: string
): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}

// ✅ ФУНКЦИЯ ДЛЯ ОПРЕДЕЛЕНИЯ РАЗРЕШЕНИЯ ВИДЕО
async function getVideoResolution(
  videoPath: string
): Promise<{ width: number; height: number }> {
  try {
    const command = `ffprobe -v quiet -print_format json -show_streams "${videoPath}"`
    const { stdout } = await execAsync(command)
    const data = JSON.parse(stdout)

    const videoStream = data.streams.find(
      (stream: any) => stream.codec_type === 'video'
    )
    if (!videoStream) {
      throw new Error('No video stream found')
    }

    return {
      width: parseInt(videoStream.width),
      height: parseInt(videoStream.height),
    }
  } catch (error) {
    logger.error('Failed to get video resolution', { error, videoPath })
    // Fallback к стандартному разрешению
    return { width: 1280, height: 720 }
  }
}

// ✅ ФУНКЦИЯ ДЛЯ ОПРЕДЕЛЕНИЯ ЦЕЛЕВОГО РАЗРЕШЕНИЯ
function getTargetResolution(
  width: number,
  height: number
): { width: number; height: number; aspectRatio: string } {
  const aspectRatio = width / height

  logger.info(
    `🎬 Analyzing aspect ratio: ${width}x${height} (ratio: ${aspectRatio.toFixed(
      2
    )})`
  )

  if (aspectRatio > 1.5) {
    // Горизонтальное видео (16:9 или подобное)
    return { width: 1280, height: 720, aspectRatio: '16:9 (horizontal)' }
  } else if (aspectRatio < 0.75) {
    // Вертикальное видео (9:16 или подобное)
    return { width: 720, height: 1280, aspectRatio: '9:16 (vertical)' }
  } else {
    // Квадратное или близкое к квадратному (1:1)
    return { width: 1024, height: 1024, aspectRatio: '1:1 (square)' }
  }
}

interface MorphingVideoOptions {
  imagePaths: string[]
  tempDir: string
  telegram_id: string
  // ✅ Callback для отправки промежуточных видео пользователю
  onIntermediateVideo?: (
    videoPath: string,
    clipNumber: number,
    totalClips: number
  ) => Promise<void>
  // ✅ Возобновление с определенного клипа (для восстановления после ошибок)
  resumeFromClip?: number
  // ✅ Кастомный промпт для переходов (если не указан - используется дефолтный кинематографичный)
  customPrompt?: string
}

/**
 * 🧬 Локальный процессор морфинга без Inngest
 * Использует прямые вызовы к Replicate API и FFmpeg
 */
// ✅ RETRY CONFIGURATION (УСИЛЕННЫЙ)
const MAX_RETRIES = 5 // Максимум 5 попыток для каждого клипа
const BASE_RETRY_DELAY = 3000 // Базовая задержка 3 секунды (экспоненциальное увеличение)

// ✅ ИМПОРТ UNIFIED VIDEO MODELS CONFIG
import { VIDEO_MODELS_CONFIG } from '@/config/unified-video-models.config'

// ✅ СПИСОК KLING МОДЕЛЕЙ ПОДДЕРЖИВАЮЩИХ МОРФИНГ (используем unified config)
// 🔥 КРИТИЧЕСКИ ВАЖНО: v2.1 Pro ОБЯЗАТЕЛЬНА ДЛЯ МОРФИНГА (поддерживает start_image + end_image)
// ⚠️ v2.5 Turbo Pro НЕ ПОДДЕРЖИВАЕТ МОРФИНГ - у него нет параметров start_image/end_image!
const FALLBACK_KLING_MODEL_IDS = [
  'kling-v2.1-pro', // Основная модель для морфинга (1080p, поддержка end_image)
  'kling-v1.6-pro', // Fallback 1 (старая версия Pro)
  'kling-v1.6-standard', // Fallback 2 (последний резерв)
] as const

// ✅ ПОЛУЧАЕМ КОНФИГУРАЦИИ МОДЕЛЕЙ ИЗ UNIFIED CONFIG
const FALLBACK_KLING_MODELS = FALLBACK_KLING_MODEL_IDS.map(modelId => {
  const config = VIDEO_MODELS_CONFIG[modelId]
  if (!config) {
    throw new Error(`Model config not found for morphing: ${modelId}`)
  }

  return {
    id: config.apiModel, // Используем apiModel для Replicate (например 'kwaivgi/kling-v2.1')
    configId: config.id, // ID из unified config (например 'kling-v2.1-pro')
    name: config.name,
    variant:
      config.apiSettings?.baseInput?.model_variant ||
      config.apiSettings?.baseInput?.mode ||
      'pro',
    baseInput: config.apiSettings?.baseInput || {},
    cost: 0.9, // Примерная стоимость за клип (для логирования)
    description: config.description,
  }
})

// ✅ CHECKPOINT SYSTEM (для возобновления процесса)
interface MorphingCheckpoint {
  telegram_id: string
  imagePaths: string[]
  tempDir: string
  totalClips: number
  completedClips: number[]
  lastClipIndex: number
  timestamp: number
}

// Сохранение checkpoint'а
function saveCheckpoint(checkpoint: MorphingCheckpoint): void {
  try {
    const checkpointPath = path.join(
      checkpoint.tempDir,
      'morphing_checkpoint.json'
    )
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2))
    logger.info(
      `✅ Checkpoint saved: ${checkpoint.completedClips.length}/${checkpoint.totalClips} clips done`,
      {
        telegramId: checkpoint.telegram_id,
        completedClips: checkpoint.completedClips,
      }
    )
  } catch (error) {
    logger.warn('⚠️ Failed to save checkpoint', {
      error,
      telegramId: checkpoint.telegram_id,
    })
  }
}

// Загрузка checkpoint'а
function loadCheckpoint(tempDir: string): MorphingCheckpoint | null {
  try {
    const checkpointPath = path.join(tempDir, 'morphing_checkpoint.json')
    if (fs.existsSync(checkpointPath)) {
      const data = fs.readFileSync(checkpointPath, 'utf8')
      const checkpoint = JSON.parse(data) as MorphingCheckpoint
      logger.info(
        `🔄 Checkpoint loaded: ${checkpoint.completedClips.length}/${checkpoint.totalClips} clips done`,
        {
          telegramId: checkpoint.telegram_id,
          completedClips: checkpoint.completedClips,
        }
      )
      return checkpoint
    }
  } catch (error) {
    logger.warn('⚠️ Failed to load checkpoint', { error })
  }
  return null
}

// ✅ ЭКСПОРТ ФУНКЦИИ ВОЗОБНОВЛЕНИЯ ПРОЦЕССА
export async function resumeMorphingFromCheckpoint(
  tempDir: string,
  telegram_id: string,
  onIntermediateVideo?: (
    videoPath: string,
    clipNumber: number,
    totalClips: number
  ) => Promise<void>
): Promise<string | null> {
  const checkpoint = loadCheckpoint(tempDir)
  if (!checkpoint) {
    logger.warn('🔍 No checkpoint found for resuming', {
      telegramId: telegram_id,
    })
    return null
  }

  logger.info(`🔄 Resuming morphing from checkpoint`, {
    telegramId: telegram_id,
    completedClips: checkpoint.completedClips.length,
    totalClips: checkpoint.totalClips,
    lastClipIndex: checkpoint.lastClipIndex,
  })

  // Возобновляем с того места, где остановились
  return await createMorphingVideo({
    imagePaths: checkpoint.imagePaths,
    tempDir: checkpoint.tempDir,
    telegram_id: checkpoint.telegram_id,
    onIntermediateVideo,
    resumeFromClip: checkpoint.lastClipIndex + 1,
  })
}

export async function createMorphingVideo(
  options: MorphingVideoOptions
): Promise<string> {
  const {
    imagePaths,
    tempDir,
    telegram_id,
    onIntermediateVideo,
    resumeFromClip,
  } = options

  // ✅ ПРОВЕРЯЕМ CHECKPOINT ДЛЯ ВОЗОБНОВЛЕНИЯ
  let checkpoint = loadCheckpoint(tempDir)
  let startFromClip = resumeFromClip || 0

  if (checkpoint && !resumeFromClip) {
    logger.info(
      `🔄 Found existing checkpoint, resuming from clip ${
        checkpoint.lastClipIndex + 1
      }`,
      {
        telegramId: telegram_id,
        completedClips: checkpoint.completedClips.length,
        totalClips: checkpoint.totalClips,
      }
    )
    startFromClip = checkpoint.lastClipIndex + 1
  }

  logger.info('🧬 [LOCAL MORPHING] Starting video generation', {
    imageCount: imagePaths.length,
    tempDir,
    telegram_id,
  })

  // ✅ Используем централизованный Replicate клиент из @/core/replicate
  // (ленивая инициализация с проверкой токена)

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

    // ✅ Шаг 2: Генерация морфинг клипов через Replicate Kling API (с поддержкой checkpoint)
    const videoClipUrls: string[] = []

    // Инициализируем checkpoint если его еще нет
    if (!checkpoint) {
      checkpoint = {
        telegram_id,
        imagePaths,
        tempDir,
        totalClips: imagePairs.length,
        completedClips: [],
        lastClipIndex: -1,
        timestamp: Date.now(),
      }
    }

    for (const pair of imagePairs) {
      const clipIndex = pair.index

      // ✅ ПРОПУСКАЕМ УЖЕ СОЗДАННЫЕ КЛИПЫ
      if (
        clipIndex < startFromClip ||
        checkpoint.completedClips.includes(clipIndex)
      ) {
        logger.info(
          `⏭️ Skipping already completed clip ${clipIndex + 1}/${
            imagePairs.length
          }`
        )
        // Для пропущенных клипов добавляем пустую строку (заполним при загрузке)
        videoClipUrls.push('')
        continue
      }

      logger.info(
        `🧬 Generating morph clip ${clipIndex + 1}/${imagePairs.length}`
      )

      // ✅ ГЕНЕРАЦИЯ КЛИПА С RETRY ЛОГИКОЙ (с кастомным промптом если передан)
      const videoUrl = await generateSingleClipWithRetry(
        pair,
        clipIndex + 1,
        imagePairs.length,
        options.customPrompt
      )
      videoClipUrls.push(videoUrl)

      // ✅ СОХРАНЯЕМ CHECKPOINT ПОСЛЕ КАЖДОГО УСПЕШНОГО КЛИПА
      checkpoint.completedClips.push(clipIndex)
      checkpoint.lastClipIndex = clipIndex
      checkpoint.timestamp = Date.now()
      saveCheckpoint(checkpoint)
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

      // ✅ ПРОВЕРЯЕМ, ЕСТЬ ЛИ УЖЕ СКАЧАННЫЙ ФАЙЛ
      if (fs.existsSync(clipPath)) {
        logger.info(`⏭️ File already exists, skipping download: ${clipPath}`)
        downloadedClipPaths.push(clipPath)

        // ✅ ОТПРАВЛЯЕМ УЖЕ СУЩЕСТВУЮЩИЙ КЛИП ПОЛЬЗОВАТЕЛЮ (если еще не отправляли)
        if (onIntermediateVideo && videoUrl) {
          // videoUrl не пустой = новый клип
          try {
            console.log(
              `🚀 [LOCAL PROCESSOR] НЕМЕДЛЕННО отправляю СУЩЕСТВУЮЩИЙ клип ${
                i + 1
              }/${videoClipUrls.length}!`
            )
            const callbackStart = Date.now()
            await onIntermediateVideo(clipPath, i + 1, videoClipUrls.length)
            const callbackTime = Date.now() - callbackStart
            console.log(
              `✅ [LOCAL PROCESSOR] Существующий клип отправлен за ${callbackTime}ms!`
            )
            logger.info(
              `📤 Sent existing intermediate clip ${i + 1} to user IMMEDIATELY`,
              {
                callbackTimeMs: callbackTime,
                clipPath,
              }
            )
          } catch (sendError) {
            console.log(
              `❌ [LOCAL PROCESSOR] Ошибка отправки существующего клипа ${
                i + 1
              }:`,
              sendError
            )
            logger.warn(
              `⚠️ Failed to send existing intermediate clip ${i + 1}`,
              {
                error: sendError,
                clipPath,
                telegram_id,
              }
            )
          }
        }
        continue
      }

      // ✅ ПРОПУСКАЕМ ПУСТЫЕ URL (уже созданные клипы)
      if (!videoUrl) {
        logger.warn(`⚠️ Empty video URL for clip ${i + 1}, skipping download`)
        continue
      }

      logger.info(`📥 Downloading clip ${i + 1}/${videoClipUrls.length}`)

      try {
        await downloadFile(videoUrl, clipPath)
        downloadedClipPaths.push(clipPath)
        logger.info(`✅ Downloaded clip ${i + 1}: ${clipPath}`)

        // ✅ ОТПРАВЛЯЕМ ПРОМЕЖУТОЧНОЕ ВИДЕО ПОЛЬЗОВАТЕЛЮ СРАЗУ ЖЕ!
        if (onIntermediateVideo) {
          try {
            console.log(
              `🚀 [LOCAL PROCESSOR] НЕМЕДЛЕННО вызываю callback для клипа ${
                i + 1
              }/${videoClipUrls.length}!`
            )
            const callbackStart = Date.now()
            await onIntermediateVideo(clipPath, i + 1, videoClipUrls.length)
            const callbackTime = Date.now() - callbackStart
            console.log(
              `✅ [LOCAL PROCESSOR] Callback выполнен за ${callbackTime}ms!`
            )
            logger.info(
              `📤 Sent intermediate clip ${i + 1} to user IMMEDIATELY`,
              {
                callbackTimeMs: callbackTime,
                clipPath,
              }
            )
          } catch (sendError) {
            console.log(
              `❌ [LOCAL PROCESSOR] Ошибка в callback для клипа ${i + 1}:`,
              sendError
            )
            logger.warn(`⚠️ Failed to send intermediate clip ${i + 1}`, {
              error: sendError,
              clipPath,
              telegram_id,
            })
            // Не прерываем процесс, если отправка промежуточного видео упала
          }
        }
      } catch (downloadError) {
        logger.error(`❌ Failed to download clip ${i + 1}`, {
          error: downloadError,
          url: videoUrl,
        })
        throw new Error(`Failed to download clip ${i + 1}: ${downloadError}`)
      }
    }

    // ✅ Шаг 4: Определение целевого разрешения и нормализация клипов
    const normalizedClipPaths: string[] = []
    let targetResolution: {
      width: number
      height: number
      aspectRatio: string
    } | null = null

    // Определяем целевое разрешение на основе первого клипа
    if (downloadedClipPaths.length > 0) {
      logger.info('🎯 Determining target resolution from first clip...')
      const firstClipResolution = await getVideoResolution(
        downloadedClipPaths[0]
      )
      targetResolution = getTargetResolution(
        firstClipResolution.width,
        firstClipResolution.height
      )
      logger.info(
        `✅ Target resolution selected: ${targetResolution.width}x${targetResolution.height} (${targetResolution.aspectRatio})`
      )
    }

    // Fallback если не удалось определить разрешение
    if (!targetResolution) {
      targetResolution = {
        width: 1280,
        height: 720,
        aspectRatio: '16:9 (default)',
      }
      logger.warn('⚠️ Using default resolution 1280x720')
    }

    for (let i = 0; i < downloadedClipPaths.length; i++) {
      const inputClip = downloadedClipPaths[i]
      const normalizedClip = path.join(tempDir, `normalized_clip_${i}.mp4`)

      logger.info(
        `🔧 Normalizing clip ${i + 1}/${downloadedClipPaths.length} to ${
          targetResolution.width
        }x${targetResolution.height}`
      )

      // ✅ УМНАЯ НОРМАЛИЗАЦИЯ: Адаптируется под соотношение сторон первого клипа
      const normalizeCommand = `ffmpeg -y -i "${inputClip}" -vf "scale=${targetResolution.width}:${targetResolution.height}:force_original_aspect_ratio=decrease,pad=${targetResolution.width}:${targetResolution.height}:(ow-iw)/2:(oh-ih)/2,setsar=1" -r 25 -c:v libx264 -preset fast "${normalizedClip}"`

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
      // ✅ ИСПРАВЛЕНО: Используем полные абсолютные пути вместо basename
      const concatContent = normalizedClipPaths
        .map(clipPath => `file '${clipPath}'`)
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

    // ✅ УДАЛЯЕМ CHECKPOINT ПОСЛЕ УСПЕШНОГО ЗАВЕРШЕНИЯ
    try {
      const checkpointPath = path.join(tempDir, 'morphing_checkpoint.json')
      if (fs.existsSync(checkpointPath)) {
        fs.unlinkSync(checkpointPath)
        logger.info('🗑️ Checkpoint cleaned up after successful completion', {
          telegramId: telegram_id,
        })
      }
    } catch (cleanupError) {
      logger.warn('⚠️ Failed to cleanup checkpoint', {
        error: cleanupError,
        telegramId: telegram_id,
      })
    }

    return finalVideoPath
  } catch (error) {
    /*
     * The refusal thrown by generateSingleClipWithRetry travels up through
     * here, so demoting that one site alone would have removed one push
     * notification out of two and left the survivor wearing the more
     * misleading title of the pair. Ask the error what it was before choosing
     * the level: a content refusal is the customer's photographs, everything
     * else -- a failed ffmpeg, a dead download, an empty Replicate output --
     * is ours and still pages.
     */
    const contentRefusal = isContentRefusal(error)
    logger[contentRefusal ? 'warn' : 'error'](
      contentRefusal
        ? '🛡️ [LOCAL MORPHING] Content refused by the provider'
        : '❌ [LOCAL MORPHING] Video generation failed',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegram_id,
        tempDir,
      }
    )
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
    // SSRF: re-check each redirect hop against the private/metadata blocklist.
    // This is the fourth downloadFile in the tree; the two in helpers carry
    // this guard and the two outside them did not.
    beforeRedirect: assertPublicRedirect,
  })

  const writer = fs.createWriteStream(destinationPath)
  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    // Guard the SOURCE stream: axios responseType:'stream' does not attach an
    // 'error' listener to response.data, so a mid-stream ECONNRESET/timeout emits
    // an unhandled 'error' -> uncaughtException -> the global handler process.exit(1)
    // kills the whole multi-bot process. Reject (and destroy the writer) instead.
    response.data.on('error', (streamErr: Error) => {
      writer.destroy()
      reject(streamErr)
    })
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
  totalClips: number,
  customPrompt?: string
): Promise<string> {
  // ✅ Используем централизованный Replicate клиент из @/core/replicate
  // (ленивая инициализация с проверкой токена)

  let currentModelIndex = 0 // Начинаем с первой модели

  // ✅ УЛУЧШЕННЫЙ ДЕФОЛТНЫЙ ПРОМПТ: Кинематографичный smooth transition (на основе исследования best practices 2025)
  const defaultPrompt =
    'smooth cinematic transition, elegant morphing between frames, constant camera movement, soft cinematic lighting, professional cinematography, motion blur, 4k quality'

  const baseInput: {
    start_image: any
    end_image: any
    prompt: string
    duration: number
    model_variant?: string // Для v2.1: 'pro' или 'standard'
  } = {
    start_image: pair.start,
    end_image: pair.end,
    prompt: customPrompt || defaultPrompt, // ✅ Используем кастомный промпт если передан, иначе дефолтный
    duration: 5, // 5 секунд
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const currentModelInfo = FALLBACK_KLING_MODELS[currentModelIndex]
      const currentModel = currentModelInfo.id

      // Адаптируем параметры под разные модели Kling
      // ✅ Копируем baseInput из конфига модели + добавляем model_variant
      const input: any = { ...baseInput, ...currentModelInfo.baseInput }

      // ✅ УНИВЕРСАЛЬНАЯ ЛОГИКА: используем model_variant из unified config
      if (currentModelInfo.variant) {
        input.model_variant =
          currentModelInfo.variant === 'standard'
            ? 'std'
            : currentModelInfo.variant
        // Для обратной совместимости также передаем mode (если API ожидает его)
        input.mode = input.model_variant
        logger.info(
          `🆕 Using ${currentModelInfo.name} with model_variant: ${input.model_variant}`,
          {
            modelId: currentModelInfo.configId,
            apiModel: currentModel,
          }
        )
      }

      logger.info(
        `🔄 Attempt ${attempt}/${MAX_RETRIES} for clip ${clipNumber}/${totalClips} using model: ${currentModelInfo.name} (cost: $${currentModelInfo.cost}, ${currentModelInfo.description})`
      )

      const output = await replicate.run(currentModel, { input })

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

      // 🛡️ ОБРАБОТКА ОШИБКИ ЧУВСТВИТЕЛЬНОГО КОНТЕНТА (E005) - СНАЧАЛА БОЛЬШЕ ПОПЫТОК!
      if (
        errorMessage.includes('flagged as sensitive') ||
        errorMessage.includes('E005')
      ) {
        logger.warn(
          `🛡️ Content filtered by ${FALLBACK_KLING_MODELS[currentModelIndex].name} (E005) - attempt ${attempt}/${MAX_RETRIES}`,
          errorDetails
        )

        // ✅ СНАЧАЛА ИСЧЕРПЫВАЕМ ВСЕ ПОПЫТКИ НА ТЕКУЩЕЙ МОДЕЛИ
        if (attempt < MAX_RETRIES) {
          logger.info(
            `⏳ Retrying with same model ${
              FALLBACK_KLING_MODELS[currentModelIndex].name
            } (${attempt + 1}/${MAX_RETRIES}) - E005 can be temporary`
          )
          // Продолжаем цикл для следующей попытки
        } else {
          // ✅ ТОЛЬКО ПОСЛЕ 5 ПОПЫТОК - ПРОБУЕМ СЛЕДУЮЩУЮ МОДЕЛЬ!
          if (currentModelIndex < FALLBACK_KLING_MODELS.length - 1) {
            currentModelIndex++
            const nextModelInfo = FALLBACK_KLING_MODELS[currentModelIndex]
            logger.info(
              `🔄 All ${MAX_RETRIES} attempts failed for ${
                FALLBACK_KLING_MODELS[currentModelIndex - 1].name
              }. Switching to: ${nextModelInfo.name} (cost: $${
                nextModelInfo.cost
              }, ${nextModelInfo.description})`
            )

            // ✅ СБРАСЫВАЕМ СЧЕТЧИК ПОПЫТОК ДЛЯ НОВОЙ МОДЕЛИ
            attempt = 0 // будет инкрементирован в начале цикла
            continue
          } else {
            // ❌ ВСЕ МОДЕЛИ KLING ИСЧЕРПАНЫ - БРОСАЕМ ФИНАЛЬНУЮ ОШИБКУ
            /*
             * The same fact as the warn one rung up, at the end of the ladder
             * instead of the middle of it, and the level should not change
             * because the ladder ran out. Every logger.error is a push to the
             * owner's phone; this one said a safety filter had refused a
             * stranger's photographs after the machinery had done everything
             * it was built to do -- MAX_RETRIES on every model in
             * FALLBACK_KLING_MODELS. The customer is told exactly what to try
             * instead, three lines below.
             */
            logger.warn('🛡️ All Kling models rejected content (E005)', {
              ...errorDetails,
              attemptedModels: FALLBACK_KLING_MODELS.slice(
                0,
                currentModelIndex + 1
              ),
            })

            const userErrorRu =
              '🛡️ Ваши изображения не подходят для создания Infinity Морфинга.\n\n' +
              '📋 Возможные причины:\n' +
              '• Изображения содержат лица людей\n' +
              '• Защищенный контент (персонажи, знаменитости)\n' +
              '• Автоматические фильтры безопасности\n\n' +
              '💡 Решение: Попробуйте использовать другие изображения (пейзажи, предметы, абстракции)\n' +
              '🤖 Модель: Kling v2.1 Pro (новейшая версия)'

            const userErrorEn =
              '🛡️ Your images are not suitable for creating Infinity Morphing.\n\n' +
              '📋 Possible reasons:\n' +
              '• Images contain human faces\n' +
              '• Protected content (characters, celebrities)\n' +
              '• Automatic security filters\n\n' +
              '💡 Solution: Try using different images (landscapes, objects, abstractions)\n' +
              '🤖 Model: Kling v2.1 Pro (latest version)'

            /*
             * Typed, not merely worded. The message this carries is product
             * copy for the customer -- it names no error code, so the outer
             * catch cannot read a refusal out of it and used to page on it as
             * an unexplained generation failure. The class carries the verdict
             * we already made here, right where we read the provider's.
             */
            throw new ContentRefusalError(
              `${userErrorRu}\n\n---\n\n${userErrorEn}`
            )
          }
        }
      }

      // 🔄 RETRY ДЛЯ ДРУГИХ ОШИБОК с экспоненциальной задержкой
      if (attempt < MAX_RETRIES) {
        const retryDelay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1) // Экспоненциальная задержка
        logger.warn(
          `⚠️ Attempt ${attempt} failed, retrying in ${retryDelay}ms... (exponential backoff)`,
          errorDetails
        )

        // Пауза перед следующей попыткой (экспоненциально увеличивается)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        continue
      }

      // ❌ ФИНАЛЬНАЯ ОШИБКА ПОСЛЕ ВСЕХ ПОПЫТОК
      logger.error(
        `❌ All attempts failed for clip ${clipNumber}`,
        errorDetails
      )

      const finalErrorRu =
        `❌ Не удалось создать Infinity Морфинг после ${MAX_RETRIES} попыток.\n\n` +
        `🤖 Модель: Kling v2.1 Pro (новейшая версия)\n` +
        `💡 Попробуйте:\n` +
        `• Использовать другие изображения\n` +
        `• Перезапустить процесс позже\n` +
        `• Обратиться в поддержку`

      const finalErrorEn =
        `❌ Failed to create Infinity Morphing after ${MAX_RETRIES} attempts.\n\n` +
        `🤖 Model: Kling v2.1 Pro (latest version)\n` +
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
