/**
 * Face Circle Composer
 *
 * Создает композицию: фоновое видео + lip-sync видео в круглой маске
 * Использует face-api.js для определения координат лица
 */

import path from 'path'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@/utils/logger'

const execAsync = promisify(exec)

// Импортируем face-api.js только при использовании (lazy import)
let faceapi: any = null
let canvas: any = null

/**
 * Интерфейс для координат лица
 */
export interface FaceCoordinates {
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
  radius: number
}

/**
 * Загружает модели face-api.js
 */
async function loadFaceDetectionModels() {
  if (!faceapi) {
    try {
      // Lazy import для ускорения загрузки
      faceapi = await import('@vladmandic/face-api')
      canvas = await import('canvas')

      const { Canvas, Image, ImageData } = canvas
      faceapi.env.monkeyPatch({ Canvas, Image, ImageData })
    } catch (error) {
      logger.warn('⚠️ [FACE DETECTION] face-api not available, using fallback', { error })
      return false
    }
  }

  const modelPath = path.join(__dirname, '../../../models/face-api')

  try {
    await fs.access(modelPath)
  } catch {
    logger.warn('⚠️ [FACE DETECTION] Models directory not found at', { modelPath })
    logger.info('📥 [FACE DETECTION] Models will be downloaded on first use')
  }

  try {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath)
    logger.info('✅ [FACE DETECTION] Models loaded successfully')
    return true
  } catch (error) {
    logger.warn('⚠️ [FACE DETECTION] Failed to load models, using fallback', { error })
    return false
  }
}

/**
 * Определяет координаты лица на изображении
 * Использует face-api.js или fallback к центру изображения
 */
export async function detectFaceCoordinates(imagePath: string): Promise<FaceCoordinates> {
  logger.info('🔍 [FACE DETECTION] Detecting face coordinates', { imagePath })

  try {
    // Пробуем загрузить модели
    const modelsLoaded = await loadFaceDetectionModels()

    if (!modelsLoaded || !faceapi || !canvas) {
      // Fallback: возвращаем центр изображения как fallback
      logger.info('🔍 [FACE DETECTION] Using fallback (center of image)')
      const fallbackCoords: FaceCoordinates = {
        x: 400,  // Примерные координаты центра
        y: 300,
        width: 200,
        height: 200,
        centerX: 500,
        centerY: 400,
        radius: 100,
      }
      return fallbackCoords
    }

    // Загружаем изображение через canvas
    const img = await canvas.loadImage(imagePath)

    // Определяем лица на изображении
    const detections = await faceapi.detectAllFaces(img)

    if (detections.length === 0) {
      logger.warn('⚠️ [FACE DETECTION] No face detected, using fallback')
      const fallbackCoords: FaceCoordinates = {
        x: 400,
        y: 300,
        width: 200,
        height: 200,
        centerX: 500,
        centerY: 400,
        radius: 100,
      }
      return fallbackCoords
    }

    // Берем первое обнаруженное лицо (самое большое)
    const face = detections.reduce((largest: any, current: any) =>
      current.box.area > largest.box.area ? current : largest
    )

    const { x, y, width, height } = face.box

    // Вычисляем центр и радиус круга
    const centerX = x + width / 2
    const centerY = y + height / 2
    const radius = Math.max(width, height) / 2

    const coordinates: FaceCoordinates = {
      x,
      y,
      width,
      height,
      centerX,
      centerY,
      radius,
    }

    logger.info('✅ [FACE DETECTION] Face detected successfully', coordinates)

    return coordinates
  } catch (error) {
    logger.warn('⚠️ [FACE DETECTION] Failed to detect face, using fallback', { error })

    // Fallback: возвращаем координаты центра
    const fallbackCoords: FaceCoordinates = {
      x: 400,
      y: 300,
      width: 200,
      height: 200,
      centerX: 500,
      centerY: 400,
      radius: 100,
    }
    return fallbackCoords
  }
}

/**
 * Создает круглую маску с использованием FFmpeg
 */
async function createCircleMask(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  outputPath: string
): Promise<string> {
  const ffmpegCommand = `ffmpeg -f lavfi -i color=c=black:s=${width}x${height}:d=1 \
    -vf "drawbox=x=${centerX - radius}:y=${centerY - radius}:w=${radius * 2}:h=${radius * 2}:color=white:t=fill,\
         format=gray,geq='lum=gt(hypot(X-${centerX},Y-${centerY}),${radius})*255'" \
    -frames:v 1 -y "${outputPath}"`

  await execAsync(ffmpegCommand)

  logger.info('✅ [CIRCLE MASK] Created', {
    width,
    height,
    center: { x: centerX, y: centerY },
    radius,
  })

  return outputPath
}

/**
 * Упрощенная версия без face detection
 * Создает круг в указанной позиции вертикального видео 9:16 с фиксированным радиусом
 * ⚠️ ВАЖНО: Фоновое видео БЕЗ ЗВУКА (флаг -an), только lip-sync аудио
 */
/**
 * Создает композицию: фоновое видео + lip-sync видео в круге (с face detection)
 * Автоматически определяет координаты лица и позиционирует круг
 */
