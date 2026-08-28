/**
 * Face Circle Composer
 *
 * Создает композицию: фоновое видео + lip-sync видео в круглой маске
 * Простая версия БЕЗ face detection (fixed positioning)
 * С отключенным звуком фонового видео (только lip-sync audio)
 */

import path from 'path'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@/utils/logger'

const execAsync = promisify(exec)

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
    const maskPath = path.join(
      path.dirname(outputPath),
      'circle_mask_simple.png'
    )
    await createCircleMask(
      targetWidth,
      targetHeight,
      cx,
      cy,
      circleRadius,
      maskPath
    )

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

    logger.info(
      '✅ [CIRCLE COMPOSITION SIMPLE] Vertical 9:16 composition created',
      { outputPath }
    )

    return outputPath
  } catch (error) {
    logger.error('❌ [CIRCLE COMPOSITION SIMPLE] Failed', { error })
    throw error
  }
}
