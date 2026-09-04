import path from 'path'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import fetch from 'node-fetch'
import { logger } from '@/utils/logger'
import { downloadFile } from './file-helpers'
import axios from 'axios'
import FormData from 'form-data'

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

// downloadFile moved to file-helpers.ts to avoid conflicts

/**
 * Combines multiple video clips into a single video.
 * @param clipPaths An array of paths to the video clips.
 * @param outputPath The path for the combined output video.
 * @param transition The type of transition (e.g., 'fade').
 * @param transitionDuration The duration of the transition in seconds.
 */
export async function combineVideos(
  clipPaths: string[],
  outputPath: string,
  transition: 'fade' | 'none' = 'none',
  transitionDuration = 1
): Promise<string> {
  if (clipPaths.length === 0) throw new Error('No video clips to combine')
  if (clipPaths.length === 1) return clipPaths[0]

  logger.info('Combining videos...', {
    count: clipPaths.length,
    transition,
    outputPath,
  })

  // Используем FFmpeg для объединения с сохранением аудио из ВСЕХ видео
  const listPath = path.join(
    path.dirname(outputPath),
    `concat_list_${Date.now()}.txt`
  )
  const fileContent = clipPaths.map(p => `file '${p}'`).join('\n')
  await fs.writeFile(listPath, fileContent)

  // ✅ ИСПРАВЛЕНИЕ: Используем перекодировку вместо -c copy
  // -c:v libx264: видео кодек (H.264)
  // -c:a aac: аудио кодек (AAC)
  // Это сохраняет аудио из всех видео при склейке
  // Quoted, like every other command in this file. execAsync runs through a
  // shell, and outputPath is not a constant: generateAdvancedLoopingVideo
  // builds it as `reels_kling_v7_${telegram_id}_${Date.now()}`, where
  // telegram_id is destructured straight off event.data with no validation.
  const command = `ffmpeg -f concat -safe 0 -i "${listPath}" -c:v libx264 -c:a aac -b:a 192k -y "${outputPath}"`

  logger.info('🎬 [VIDEO MERGE] Executing FFmpeg command', {
    clipPaths,
    command: command.substring(0, 100),
  })

  await execAsync(command)

  await fs.unlink(listPath) // Clean up the list file

  logger.info('✅ Videos combined successfully with audio preserved')
  return outputPath
}

/**
 * Adds a music track to a video file.
 * @param videoPath The path to the source video file.
 * @param musicUrl The URL of the music file to add.
 * @param outputPath The path for the final video with music.
 * @param tempDir A temporary directory for downloading the music.
 */
export async function addMusic(
  videoPath: string,
  musicUrl: string,
  outputPath: string,
  tempDir: string
): Promise<string> {
  logger.info('🎵 Adding music to video...', { videoPath, musicUrl })

  const musicPath = path.join(tempDir, `music_${Date.now()}.mp3`)
  try {
    await downloadFile(musicUrl, musicPath)
    const command = `ffmpeg -i "${videoPath}" -i "${musicPath}" -c:v copy -c:a aac -shortest -y "${outputPath}"`
    await execAsync(command)
    logger.info('✅ Music added successfully', { outputPath })
    return outputPath
  } catch (error) {
    logger.error('❌ Failed to add music', { error })
    // Если не удалось добавить музыку, возвращаем оригинальное видео
    return videoPath
  } finally {
    // Очищаем скачанный музыкальный файл
    if (await fs.stat(musicPath).catch(() => false)) {
      await fs.unlink(musicPath)
    }
  }
}

/**
 * Converts audio from Telegram format (.oga, .ogg) to MP3.
 * Downloads the file, converts with ffmpeg, uploads to pomf.lain.la.
 *
 * @param audioUrl - URL of the audio file (Telegram voice/audio)
 * @param telegramId - User's Telegram ID for logging
 * @returns Public URL of the converted MP3 file
 */
