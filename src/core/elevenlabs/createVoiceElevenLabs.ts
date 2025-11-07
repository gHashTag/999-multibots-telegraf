import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'
import FormData from 'form-data'
import logger from '@/utils/logger'
import { configManager } from '@/core/foundation/ConfigManager'

export class ElevenLabsVoiceLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ElevenLabsVoiceLimitError'
  }
}

async function downloadVoiceMessage(fileUrl: string, downloadPath: string) {
  logger.info('[downloadVoiceMessage] Starting download', {
    fileUrl,
    downloadPath,
  })
  const writer = fs.createWriteStream(downloadPath)
  logger.info('[downloadVoiceMessage] Writer created. Attempting axios GET', {
    fileUrl,
  })
  const response = await axios({
    url: fileUrl,
    method: 'GET',
    responseType: 'stream',
  })
  logger.info(
    '[downloadVoiceMessage] Axios GET successful. Piping stream to writer.',
    { fileUrl }
  )

  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    logger.info(
      '[downloadVoiceMessage] Waiting for writer finish/error events.',
      { fileUrl }
    )
    writer.on('error', err => {
      logger.error('[downloadVoiceMessage] Writer error event.', {
        fileUrl,
        error: err.message || String(err),
      })
      reject(err)
    })
    writer.on('finish', () => {
      logger.info('[downloadVoiceMessage] Writer finish event.', { fileUrl })
      resolve(undefined)
    })
  })
}

/**
 * Создает голос через внутренний AI сервер (с fallback на прямой API)
 */
async function createVoiceViaAiServer({
  fileUrl,
  username,
}: {
  fileUrl: string
  username: string
}): Promise<string | null> {
  let AI_SERVER_URL: string
  try {
    AI_SERVER_URL = configManager.getApiServerUrl()
  } catch (error) {
    logger.warn('[createVoiceViaAiServer] ConfigManager error, using environment fallback', {
      error: error.message
    })
    // ✅ ИСПРАВЛЕНО: Используем только наш домен для voice services
    AI_SERVER_URL = process.env.API_SERVER_URL || 'https://three-head-dragon.shop'
    if (!AI_SERVER_URL) {
      throw new Error('AI Server URL not available')
    }
  }

  logger.info('[createVoiceViaAiServer] Отправляем запрос на ai-server для создания голоса', {
    username,
    fileUrl: fileUrl.substring(0, 50) + '...',
    aiServerUrl: AI_SERVER_URL
  })

  // Пробуем разные возможные эндпоинты для ElevenLabs
  const endpoints = [
    '/api/elevenlabs/voices',
    '/api/voice/create',
    '/elevenlabs/create-voice',
    '/api/v1/voices/add',
    '/voices/create',
    '/proxy/elevenlabs/voices'
  ]

  let lastError: any = null
  const endpointTimeout = 10000 // 10 секунд на эндпоинт
  const maxTotalTime = 30000 // Максимум 30 секунд на все попытки

  const startTime = Date.now()

  for (const endpoint of endpoints) {
    // Проверяем общий таймаут
    if (Date.now() - startTime > maxTotalTime) {
      logger.warn(`⚠️ Превышен общий таймаут ${maxTotalTime}ms для AI Server, переходим к fallback`)
      break
    }

    try {
      logger.info(`🔍 Пробуем эндпоинт: ${endpoint}`)

      const response = await axios.post(`${AI_SERVER_URL}${endpoint}`, {
        fileUrl,
        username,
        description: 'Voice created from Telegram voice message',
        labels: { accent: 'neutral' }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(process.env.AI_SERVER_API_KEY && {
            'Authorization': `Bearer ${process.env.AI_SERVER_API_KEY}`
          })
        },
        timeout: endpointTimeout
      })

      if (response.status === 200 || response.status === 201) {
        const result = response.data
        logger.info(`✅ Голос создан через ai-server (${endpoint})`, {
          username,
          voiceId: result.voice_id || result.id
        })

        return result.voice_id || result.id
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn(`⚠️ Эндпоинт ${endpoint} не найден`)
        continue
      }
      logger.error(`❌ Ошибка ${endpoint}:`, error)
      lastError = error
      continue
    }
  }

  // Если ai-server недоступен, используем fallback на прямой API
  logger.warn('⚠️ Все эндпоинты ai-server недоступны, используем fallback на прямой ElevenLabs API')
  throw new Error('AI Server unavailable, fallback required')
}

