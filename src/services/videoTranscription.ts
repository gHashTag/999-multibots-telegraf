import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import { logger } from '@/utils/logger'
import { downloadFile } from '@/helpers'
import { ensureDirectoryExistence } from '@/helpers'
import YTDlpWrap from 'yt-dlp-wrap'

interface TranscriptionResult {
  success: boolean
  text?: string
  error?: string
  videoPath?: string // Путь к скачанному видео файлу
}

async function downloadVideoFromUrl(
  url: string,
  outputDir: string,
  filePrefix: string
): Promise<string> {
  try {
    const ytDlp = new YTDlpWrap()

    // Создаем шаблон для имени файла
    const outputTemplate = path.join(outputDir, `${filePrefix}.%(ext)s`)

    // Базовые настройки для скачивания
    const options = [
      '--format',
      'best[ext=mp4][height<=1080]/best[height<=1080]/best', // Предпочитаем mp4, ограничиваем высоту
      '--output',
      outputTemplate,
      '--no-playlist', // Скачиваем только одно видео
      '--max-filesize',
      '50M', // Максимальный размер файла
      '--merge-output-format',
      'mp4', // Принудительно конвертируем в mp4
      '--postprocessor-args',
      'ffmpeg:-avoid_negative_ts make_zero -fflags +genpts -vf scale=-2:min(1080\\,ih)', // Сохраняем соотношение сторон
      '--no-check-certificate', // Игнорируем проблемы с сертификатами
      '--user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // Обновленный user-agent
    ]

    // Для Instagram добавляем специальные настройки для обхода блокировок
    if (url.includes('instagram.com')) {
      options.push(
        '--cookies-from-browser',
        'chrome', // Используем cookies из Chrome
        '--extractor-args',
        'instagram:api_version=v1', // Используем старую версию API
        '--sleep-interval',
        '1', // Пауза между запросами
        '--max-sleep-interval',
        '3'
      )
    }

    options.push(url)

    logger.info('[VideoTranscription] Downloading video from URL', {
      url,
      outputTemplate,
      isInstagram: url.includes('instagram.com'),
    })

    await ytDlp.execPromise(options)

    // Ищем скачанный файл
    const files = fs
      .readdirSync(outputDir)
      .filter(f => f.startsWith(filePrefix))
    if (files.length === 0) {
      throw new Error('Video file was not downloaded by yt-dlp')
    }

    const downloadedFile = path.join(outputDir, files[0])

    logger.info('[VideoTranscription] Video downloaded successfully', {
      url,
      downloadedFile,
      size: fs.statSync(downloadedFile).size,
    })

    return downloadedFile
  } catch (error) {
    // Если это Instagram и первая попытка не удалась, пробуем альтернативные методы
    if (url.includes('instagram.com')) {
      logger.warn(
        '[VideoTranscription] Instagram download failed, trying fallback methods',
        {
          url,
          error: error.message,
        }
      )

      try {
        return await downloadInstagramVideoFallback(url, outputDir, filePrefix)
      } catch (fallbackError) {
        logger.error(
          '[VideoTranscription] All Instagram download methods failed',
          {
            url,
            originalError: error.message,
            fallbackError: fallbackError.message,
          }
        )
        throw new Error(
          `Failed to download Instagram video. Instagram may require login or the video may be private. Original error: ${error.message}`
        )
      }
    }

    logger.error('[VideoTranscription] Error downloading video from URL', {
      url,
      outputDir,
      filePrefix,
      error: error.message,
    })
    throw new Error(`Failed to download video: ${error.message}`)
  }
}

async function downloadInstagramVideoFallback(
  url: string,
  outputDir: string,
  filePrefix: string
): Promise<string> {
  const ytDlp = new YTDlpWrap()
  const outputTemplate = path.join(outputDir, `${filePrefix}.%(ext)s`)

  // Пробуем более агрессивные настройки для Instagram
  const fallbackOptions = [
    '--format',
    'best[height<=720]/best', // Понижаем качество для лучшей совместимости
    '--output',
    outputTemplate,
    '--no-playlist',
    '--max-filesize',
    '50M',
    '--merge-output-format',
    'mp4',
    '--no-check-certificate',
    '--user-agent',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1', // Мобильный user-agent
    '--referer',
    'https://www.instagram.com/',
    '--add-header',
    'Accept-Language:en-US,en;q=0.9',
    '--sleep-interval',
    '2',
    '--max-sleep-interval',
    '5',
    '--retries',
    '3',
    url,
  ]

  logger.info('[VideoTranscription] Trying Instagram fallback download', {
    url,
    outputTemplate,
  })

  await ytDlp.execPromise(fallbackOptions)

  // Ищем скачанный файл
  const files = fs.readdirSync(outputDir).filter(f => f.startsWith(filePrefix))
  if (files.length === 0) {
    throw new Error('Video file was not downloaded by fallback method')
  }

  const downloadedFile = path.join(outputDir, files[0])

  logger.info('[VideoTranscription] Instagram fallback download successful', {
    url,
    downloadedFile,
    size: fs.statSync(downloadedFile).size,
  })

  return downloadedFile
}

