/**
 * AI Reels Circle Composer
 *
 * Создает композицию для Шаблона 1: Фоновое видео + Lip-sync в круге
 * С использованием face detection для определения области лица
 *
 * Логика:
 * 1. Извлекаем первый кадр из lip-sync видео
 * 2. Определяем координаты лица (face-api.js)
 * 3. Кадрируем область с лицом в квадрат 400x400
 * 4. Создаем круглую маску с альфа-каналом
 * 5. Накладываем круг на фоновое видео
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

// Простой logger для тестирования
const logger = {
  info: (msg: string, data?: any) => console.log('ℹ️ ', msg, data || ''),
  warn: (msg: string, data?: any) => console.warn('⚠️ ', msg, data || ''),
  error: (msg: string, data?: any) => console.error('❌ ', msg, data || ''),
}

const execAsync = promisify(exec)

// Импортируем face-api.js и canvas
let faceapi: any = null
let canvasLib: any = null

/**
 * Интерфейс для координат лица
 */
export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Загружает модели face-api.js
 */
async function loadFaceApi(): Promise<boolean> {
  if (faceapi && canvasLib) {
    return true
  }

  try {
    logger.info('📥 [AI REELS COMPOSER] Loading face-api models...')

    faceapi = await import('@vladmandic/face-api')
    canvasLib = await import('canvas')

    const { Canvas, Image, ImageData } = canvasLib
    faceapi.env.monkeyPatch({ Canvas, Image, ImageData })

    const modelPath = path.join(process.cwd(), 'models/face-api')

    try {
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath)
      logger.info('✅ [AI REELS COMPOSER] Face-api models loaded')
      return true
    } catch (modelError) {
      logger.warn('⚠️ [AI REELS COMPOSER] Models not found, will use fallback', { modelError })
      return false
    }
  } catch (error) {
    logger.warn('⚠️ [AI REELS COMPOSER] Failed to load face-api', { error })
    return false
  }
}

/**
 * Определяет координаты лица на изображении
 */
async function detectFace(imagePath: string): Promise<FaceBox | null> {
  logger.info('🔍 [AI REELS COMPOSER] Detecting face on image', { imagePath })

  try {
    const faceApiLoaded = await loadFaceApi()

    if (!faceApiLoaded) {
      logger.info('🔍 [AI REELS COMPOSER] Using fallback coordinates (center of image)')
      // Fallback: центр изображения как квадрат
      return {
        x: 200,
        y: 200,
        width: 300,
        height: 300,
      }
    }

    const img = await canvasLib.loadImage(imagePath)
    const detections = await faceapi.detectAllFaces(img)

    if (detections.length === 0) {
      logger.warn('⚠️ [AI REELS COMPOSER] No face detected, using fallback')
      return {
        x: 200,
        y: 200,
        width: 300,
        height: 300,
      }
    }

    // Берем первое обнаруженное лицо (самое большое)
    const face = detections.reduce((largest: any, current: any) =>
      current.box.area > largest.box.area ? current : largest
    )

    const { x, y, width, height } = face.box

    logger.info('✅ [AI REELS COMPOSER] Face detected', { x, y, width, height })

    return { x, y, width, height }
  } catch (error) {
    logger.warn('⚠️ [AI REELS COMPOSER] Face detection failed, using fallback', { error })
    return {
      x: 200,
      y: 200,
      width: 300,
      height: 300,
    }
  }
}

/**
 * Создает композицию: фоновое видео + lip-sync видео в круге
 * Lip-sync кадрируется по области лица с помощью face detection
 */