export async function convertAudioToMp3(
  audioUrl: string,
  telegramId: string
): Promise<string> {
  const tempDir = '/tmp'
  const timestamp = Date.now()
  const inputPath = path.join(tempDir, `audio_${telegramId}_${timestamp}.oga`)
  const outputPath = path.join(tempDir, `audio_${telegramId}_${timestamp}.mp3`)

  logger.info('🎤 [AUDIO CONVERT] Starting audio conversion', {
    telegramId,
    inputUrl: audioUrl.substring(0, 50) + '...',
  })

  try {
    // Step 1: Download audio from Telegram
    await downloadFile(audioUrl, inputPath)
    logger.info('✅ [AUDIO CONVERT] Downloaded audio file', { inputPath })

    // Step 2: Convert to MP3 using ffmpeg
    // -i: input file
    // -acodec libmp3lame: use MP3 codec
    // -b:a 192k: bitrate 192kbps
    // -y: overwrite output
    const command = `ffmpeg -i "${inputPath}" -acodec libmp3lame -b:a 192k -y "${outputPath}"`

    logger.info('🔄 [AUDIO CONVERT] Running ffmpeg...', { command })
    await execAsync(command)

    logger.info('✅ [AUDIO CONVERT] FFmpeg conversion complete', { outputPath })

    // Step 3: Upload to pomf.lain.la
    const mp3Buffer = await fs.readFile(outputPath)
    const publicUrl = await uploadBufferToPomf(
      mp3Buffer,
      `lipsync_audio_${telegramId}_${timestamp}.mp3`
    )

    logger.info('✅ [AUDIO CONVERT] Uploaded to pomf.lain.la', {
      telegramId,
      publicUrl,
    })

    return publicUrl
  } catch (error) {
    logger.error('❌ [AUDIO CONVERT] Conversion failed', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
    })
    throw new Error(
      `Audio conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  } finally {
    // Cleanup temp files
    try {
      await fs.unlink(inputPath).catch(() => {})
      await fs.unlink(outputPath).catch(() => {})
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Uploads a buffer to file hosting with retry and multiple fallbacks.
 */
async function uploadBufferToPomf(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const maxRetries = 2

  // Try catbox.moe first (most reliable)
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        `🔄 [AUDIO CONVERT] Uploading to catbox.moe (attempt ${attempt})...`
      )
      const formData = new FormData()
      formData.append('reqtype', 'fileupload')
      formData.append('fileToUpload', buffer, fileName)

      const response = await axios.post(
        'https://catbox.moe/user/api.php',
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000,
        }
      )

      const url = response.data?.trim()
      if (url && url.startsWith('http')) {
        logger.info('✅ [AUDIO CONVERT] Uploaded to catbox.moe', { url })
        return url
      }
    } catch (error) {
      logger.warn(`⚠️ [AUDIO CONVERT] catbox.moe attempt ${attempt} failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Fallback to 0x0.st
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`🔄 [AUDIO CONVERT] Trying 0x0.st (attempt ${attempt})...`)
      const formData = new FormData()
      formData.append('file', buffer, fileName)

      const response = await axios.post('https://0x0.st', formData, {
        headers: formData.getHeaders(),
        timeout: 60000,
      })

      const url = response.data?.trim()
      if (url && url.startsWith('http')) {
        logger.info('✅ [AUDIO CONVERT] Uploaded to 0x0.st', { url })
        return url
      }
    } catch (error) {
      logger.warn(`⚠️ [AUDIO CONVERT] 0x0.st attempt ${attempt} failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Last resort: pomf.lain.la
  try {
    logger.info('🔄 [AUDIO CONVERT] Trying pomf.lain.la...')
    const formData = new FormData()
    formData.append('files[]', buffer, fileName)

    const response = await axios.post(
      'https://pomf.lain.la/upload.php',
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 60000,
      }
    )

    if (response.data?.success && response.data?.files?.[0]) {
      const url = response.data.files[0].url
      logger.info('✅ [AUDIO CONVERT] Uploaded to pomf.lain.la', { url })
      return url
    }
  } catch (error) {
    logger.warn('⚠️ [AUDIO CONVERT] pomf.lain.la failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  throw new Error(
    'All file hosting services failed (catbox.moe, 0x0.st, pomf.lain.la)'
  )
}

/**
 * Checks if a URL points to an audio format that needs conversion.
 * Telegram voice messages are .oga (Ogg Opus) format.
 */
export function needsAudioConversion(audioUrl: string): boolean {
  const lowerUrl = audioUrl.toLowerCase()
  return lowerUrl.includes('.oga') || lowerUrl.includes('.ogg')
}
