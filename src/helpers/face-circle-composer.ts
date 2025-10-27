/**
 * Face Circle Composer
 *
 * Создает композицию: фоновое видео + lip-sync видео в круглой маске поверх лица
 *
 * Использует face-api.js для определения координат лица на изображении,
 * затем создает FFmpeg композицию с круглой маской.
 *
 * SMART OFFSET: Автоматически определяет оптимальное смещение круга
 * в зависимости от положения лица на кадре.
 */

import * as faceapi from 'face-api.js'
import * as canvas from 'canvas'
import * as tf from '@tensorflow/tfjs-node'
import path from 'path'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@/utils/logger'

const execAsync = promisify(exec)

// Настройка canvas для face-api.js
const { Canvas, Image, ImageData } = canvas
// @ts-ignore
faceapi.env.monkeyPatch({ Canvas, Image, ImageData })

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
 * Автоматический умный offset для круга
 */
interface SmartOffset {
  x: number
  y: number
  reason: string // Почему выбрали этот offset
}

/**
 * Интерфейс для параметров композиции
 */
export interface CircleCompositionParams {
  backgroundVideoPath: string
  lipSyncVideoPath: string
  faceImagePath: string
  outputPath: string
  circleMargin?: number // Дополнительное пространство вокруг лица (px)
}

/**
 * Загружает модели face-api.js
 */
async function loadFaceDetectionModels() {
  const modelPath = path.join(__dirname, '../../models/face-api')

  // Проверяем существование директории с моделями
  try {
    await fs.access(modelPath)
  } catch {
    // Создаем директорию, если не существует
    await fs.mkdir(modelPath, { recursive: true })
    logger.warn('⚠️ [FACE DETECTION] Models directory created. Please download models manually.')
    throw new Error(
      `Face detection models not found at ${modelPath}. ` +
        `Please download models from https://github.com/justadudewhohacks/face-api.js/tree/master/weights`
    )
  }

  // Загружаем модель SSD MobileNet V1 (быстрая и точная)
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath)

  logger.info('✅ [FACE DETECTION] Models loaded successfully')
}

/**
 * Вычисляет автоматический offset для выравнивания круга по левому нижнему углу
 *
 * НОВАЯ ЛОГИКА:
 * - Круг позиционируется не слишком низко - на 60% высоты экрана от верха
 * - Отступ слева - с учетом радиуса + padding
 */
function calculateBottomLeftOffset(
  faceCenter: { x: number; y: number },
  faceRadius: number,
  imageSize: { width: number; height: number },
  targetSize: { width: number; height: number },
  scaledRadius: number
): SmartOffset {
  const padding = 60 // Увеличенный отступ от краев

  // Целевая позиция: не в самом низу, а на 65% высоты от верха
  const targetCenterX = scaledRadius + padding
  const targetCenterY = targetSize.height * 0.65 // 65% от верха = выше чем в самом низу

  // Масштабируем координаты лица
  const scaleX = targetSize.width / imageSize.width
  const scaleY = targetSize.height / imageSize.height
  const scale = Math.min(scaleX, scaleY)

  // Текущая позиция лица после масштабирования (без offset)
  const currentCenterX = faceCenter.x * scale + (targetSize.width - imageSize.width * scale) / 2
  const currentCenterY = faceCenter.y * scale + (targetSize.height - imageSize.height * scale) / 2

  // Вычисляем offset чтобы переместить лицо в нужную позицию
  const offsetX = targetCenterX - currentCenterX
  const offsetY = targetCenterY - currentCenterY

  return {
    x: Math.round(offsetX),
    y: Math.round(offsetY),
    reason: `bottom-left (65% height) alignment (x:${Math.round(offsetX)}, y:${Math.round(offsetY)})`,
  }
}

/**
 * Определяет координаты лица на изображении
 */