export async function createAiReelsCircleComposition(
  backgroundVideoPath: string,
  lipSyncVideoPath: string,
  outputPath: string,
  options?: {
    circleSize?: number // Размер круга (по умолчанию 400)
    circlePosition?: 'bottom-center' | 'center' | 'top-center' // Позиция круга
    duration?: number // Длительность итогового видео
  }
): Promise<string> {
  const {
    circleSize = 400,
    circlePosition = 'bottom-center',
    duration
  } = options || {}

  logger.info('🎬 [AI REELS COMPOSER] Starting composition', {
    backgroundVideoPath,
    lipSyncVideoPath,
    outputPath,
    circleSize,
    circlePosition,
  })

  try {
    // Создаем временную директорию
    const tempDir = path.join(path.dirname(outputPath), 'temp_composition')
    await fs.mkdir(tempDir, { recursive: true })

    // 1. Извлекаем первый кадр из lip-sync видео для face detection
    const firstFramePath = path.join(tempDir, 'first_frame.jpg')
    const extractFrameCommand = `ffmpeg -y -i "${lipSyncVideoPath}" -vf "select=eq(n\,0)" -vframes 1 "${firstFramePath}"`
    await execAsync(extractFrameCommand)

    logger.info('📸 [AI REELS COMPOSER] First frame extracted', { firstFramePath })

    // 2. Определяем координаты лица
    const faceBox = await detectFace(firstFramePath)

    // 3. Создаем круглую маску нужного размера
    const maskPath = path.join(tempDir, 'circle_mask.png')
    const maskCommand = `ffmpeg -y -f lavfi -i color=white:s=${circleSize}x${circleSize}:d=1 \\
      -vf "format=gray,geq='lum=gt(hypot(X-${circleSize/2},Y-${circleSize/2}),${circleSize/2})*255'" \\
      -frames:v 1 "${maskPath}"`
    await execAsync(maskCommand)

    // 4. Создаем композицию с face detection
    const targetWidth = 1080
    const targetHeight = 1920

    // Позиция круга
    let overlayX = (targetWidth - circleSize) / 2
    let overlayY = targetHeight * 0.75 // 75% от верха (снизу по центру)

    if (circlePosition === 'center') {
      overlayY = (targetHeight - circleSize) / 2
    } else if (circlePosition === 'top-center') {
      overlayY = targetHeight * 0.15
    }

    logger.info('📐 [AI REELS COMPOSER] Circle position', {
      x: overlayX,
      y: overlayY,
      size: circleSize,
    })

    // FFmpeg команда с face detection кадрированием
    // Вырезаем квадратик ПО ЛИЦУ (НЕ масштабируем!)
    const cropFilter = faceBox
      ? `crop=${circleSize}:${circleSize}:${faceBox.x}:${faceBox.y}`
      : `crop=${circleSize}:${circleSize}:168:456` // Центр lip-sync видео

    const ffmpegCommand = `ffmpeg -y \\
      -i "${backgroundVideoPath}" \\
      -i "${lipSyncVideoPath}" \\
      -i "${maskPath}" \\
      -filter_complex \\
      "[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2[bg]; \\
       [1:v]${cropFilter},format=yuva420p[sq]; \\
       [sq][2:v]alphamerge[circle]; \\
       [bg][circle]overlay=${overlayX}:${overlayY}[outv]" \\
      -map "[outv]" \\
      -map 1:a \\
      -c:v libx264 \\
      -preset fast \\
      -crf 23 \\
      -c:a aac \\
      -b:a 192k \\
      ${duration ? `-t ${duration}` : ''} \\
      "${outputPath}"`

    logger.info('⚙️ [AI REELS COMPOSER] Running FFmpeg...')
    await execAsync(ffmpegCommand, { timeout: 120000 })

    // Очищаем временные файлы
    await fs.unlink(firstFramePath).catch(() => {})
    await fs.unlink(maskPath).catch(() => {})
    await fs.rmdir(tempDir).catch(() => {})

    logger.info('✅ [AI REELS COMPOSER] Composition created successfully', { outputPath })

    return outputPath
  } catch (error) {
    logger.error('❌ [AI REELS COMPOSER] Failed to create composition', { error })
    throw error
  }
}

export default createAiReelsCircleComposition
