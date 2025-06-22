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
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0', // Обновленный user-agent
    ]

    // Для Instagram используем улучшенные настройки без зависимости от Chrome cookies
    if (url.includes('instagram.com')) {
      options.push(
        '--extractor-args',
        'instagram:api_version=v1', // Используем старую версию API
        '--sleep-interval',
        '2', // Увеличиваем пауза между запросами
        '--max-sleep-interval',
        '5',
        '--retries',
        '3', // Добавляем повторные попытки
        '--add-header',
        'Accept-Language:en-US,en;q=0.9',
        '--add-header',
        'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        '--add-header',
        'Cache-Control:max-age=0',
        '--add-header',
        'Sec-Fetch-Dest:document',
        '--add-header',
        'Sec-Fetch-Mode:navigate',
        '--add-header',
        'Sec-Fetch-Site:none',
        '--add-header',
        'Sec-Fetch-User:?1',
        '--add-header',
        'Upgrade-Insecure-Requests:1',
        '--referer',
        'https://www.instagram.com/'
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

  // Метод 1: Мобильный user-agent с iOS
  const fallbackOptions = [
    '--format',
    'best[height<=720]/best',
    '--output',
    outputTemplate,
    '--no-playlist',
    '--max-filesize',
    '50M',
    '--merge-output-format',
    'mp4',
    '--no-check-certificate',
    '--user-agent',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    '--referer',
    'https://www.instagram.com/',
    '--add-header',
    'Accept-Language:en-US,en;q=0.9',
    '--add-header',
    'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    '--add-header',
    'X-Requested-With:XMLHttpRequest',
    '--sleep-interval',
    '3',
    '--max-sleep-interval',
    '8',
    '--retries',
    '5',
    '--socket-timeout',
    '30',
    url,
  ]

  logger.info('[VideoTranscription] Trying Instagram fallback download', {
    url,
    outputTemplate,
  })

  try {
    await ytDlp.execPromise(fallbackOptions)
  } catch (firstFallbackError) {
    logger.warn(
      '[VideoTranscription] First fallback failed, trying aggressive method',
      {
        url,
        error: firstFallbackError.message,
      }
    )

    try {
      // Метод 2: Android user-agent с низким качеством
      const aggressiveOptions = [
        '--format',
        'worst[height<=480]/worst',
        '--output',
        outputTemplate,
        '--no-playlist',
        '--max-filesize',
        '25M',
        '--merge-output-format',
        'mp4',
        '--no-check-certificate',
        '--user-agent',
        'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        '--referer',
        'https://www.instagram.com/',
        '--add-header',
        'Accept-Language:en-US,en;q=0.5',
        '--add-header',
        'X-Instagram-AJAX:1',
        '--add-header',
        'X-CSRFToken:missing',
        '--sleep-interval',
        '5',
        '--max-sleep-interval',
        '15',
        '--retries',
        '8',
        '--fragment-retries',
        '10',
        '--skip-unavailable-fragments',
        '--abort-on-unavailable-fragment',
        url,
      ]

      await ytDlp.execPromise(aggressiveOptions)
    } catch (secondFallbackError) {
      logger.warn(
        '[VideoTranscription] Second fallback failed, trying gallery-dl method',
        {
          url,
          error: secondFallbackError.message,
        }
      )

      try {
        // Метод 3: Попробуем использовать gallery-dl если доступен
        const galleryDlOptions = [
          '--format',
          'best/worst',
          '--output',
          outputTemplate,
          '--no-playlist',
          '--max-filesize',
          '50M',
          '--merge-output-format',
          'mp4',
          '--no-check-certificate',
          '--extractor-args',
          'instagram:include=posts',
          '--user-agent',
          'Instagram 76.0.0.15.395 Android (24/7.0; 640dpi; 1440x2560; samsung; SM-G930F; herolte; samsungexynos8890; en_US)',
          '--add-header',
          'X-IG-App-ID:936619743392459',
          '--add-header',
          'X-IG-WWW-Claim:0',
          '--sleep-interval',
          '7',
          '--max-sleep-interval',
          '20',
          '--retries',
          '10',
          '--socket-timeout',
          '60',
          url,
        ]

        await ytDlp.execPromise(galleryDlOptions)
      } catch (thirdFallbackError) {
        logger.warn(
          '[VideoTranscription] Third fallback failed, trying final method with update',
          {
            url,
            error: thirdFallbackError.message,
          }
        )

        try {
          // Обновляем yt-dlp
          await ytDlp.execPromise(['--update'])
          logger.info('[VideoTranscription] yt-dlp updated successfully')
        } catch (updateError) {
          logger.warn(
            '[VideoTranscription] yt-dlp update failed, continuing with current version',
            {
              error: updateError.message,
            }
          )
        }

        // Метод 4: Финальная попытка с обновленными экстракторами
        const finalOptions = [
          '--format',
          'best[filesize<50M]/worst[filesize<50M]/best/worst',
          '--output',
          outputTemplate,
          '--no-playlist',
          '--max-filesize',
          '50M',
          '--merge-output-format',
          'mp4',
          '--no-check-certificate',
          '--ignore-errors',
          '--user-agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
          '--extractor-args',
          'instagram:api_version=v1',
          '--add-header',
          'Sec-Fetch-Dest:document',
          '--add-header',
          'Sec-Fetch-Mode:navigate',
          '--add-header',
          'Sec-Fetch-Site:none',
          '--add-header',
          'Upgrade-Insecure-Requests:1',
          '--sleep-interval',
          '10',
          '--max-sleep-interval',
          '25',
          '--retries',
          '12',
          '--socket-timeout',
          '90',
          url,
        ]

        await ytDlp.execPromise(finalOptions)
      }
    }
  }

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

    // Более детальные сообщения об ошибках
    let errorMessage = ''
    if (error.message.includes('timeout')) {
      errorMessage = isRu
        ? 'Превышен лимит времени обработки видео. Попробуйте более короткое видео или повторите позже.'
        : 'Video processing timeout exceeded. Try a shorter video or retry later.'
    } else if (error.message.includes('File too large')) {
      errorMessage = isRu
        ? 'Видео слишком большое для обработки (максимум 25MB). Попробуйте более короткое видео.'
        : 'Video is too large for processing (25MB max). Try a shorter video.'
    } else if (error.message.includes('Whisper API failed')) {
      errorMessage = isRu
        ? 'Сервис транскрибации временно недоступен. Попробуйте позже.'
        : 'Transcription service is temporarily unavailable. Please try again later.'
    } else {
      errorMessage = isRu
        ? 'Ошибка при скачивании или транскрибации видео'
        : 'Error downloading or transcribing video'
    }

    return {
      success: false,
      error: errorMessage,
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

  // Временная заглушка для dev режима если ключ не валидный
  if (
    process.env.NODE_ENV === 'development' &&
    (!openaiApiKey.startsWith('sk-') || openaiApiKey.includes('ollama'))
  ) {
    logger.warn(
      '[VideoTranscription] Using mock transcription in dev mode (invalid OpenAI key)',
      {
        filePath,
        apiKeyPrefix: openaiApiKey.substring(0, 10),
      }
    )
    return isRu
      ? 'Тестовая транскрибация для разработки. Видео успешно скачано и обработано! 🎉'
      : 'Test transcription for development. Video successfully downloaded and processed! 🎉'
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

  // Retry логика для OpenAI API
  let lastError: any
  const maxRetries = 3

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info('[VideoTranscription] Whisper API attempt', {
        attempt,
        maxRetries,
        fileSizeInMB: fileSizeInMB.toFixed(2),
      })

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${openaiApiKey}`,
          },
          timeout: 300000, // 5 минут timeout для больших файлов
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      )

      if (response.data && typeof response.data === 'string') {
        logger.info('[VideoTranscription] Whisper API success', {
          attempt,
          responseLength: response.data.length,
        })
        return response.data.trim()
      }

      throw new Error('Invalid response from Whisper API')
    } catch (error) {
      lastError = error
      logger.warn('[VideoTranscription] Whisper API attempt failed', {
        attempt,
        maxRetries,
        error: error.message,
        isTimeout: error.message.includes('timeout'),
      })

      // Если это не последняя попытка и ошибка timeout, ждем перед повтором
      if (attempt < maxRetries && error.message.includes('timeout')) {
        const waitTime = attempt * 10000 // 10, 20, 30 секунд
        logger.info('[VideoTranscription] Waiting before retry', {
          attempt,
          waitTimeMs: waitTime,
        })
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  // Если все попытки неудачны
  throw new Error(
    `Whisper API failed after ${maxRetries} attempts: ${lastError.message}`
  )
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