export async function detectFaceCoordinates(imagePath: string): Promise<FaceCoordinates> {
  logger.info('🔍 [FACE DETECTION] Detecting face coordinates', { imagePath })

  try {
    // Загружаем модели (если еще не загружены)
    if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
      await loadFaceDetectionModels()
    }

    // Загружаем изображение через canvas
    const img = await canvas.loadImage(imagePath)

    // Определяем лица на изображении
    const detections = await faceapi.detectAllFaces(img as any)

    if (detections.length === 0) {
      throw new Error('No face detected in the image')
    }

    // Берем первое обнаруженное лицо (самое большое)
    const face = detections.reduce((largest, current) =>
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
    logger.error('❌ [FACE DETECTION] Failed to detect face', { error })
    throw error
  }
}

/**
 * Создает круглую маску для видео с anti-aliasing
 * Возвращает путь к временному файлу маски
 */
async function createCircleMask(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  outputPath: string
): Promise<string> {
  // Создаем canvas с прозрачным фоном (2x для anti-aliasing)
  const scale = 2
  const maskCanvas = canvas.createCanvas(width * scale, height * scale)
  const ctx = maskCanvas.getContext('2d')

  // Включаем anti-aliasing
  ctx.imageSmoothingEnabled = true
  ;(ctx as any).imageSmoothingQuality = 'high' // TypeScript doesn't have this property in canvas types

  // Заливаем черным цветом (прозрачная зона)
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, width * scale, height * scale)

  // Рисуем белый круг (видимая зона) с anti-aliasing
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(centerX * scale, centerY * scale, radius * scale, 0, Math.PI * 2)
  ctx.fill()

  // Масштабируем обратно для smooth edges
  const finalCanvas = canvas.createCanvas(width, height)
  const finalCtx = finalCanvas.getContext('2d')
  finalCtx.imageSmoothingEnabled = true
  ;(finalCtx as any).imageSmoothingQuality = 'high' // TypeScript doesn't have this property in canvas types
  finalCtx.drawImage(maskCanvas, 0, 0, width, height)

  // Сохраняем маску как PNG
  const buffer = finalCanvas.toBuffer('image/png')
  await fs.writeFile(outputPath, buffer)

  logger.info('✅ [FACE DETECTION] Circle mask created with anti-aliasing', {
    outputPath,
    centerX,
    centerY,
    radius,
  })

  return outputPath
}

/**
 * Создает композицию: фоновое видео + lip-sync в круге
 */
export async function createCircleComposition(
  params: CircleCompositionParams
): Promise<string> {
  const {
    backgroundVideoPath,
    lipSyncVideoPath,
    faceImagePath,
    outputPath,
    circleMargin = 20,
  } = params

  logger.info('🎬 [CIRCLE COMPOSITION] Starting composition creation', params)

  try {
    // 1. Определяем координаты лица на изображении
    const faceCoords = await detectFaceCoordinates(faceImagePath)

    // Добавляем margin к радиусу
    const radius = faceCoords.radius + circleMargin

    // 2. Получаем размеры фонового видео
    const { stdout: probeOutput } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${backgroundVideoPath}"`
    )
    const [bgWidth, bgHeight] = probeOutput.trim().split('x').map(Number)

    // 3. Создаем круглую маску
    const maskPath = path.join(path.dirname(outputPath), 'circle_mask.png')
    await createCircleMask(bgWidth, bgHeight, faceCoords.centerX, faceCoords.centerY, radius, maskPath)

    // 4. Создаем FFmpeg фильтр для композиции (9:16 вертикальное видео)
    //
    // Логика:
    // - Масштабируем фоновое видео до 9:16 (1080x1920 для Full HD)
    // - Масштабируем lip-sync видео до 9:16
    // - Применяем круглую маску к lip-sync видео
    // - Накладываем masked lip-sync поверх фонового видео
    const targetWidth = 1080
    const targetHeight = 1920

    const ffmpegCommand = `ffmpeg -i "${backgroundVideoPath}" -i "${lipSyncVideoPath}" -i "${maskPath}" \
      -filter_complex "\
        [0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2[bg]; \
        [1:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2[lipsync]; \
        [lipsync][2:v]alphamerge[masked]; \
        [bg][masked]overlay=0:0[outv]" \
      -map "[outv]" -map 1:a? -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k \
      -y "${outputPath}"`

    logger.info('🔧 [CIRCLE COMPOSITION] Running FFmpeg command', {
      command: ffmpegCommand.substring(0, 200) + '...',
    })

    // 5. Выполняем FFmpeg команду
    await execAsync(ffmpegCommand)

    // 6. Удаляем временную маску
    await fs.unlink(maskPath).catch(() => {})

    logger.info('✅ [CIRCLE COMPOSITION] Composition created successfully', {
      outputPath,
    })

    return outputPath
  } catch (error) {
    logger.error('❌ [CIRCLE COMPOSITION] Failed to create composition', { error })
    throw error
  }
}