export async function transcribeVideoFromUrl({
  videoUrl,
  telegramId,
  username,
  isRu,
  botName,
}: {
  videoUrl: string
  telegramId: string
  username: string
  isRu: boolean
  botName: string
}): Promise<TranscriptionResult> {
  let tempVideoPath: string | null = null

  try {
    // Создаем временные директории
    const tempDir = path.join(__dirname, '../../tmp', 'transcription')
    await ensureDirectoryExistence(tempDir)

    // Скачиваем видео по URL
    const filePrefix = `video_${telegramId}_${Date.now()}`

    // Сначала скачиваем видео
    tempVideoPath = await downloadVideoFromUrl(videoUrl, tempDir, filePrefix)

    // Отправляем видео в OpenAI Whisper для транскрибации
    logger.info('[VideoTranscription] Starting Whisper transcription', {
      telegramId,
      videoPath: tempVideoPath,
    })

    const transcriptionText = await transcribeWithWhisper(tempVideoPath, isRu)

    if (!transcriptionText) {
      throw new Error('Whisper returned empty transcription')
    }

    logger.info('[VideoTranscription] Transcription completed successfully', {
      telegramId,
      textLength: transcriptionText.length,
    })

    return {
      success: true,
      text: transcriptionText,
      videoPath: tempVideoPath, // Возвращаем путь к файлу для отправки пользователю
    }
  } catch (error) {
    logger.error('[VideoTranscription] Error during transcription from URL', {
      telegramId,
      videoUrl,
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      error: isRu
        ? 'Ошибка при скачивании или транскрибации видео'
        : 'Error downloading or transcribing video',
    }
  } finally {
    // НЕ удаляем файл здесь для URL - он будет удален после отправки пользователю
    // Файл будет очищен в wizard'е после отправки через cleanupVideoFile()
  }
}

export async function transcribeVideo({
  videoUrl,
  telegramId,
  username,
  isRu,
  botName,
}: {
  videoUrl: string
  telegramId: string
  username: string
  isRu: boolean
  botName: string
}): Promise<TranscriptionResult> {
  let tempVideoPath: string | null = null

  try {
    // Создаем временные директории
    const tempDir = path.join(__dirname, '../../tmp', 'transcription')
    await ensureDirectoryExistence(tempDir)

    // Скачиваем видео
    const videoFilename = `video_${telegramId}_${Date.now()}.mp4`
    tempVideoPath = path.join(tempDir, videoFilename)

    logger.info('[VideoTranscription] Downloading video', {
      telegramId,
      videoUrl,
      tempVideoPath,
    })

    const videoBuffer = await downloadFile(videoUrl)
    fs.writeFileSync(tempVideoPath, videoBuffer)

    // Проверяем, что видео файл создался
    if (!fs.existsSync(tempVideoPath)) {
      throw new Error('Video file was not downloaded')
    }

    // Отправляем видео напрямую в OpenAI Whisper для транскрибации
    // Whisper API поддерживает видео файлы и автоматически извлекает аудио
    logger.info('[VideoTranscription] Starting Whisper transcription', {
      telegramId,
      videoPath: tempVideoPath,
    })

    const transcriptionText = await transcribeWithWhisper(tempVideoPath, isRu)

    if (!transcriptionText) {
      throw new Error('Whisper returned empty transcription')
    }

    logger.info('[VideoTranscription] Transcription completed successfully', {
      telegramId,
      textLength: transcriptionText.length,
    })

    return {
      success: true,
      text: transcriptionText,
    }
  } catch (error) {
    logger.error('[VideoTranscription] Error during transcription', {
      telegramId,
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      error: isRu
        ? 'Ошибка при транскрибации видео'
        : 'Error transcribing video',
    }
  } finally {
    // Очищаем временные файлы
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      try {
        fs.unlinkSync(tempVideoPath)
        logger.info('[VideoTranscription] Cleaned up video file', {
          telegramId,
          path: tempVideoPath,
        })
      } catch (err) {
        logger.error('[VideoTranscription] Error deleting video file', {
          telegramId,
          path: tempVideoPath,
          error: err.message,
        })
      }
    }
  }
}

async function transcribeWithWhisper(
  filePath: string,
  isRu: boolean
): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  // Проверяем размер файла (Whisper API имеет лимит 25MB)
  const stats = fs.statSync(filePath)
  const fileSizeInMB = stats.size / (1024 * 1024)

  if (fileSizeInMB > 25) {
    throw new Error(
      `File too large: ${fileSizeInMB.toFixed(2)}MB. Whisper API limit is 25MB.`
    )
  }

  const formData = new FormData()
  formData.append('file', fs.createReadStream(filePath))
  formData.append('model', 'whisper-1')
  formData.append('language', isRu ? 'ru' : 'en') // Указываем язык для лучшего качества
  formData.append('response_format', 'text')

  const response = await axios.post(
    'https://api.openai.com/v1/audio/transcriptions',
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${openaiApiKey}`,
      },
      timeout: 120000, // 2 минуты timeout для больших файлов
    }
  )

  if (response.data && typeof response.data === 'string') {
    return response.data.trim()
  }

  throw new Error('Invalid response from Whisper API')
}

export function cleanupVideoFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      logger.info('[VideoTranscription] Cleaned up video file', {
        path: filePath,
      })
    }
  } catch (err) {
    logger.error('[VideoTranscription] Error deleting video file', {
      path: filePath,
      error: err.message,
    })
  }
}
