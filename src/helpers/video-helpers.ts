import path from 'path'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import fetch from 'node-fetch'
import { logger } from '@/utils/logger'
import { downloadFile } from './file-helpers'

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
  transitionDuration: number = 1
): Promise<string> {
  if (clipPaths.length === 0) throw new Error('No video clips to combine')
  if (clipPaths.length === 1) return clipPaths[0]

  logger.info('Combining videos...', {
    count: clipPaths.length,
    transition,
    outputPath,
  })

  // Используем FFmpeg для объединения с переходами
  // Эта логика может быть сложной, для начала сделаем простую конкатенацию
  // TODO: Реализовать сложные переходы
  const listPath = path.join(
    path.dirname(outputPath),
    `concat_list_${Date.now()}.txt`
  )
  const fileContent = clipPaths.map(p => `file '${p}'`).join('\n')
  await fs.writeFile(listPath, fileContent)

  const command = `ffmpeg -f concat -safe 0 -i ${listPath} -c copy -y ${outputPath}`
  await execAsync(command)

  await fs.unlink(listPath) // Clean up the list file

  logger.info('✅ Videos combined successfully')
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