export async function createCircleCompositionWithFaceDetection(
  backgroundVideoPath: string,
  lipSyncVideoPath: string,
  outputPath: string,
  faceImagePath?: string // Изображение для определения лица (первый кадр видео)
): Promise<string> {
  logger.info('🎬 [CIRCLE COMPOSITION WITH FACE DETECTION] Starting', {
    backgroundVideoPath,
    lipSyncVideoPath,
    outputPath,
  })

  try {
    // Получаем длительность видео
    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${lipSyncVideoPath}"`
    )
    const finalDuration = parseFloat(durationOutput.trim())

    // Извлекаем первый кадр из фонового видео для face detection
    let faceCoords: FaceCoordinates | null = null

    if (faceImagePath) {
      try {
        faceCoords = await detectFaceCoordinates(faceImagePath)
      } catch (error) {
        logger.warn('⚠️ [CIRCLE COMPOSITION] Face detection failed, using fallback', { error })
        faceCoords = null
      }
    }

    // Целевые размеры 9:16 (вертикальное видео для соцсетей)
    const targetWidth = 1080
    const targetHeight = 1920

    // Если не удалось определить лицо, используем fallback позицию
    let circleCenterX: number
    let circleCenterY: number
    let circleRadius: number

    if (faceCoords) {
      // Используем координаты лица
      const scaleX = targetWidth / faceCoords.width
      const scaleY = targetHeight / faceCoords.height
      const scale = Math.min(scaleX, scaleY)

      circleCenterX = faceCoords.centerX * scale + (targetWidth - faceCoords.width * scale) / 2
      circleCenterY = faceCoords.centerY * scale + (targetHeight - faceCoords.height * scale) / 2
      circleRadius = faceCoords.radius * scale
    } else {
      // Fallback: левый нижний угол (65% от верха)
      circleRadius = 300
      circleCenterX = circleRadius + 60 // отступ от левого края
      circleCenterY = targetHeight * 0.65 // 65% от верха
    }

    logger.info('📐 [CIRCLE COMPOSITION] Circle position', {
      centerX: circleCenterX,
      centerY: circleCenterY,
      radius: circleRadius,
      hasFaceDetection: !!faceCoords,
    })

    // Создаем круглую маску
    const maskPath = path.join(path.dirname(outputPath), 'circle_mask.png')
    await createCircleMask(targetWidth, targetHeight, circleCenterX, circleCenterY, circleRadius, maskPath)

    // FFmpeg команда для создания композиции
    // ⚠️ Background video audio is MUTED (-an flag) - only lip-sync audio is used
    const ffmpegCommand = `ffmpeg -i "${backgroundVideoPath}" -an -i "${lipSyncVideoPath}" -i "${maskPath}" \
      -filter_complex "\
        [0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2[bg]; \
        [1:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2[lipsync]; \
        [lipsync][2:v]alphamerge[masked]; \
        [bg][masked]overlay=0:0[outv]" \
      -map "[outv]" -map 1:a -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -aspect 9:16 \
      -y "${outputPath}"`

    await execAsync(ffmpegCommand)
    await fs.unlink(maskPath).catch(() => {})

    logger.info('✅ [CIRCLE COMPOSITION WITH FACE DETECTION] Created successfully', { outputPath })

    return outputPath
  } catch (error) {
    logger.error('❌ [CIRCLE COMPOSITION WITH FACE DETECTION] Failed', { error })
    throw error
  }
}

export async function createCircleCompositionSimple(
  backgroundVideoPath: string,
  lipSyncVideoPath: string,
  outputPath: string,
  circleRadius: number = 300,
  centerX?: number,
  centerY?: number
): Promise<string> {
  logger.info('🎬 [CIRCLE COMPOSITION SIMPLE] Starting simple composition', {
    backgroundVideoPath,
    lipSyncVideoPath,
    circleRadius,
  })

  try {
    // Целевые размеры 9:16 (вертикальное видео для соцсетей)
    const targetWidth = 1080
    const targetHeight = 1920

    // Центр видео (если не указан)
    const cx = centerX ?? targetWidth / 2
    const cy = centerY ?? targetHeight / 2

    // Создаем круглую маску для целевого размера
    const maskPath = path.join(path.dirname(outputPath), 'circle_mask_simple.png')
    await createCircleMask(targetWidth, targetHeight, cx, cy, circleRadius, maskPath)

    // FFmpeg команда для создания вертикального 9:16 видео
    // ⚠️ Background video audio is MUTED (-an flag) - only lip-sync audio is used
    const ffmpegCommand = `ffmpeg -i "${backgroundVideoPath}" -an -i "${lipSyncVideoPath}" -i "${maskPath}" \
      -filter_complex "\
        [0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2[bg]; \
        [1:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2[lipsync]; \
        [lipsync][2:v]alphamerge[masked]; \
        [bg][masked]overlay=0:0[outv]" \
      -map "[outv]" -map 1:a -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -aspect 9:16 \
      -y "${outputPath}"`

    await execAsync(ffmpegCommand)
    await fs.unlink(maskPath).catch(() => {})

    logger.info('✅ [CIRCLE COMPOSITION SIMPLE] Vertical 9:16 composition created', { outputPath })

    return outputPath
  } catch (error) {
    logger.error('❌ [CIRCLE COMPOSITION SIMPLE] Failed', { error })
    throw error
  }
}