export async function createVoiceElevenLabs({
  fileUrl,
  username,
}: {
  fileUrl: string
  username: string
}): Promise<string | null> {
  const uniqueFileName = `${uuidv4()}.oga`
  const downloadPath = path.join(os.tmpdir(), uniqueFileName)
  logger.info('[createVoiceElevenLabs] Starting process', {
    username,
    fileUrl,
    downloadPath,
  })

  try {
    // Сначала пытаемся через внутренний AI сервер
    try {
      return await createVoiceViaAiServer({ fileUrl, username })
    } catch (aiServerError) {
      logger.warn('[createVoiceElevenLabs] AI Server недоступен, используем прямой API', {
        error: aiServerError
      })
    }

    // Fallback: прямой API (оригинальная логика)
    logger.info(
      '[createVoiceElevenLabs] Attempting to download voice message.',
      { fileUrl }
    )
    await downloadVoiceMessage(fileUrl, downloadPath)
    logger.info(
      '[createVoiceElevenLabs] Voice message download finished. Preparing FormData.',
      { downloadPath }
    )

    const form = new FormData()
    form.append('name', username)
    form.append('description', 'Voice created from Telegram voice message')

    const fileStream = fs.createReadStream(downloadPath)
    form.append('files', fileStream)

    form.append('labels', JSON.stringify({ accent: 'neutral' }))

    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY
    if (!elevenLabsApiKey) {
      logger.error('[createVoiceElevenLabs] ELEVENLABS_API_KEY is not set.')
      console.error('ELEVENLABS_API_KEY is not set.')
      console.warn(
        '[MOCK_MODE] ELEVENLABS_API_KEY not set, would return mock/error here in production'
      )
      return null
    }
    logger.info(
      '[createVoiceElevenLabs] API Key found. Preparing to POST to ElevenLabs.',
      { username }
    )

    const url = 'https://api.elevenlabs.io/v1/voices/add'

    logger.info(
      '[createVoiceElevenLabs] Attempting axios POST to ElevenLabs API.',
      { url, username }
    )
    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        'xi-api-key': elevenLabsApiKey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 20000, // 20 seconds timeout (уменьшено с 30)
      maxRedirects: 3, // Уменьшено с 5 для быстрейшего ответа
    })
    logger.info('[createVoiceElevenLabs] Axios POST to ElevenLabs finished.', {
      username,
      status: response.status,
    })

    if (response.status === 200 || response.status === 201) {
      const result = response.data as { voice_id: string }
      logger.info('[createVoiceElevenLabs] Voice created successfully.', {
        username,
        voiceId: result.voice_id,
      })
      return result.voice_id
    } else {
      logger.error(
        `[createVoiceElevenLabs] Error adding voice, status: ${response.status}`,
        { username, statusText: response.statusText, data: response.data }
      )
      throw new Error(`ElevenLabs API returned status ${response.status}`)
    }
  } catch (error: any) {
    if (
      axios.isAxiosError(error) &&
      error.response?.data?.detail?.status === 'voice_limit_reached'
    ) {
      logger.warn('[createVoiceElevenLabs] ElevenLabs voice limit reached.', {
        username,
        data: error.response.data.detail,
      })
      throw new ElevenLabsVoiceLimitError(error.response.data.detail.message)
    } else if (axios.isAxiosError(error)) {
      // Check for Cloudflare challenge (403 with HTML response)
      if (error.response?.status === 403 && 
          typeof error.response?.data === 'string' && 
          error.response.data.includes('Just a moment')) {
        logger.error('[createVoiceElevenLabs] Cloudflare challenge detected. IP might be blocked.', {
          username,
          status: 403,
        })
        throw new Error(
          'ElevenLabs API временно недоступен (Cloudflare защита). Попробуйте позже или обратитесь в поддержку.'
        )
      }
      
      // Check for rate limiting
      if (error.response?.status === 429) {
        logger.error('[createVoiceElevenLabs] Rate limit exceeded.', {
          username,
          status: 429,
        })
        throw new Error(
          'Превышен лимит запросов к ElevenLabs. Попробуйте через несколько минут.'
        )
      }
      
      // Check for invalid API key
      if (error.response?.status === 401) {
        logger.error('[createVoiceElevenLabs] Invalid API key.', {
          username,
          status: 401,
        })
        throw new Error(
          'Недействительный API ключ ElevenLabs. Обратитесь в поддержку.'
        )
      }
      
      logger.error('[createVoiceElevenLabs] Axios error.', {
        username,
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: typeof error.response?.data === 'string'
          ? error.response.data.substring(0, 500)
          : 'Response data present but not string',
      })
      throw new Error(`ElevenLabs API недоступен (${error.response?.status || error.message}). Попробуйте позже.`)
    } else {
      logger.error('[createVoiceElevenLabs] Generic error.', {
        username,
        error: error.message || String(error),
      })
      throw new Error(
        `An unexpected error occurred while creating voice: ${error.message}`
      )
    }
  } finally {
    if (fs.existsSync(downloadPath)) {
      try {
        fs.unlinkSync(downloadPath)
      } catch (unlinkError) {
        console.error('Error deleting temporary voice file:', unlinkError)
      }
    }
  }
}
