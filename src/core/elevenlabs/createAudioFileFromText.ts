import path from 'path'
import os from 'os'
import fs, { createWriteStream } from 'fs'
import { elevenlabs } from '.'
import axios from 'axios'
import { configManager } from '@/core/foundation/ConfigManager'
import logger from '@/utils/logger'

// Import supabase to clear invalid voice IDs
import { supabase } from '@/core/supabase'
import { getFallbackVoiceId } from '@/core/supabase/getVoiceId'

// Custom error class for voice not found
export class VoiceNotFoundError extends Error {
  constructor(voiceId: string) {
    super(
      `Voice ID '${voiceId}' not found. The voice may have been deleted or doesn't exist.`
    )
    this.name = 'VoiceNotFoundError'
  }
}

/**
 * Генерирует аудио через внутренний AI сервер (с fallback на прямой API)
 */
async function generateTTSViaAiServer({
  text,
  voice_id,
}: {
  text: string
  voice_id: string
}): Promise<string> {
  const AI_SERVER_URL = configManager.getApiServerUrl()

  logger.info('[generateTTSViaAiServer] Отправляем запрос на ai-server для TTS', {
    voice_id,
    textLength: text.length,
    aiServerUrl: AI_SERVER_URL
  })

  // Пробуем разные возможные эндпоинты для ElevenLabs TTS
  const endpoints = [
    '/api/elevenlabs/tts',
    '/api/voice/generate',
    '/elevenlabs/text-to-speech',
    '/api/v1/text-to-speech',
    '/tts/generate',
    '/proxy/elevenlabs/tts'
  ]

  let lastError: any = null

  for (const endpoint of endpoints) {
    try {
      logger.info(`🔍 Пробуем эндпоинт: ${endpoint}`)

      const response = await axios.post(`${AI_SERVER_URL}${endpoint}`, {
        text,
        voice_id,
        model_id: 'eleven_turbo_v2_5'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(process.env.AI_SERVER_API_KEY && {
            'Authorization': `Bearer ${process.env.AI_SERVER_API_KEY}`
          })
        },
        timeout: 60000,
        responseType: 'stream'
      })

      if (response.status === 200) {
        const outputPath = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
        const writer = fs.createWriteStream(outputPath)

        response.data.pipe(writer)

        return new Promise<string>((resolve, reject) => {
          writer.on('error', reject)
          writer.on('finish', () => {
            logger.info(`✅ Аудио создано через ai-server (${endpoint})`, {
              outputPath
            })
            resolve(outputPath)
          })
        })
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

/**
 * Ключ ElevenLabs должен начинаться с `sk_`.
 *
 * В проде в ELEVENLABS_API_KEY лежит НЕ ключ, а его идентификатор — 64 символа
 * без префикса. Проверено живым запросом: GET /v1/voices отвечает 400 и
 * {"code":"invalid_api_key","message":"API key ID used as API key - only valid
 * API keys can be used. API keys start with 'sk_'"}.
 *
 * Без этой проверки синтез падал бы на каждом вызове невнятной 400-й из
 * середины SDK, и по логам это выглядело бы как сбой ElevenLabs, а не как
 * неверная переменная окружения.
 */
function assertElevenLabsKey(key: string | undefined): asserts key is string {
  if (!key) {
    throw new Error('ELEVENLABS_API_KEY не задан')
  }
  if (!key.startsWith('sk_')) {
    throw new Error(
      'ELEVENLABS_API_KEY похож на идентификатор ключа, а не на сам ключ: ' +
        'настоящий начинается с "sk_" и показывается только при создании или ротации. ' +
        'Синтез речи работать не будет, пока переменная не заменена.'
    )
  }
}

export const createAudioFileFromText = async ({
  text,
  voice_id,
  telegram_id,
}: {
  text: string
  voice_id: string
  telegram_id?: string
}): Promise<string> => {
  assertElevenLabsKey(process.env.ELEVENLABS_API_KEY)

  // 🔧 ENHANCED LOGGING: Улучшенное логирование входных данных
  const logData = {
    voice_id,
    textLength: text.length,
    apiKeyPresent: !!process.env.ELEVENLABS_API_KEY,
    apiKeyPrefix: process.env.ELEVENLABS_API_KEY?.substring(0, 5),
    telegram_id,
    timestamp: new Date().toISOString()
  }

  console.log('[TTS_BOT] 🎤 Attempting to create audio with:', logData)
  logger.info('[createAudioFileFromText] Starting TTS generation', logData)

  // Проверяем наличие API ключа
  if (!process.env.ELEVENLABS_API_KEY) {
    console.warn(
      '[TTS_BOT] ⚠️ ELEVENLABS_API_KEY отсутствует, будет использован mock'
    )
    logger.warn('[createAudioFileFromText] Missing API key, using mock mode')
  }

  try {
    // ВРЕМЕННО ОТКЛЮЧЕНО: Прямое использование ElevenLabs API вместо AI Server
    // Причина: AI Server возвращает 401 и блокирует fallback на прямой API
    /*
    try {
      return await generateTTSViaAiServer({ text, voice_id })
    } catch (aiServerError) {
      logger.warn('[createAudioFileFromText] AI Server недоступен, используем прямой API', {
        error: aiServerError
      })
    }
    */

    // Используем прямой HTTP запрос вместо SDK
    console.log('[createAudioFileFromText] Using direct HTTP request to ElevenLabs API...')

    const requestPayload = {
      text: text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    }

    console.log('[TTS_BOT] Sending HTTP request to ElevenLabs:', {
      voice_id,
      textLength: text.length,
      model: 'eleven_turbo_v2_5'
    })

    // Прямой HTTP запрос
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      requestPayload,
      {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY || ''
        },
        responseType: 'stream',
        timeout: 60000
      }
    )

    const audioStream = response.data

    console.log(
      '[TTS_BOT] Received audioStream object from elevenlabs.generate. Type:',
      typeof audioStream
    )
    // console.log(audioStream); // Для детального изучения структуры, если понадобится

    const outputPath = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)

    return new Promise<string>((resolve, reject) => {
      ;(async () => {
        try {
          const chunks: Buffer[] = []
          // @ts-ignore (Если audioStream не типизирован как AsyncIterable<Uint8Array | Buffer>)
          for await (const chunk of audioStream) {
            chunks.push(
              Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
            )
          }
          console.log(`[TTS_BOT] Collected ${chunks.length} chunks.`)
          const completeBuffer = Buffer.concat(chunks)
          console.log(
            '[TTS_BOT] Audio stream concatenated. Total size:',
            completeBuffer.length
          )

          const u8 = new Uint8Array(completeBuffer)
          fs.writeFile(outputPath, u8, err => {
            if (err) {
              console.error('[TTS_BOT] Error writing audio file manually:', err)
              reject(err)
            } else {
              console.log(
                '[TTS_BOT] Audio file written successfully manually to:',
                outputPath
              )
              resolve(outputPath)
            }
          })
        } catch (streamError) {
          console.error('[TTS_BOT] Error processing audio stream:', streamError)
          reject(streamError)
        }
      })()
    })
  } catch (error: any) {
    logger.error('[createAudioFileFromText] TTS generation failed', {
      voice_id,
      telegram_id,
      error: error.message,
      statusCode: error.statusCode,
      stack: error.stack?.substring(0, 500) // Ограничиваем длину стека
    })

    console.error(
      '[TTS_BOT] ❌ Error in createAudioFileFromText (manual stream processing):',
      {
        message: error.message,
        statusCode: error.statusCode,
        voice_id,
        telegram_id
      }
    )

    // 🔧 ENHANCED ERROR HANDLING: Улучшенная обработка ошибок с fallback
    if (error.statusCode === 404 || error.status === 404) {
      console.error(
        `[TTS_BOT] ⚠️ Voice ID ${voice_id} not found (404). Attempting fallback...`
      )
      logger.warn('[createAudioFileFromText] Voice not found, attempting fallback', {
        originalVoiceId: voice_id,
        telegram_id
      })

      // Clear the invalid voice ID from database if telegram_id is provided
      if (telegram_id) {
        try {
          await supabase
            .from('users')
            .update({ voice_id_elevenlabs: null })
            .eq('telegram_id', telegram_id)
          console.log(
            `[TTS_BOT] ✅ Cleared invalid voice ID ${voice_id} for user ${telegram_id}`
          )
          logger.info('[createAudioFileFromText] Cleared invalid voice ID', {
            clearedVoiceId: voice_id,
            telegram_id
          })
        } catch (dbError) {
          console.error(
            '[TTS_BOT] ❌ Error clearing invalid voice ID from database:',
            dbError
          )
          logger.error('[createAudioFileFromText] Failed to clear invalid voice ID', {
            voice_id,
            telegram_id,
            dbError: dbError instanceof Error ? dbError.message : String(dbError)
          })
        }
      }

      // 🚀 FALLBACK ATTEMPT: Попытка с резервным голосом
      try {
        const fallbackVoiceId = getFallbackVoiceId()
        console.log(`[TTS_BOT] 🔄 Attempting TTS with fallback voice: ${fallbackVoiceId}`)
        logger.info('[createAudioFileFromText] Attempting fallback voice', {
          fallbackVoiceId,
          originalVoiceId: voice_id,
          telegram_id
        })

        // Рекурсивный вызов с fallback voice_id
        return await createAudioFileFromText({
          text,
          voice_id: fallbackVoiceId,
          telegram_id
        })
      } catch (fallbackError) {
        console.error('[TTS_BOT] ❌ Fallback voice also failed:', fallbackError)
        logger.error('[createAudioFileFromText] Fallback voice failed', {
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          telegram_id
        })

        // Если и fallback не работает, выбрасываем оригинальную ошибку
        throw new VoiceNotFoundError(voice_id)
      }
    }

    // Для других типов ошибок
    const errorMessage = `[TTS_BOT] Failed to generate audio: ${error.message || 'Unknown error'}`
    logger.error('[createAudioFileFromText] Unhandled error type', {
      errorType: error.constructor.name,
      voice_id,
      telegram_id
    })

    throw new Error(errorMessage)
  }
}