/**
 * Извлекает первый кадр из видео
 */
async function extractFirstFrame(videoPath: string, outputPath: string): Promise<string> {
  const ffmpegCommand = `ffmpeg -i "${videoPath}" -vframes 1 -f image2 -y "${outputPath}"`

  await execAsync(ffmpegCommand)

  logger.info('✅ [FACE DETECTION] First frame extracted', { videoPath, outputPath })

  return outputPath
}

/**
 * Версия с УМНОЙ автоматической детекцией лица и offset
 * Создает круг вокруг лица человека на фоновом видео в формате 9:16
 *
 * ✅ Автоматически определяет положение лица
 * ✅ Автоматически вычисляет оптимальный offset
 * ✅ Динамический размер круга (процент от размера лица)
 */
export async function createCircleCompositionWithFaceDetection(
  backgroundVideoPath: string,
  lipSyncVideoPath: string,
  outputPath: string,
  marginPercent: number = 80 // Процент от размера лица (увеличено для более крупного круга)
): Promise<string> {
  logger.info('🎬 [CIRCLE COMPOSITION WITH SMART OFFSET] Starting', {
    backgroundVideoPath,
    lipSyncVideoPath,
    marginPercent,
  })

  try {
    // 1. Извлекаем первый кадр из LIP-SYNC видео (где нужно найти лицо для вырезки)
    const firstFramePath = path.join(path.dirname(outputPath), 'lipsync_first_frame.jpg')
    await extractFirstFrame(lipSyncVideoPath, firstFramePath)

    logger.info('🔍 [CIRCLE COMPOSITION] Extracting face from lip-sync video frame')

    // 2. Определяем координаты лица на lip-sync видео
    const faceCoords = await detectFaceCoordinates(firstFramePath)

    logger.info('✅ [CIRCLE COMPOSITION] Face detected on lip-sync video', {
      center: { x: faceCoords.centerX, y: faceCoords.centerY },
      radius: faceCoords.radius,
    })

    // 3. Получаем длительность обоих видео
    const { stdout: bgDurationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${backgroundVideoPath}"`
    )
    const { stdout: lipDurationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${lipSyncVideoPath}"`
    )

    const bgDuration = parseFloat(bgDurationOutput.trim())
    const lipDuration = parseFloat(lipDurationOutput.trim())
    const finalDuration = Math.min(bgDuration, lipDuration) // Используем меньшую длительность

    logger.info('⏱️ [CIRCLE COMPOSITION] Video durations', {
      background: bgDuration,
      lipsync: lipDuration,
      final: finalDuration,
    })

    // 4. Целевые размеры 9:16
    const targetWidth = 1080
    const targetHeight = 1920

    // 5. Получаем размеры lip-sync видео
    const { stdout: lipSyncSizeOutput } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${lipSyncVideoPath}"`
    )
    const [lipSyncWidth, lipSyncHeight] = lipSyncSizeOutput.trim().split('x').map(Number)

    // 6. Масштабируем координаты лица к целевым размерам 9:16
    const scaleX = targetWidth / lipSyncWidth
    const scaleY = targetHeight / lipSyncHeight
    const scale = Math.min(scaleX, scaleY) // Сохраняем пропорции

    // Динамический margin: процент от размера лица
    const dynamicMargin = (faceCoords.radius * scale * marginPercent) / 100
    const scaledRadius = faceCoords.radius * scale + dynamicMargin

    // 7. ⚡ АВТОМАТИЧЕСКИЙ OFFSET для выравнивания по левому нижнему углу
    const smartOffset = calculateBottomLeftOffset(
      { x: faceCoords.centerX, y: faceCoords.centerY },
      faceCoords.radius,
      { width: lipSyncWidth, height: lipSyncHeight },
      { width: targetWidth, height: targetHeight },
      scaledRadius
    )

    logger.info('🧠 [BOTTOM-LEFT ALIGNMENT] Calculated automatic offset', {
      offset: { x: smartOffset.x, y: smartOffset.y },
      reason: smartOffset.reason,
    })

    // Координаты лица БЕЗ offset (для создания маски ВОКРУГ ЛИЦА)
    const faceCenterXScaled = faceCoords.centerX * scale + (targetWidth - lipSyncWidth * scale) / 2
    const faceCenterYScaled = faceCoords.centerY * scale + (targetHeight - lipSyncHeight * scale) / 2

    // Координаты для позиционирования круга в левом нижнем углу (с offset)
    const finalCenterX = faceCenterXScaled + smartOffset.x
    const finalCenterY = faceCenterYScaled + smartOffset.y

    logger.info('📐 [CIRCLE COMPOSITION] Face and positioning coordinates', {
      originalSize: { width: lipSyncWidth, height: lipSyncHeight },
      targetSize: { width: targetWidth, height: targetHeight },
      scale,
      faceCenter: { x: faceCenterXScaled, y: faceCenterYScaled },
      faceRadius: faceCoords.radius * scale,
      dynamicMargin,
      scaledRadius,
      smartOffset: { x: smartOffset.x, y: smartOffset.y, reason: smartOffset.reason },
      finalPosition: { x: finalCenterX, y: finalCenterY },
    })

    // 7. Создаем круглую маску ВОКРУГ ЛИЦА (БЕЗ offset)
    const maskPath = path.join(path.dirname(outputPath), 'circle_mask_lipsync.png')
    await createCircleMask(
      targetWidth,
      targetHeight,
      faceCenterXScaled,
      faceCenterYScaled,
      scaledRadius,
      maskPath
    )

    // 8. FFmpeg команда: вырезаем лицо, потом позиционируем в левом нижнем углу
    // ⚠️ Background video audio is MUTED (-an flag) - only lip-sync audio is used
    const ffmpegCommand = `ffmpeg -i "${backgroundVideoPath}" -an -i "${lipSyncVideoPath}" -i "${maskPath}" \
      -filter_complex "\
        [0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,trim=duration=${finalDuration},setpts=PTS-STARTPTS[bg]; \
        [1:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,trim=duration=${finalDuration},setpts=PTS-STARTPTS[lipsync]; \
        [lipsync][2:v]alphamerge[masked]; \
        [bg][masked]overlay=${smartOffset.x}:${smartOffset.y}[outv]" \
      -map "[outv]" -map 1:a -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -aspect 9:16 -t ${finalDuration} \
      -y "${outputPath}"`

    logger.info('🔧 [CIRCLE COMPOSITION] Running FFmpeg with face detection')

    await execAsync(ffmpegCommand)

    // Очистка временных файлов
    await fs.unlink(maskPath).catch(() => {})
    await fs.unlink(firstFramePath).catch(() => {})

    logger.info('✅ [CIRCLE COMPOSITION WITH FACE DETECTION] Created successfully', {
      outputPath,
      duration: finalDuration,
      faceCenter: { x: faceCenterXScaled, y: faceCenterYScaled },
      radius: scaledRadius,
    })

    return outputPath
  } catch (error) {
    logger.error('❌ [CIRCLE COMPOSITION WITH FACE DETECTION] Failed', { error })
    throw error
  }
}

/**
 * Упрощенная версия для тестирования без face detection
 * Создает круг в центре вертикального видео 9:16 с фиксированным радиусом
 */
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
    const ffmpegCommand = `ffmpeg -i "${backgroundVideoPath}" -i "${lipSyncVideoPath}" -i "${maskPath}" \
      -filter_complex "\
        [0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2[bg]; \
        [1:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2[lipsync]; \
        [lipsync][2:v]alphamerge[masked]; \
        [bg][masked]overlay=0:0[outv]" \
      -map "[outv]" -map 1:a? -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -aspect 9:16 \
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
