import { logger } from '@/utils/logger'
import { Readable } from 'stream'

interface GenerateOptions {
  voice: string
  model_id: string
  text: string
}

interface Voice {
  voice_id: string
  name: string
}

class ElevenLabsClient {
  private apiKey: string
  private baseUrl = 'https://api.elevenlabs.io/v1'
  private defaultVoiceId = 'EXAVITQu4vr4xnSDxMaL' // Rachel voice
  private timeout = 30000 // 30 seconds timeout
  private maxRetries = 3
  private retryDelay = 1000 // 1 second

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (
        retryCount < this.maxRetries &&
        (error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNRESET' ||
          error.message.includes('fetch failed'))
      ) {
        logger.warn({
          message: '🔄 Повторная попытка запроса',
          description: 'Retrying request',
          attempt: retryCount + 1,
          max_retries: this.maxRetries,
          error: error.message,
        })

        await new Promise(resolve =>
          setTimeout(resolve, this.retryDelay * (retryCount + 1))
        )
        return this.retryOperation(operation, retryCount + 1)
      }
      throw error
    }
  }

  private async getVoices(): Promise<Voice[]> {
    return this.retryOperation(async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      try {
        const response = await fetch(`${this.baseUrl}/voices`, {
          headers: {
            'xi-api-key': this.apiKey,
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(
            `Failed to get voices: ${response.status} ${response.statusText}`
          )
        }

        const data = await response.json()
        return data.voices || []
      } catch (error) {
        clearTimeout(timeoutId)
        logger.error({
          message: '❌ Ошибка получения списка голосов',
          description: 'Error getting voices list',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })
  }

  private async validateVoice(voiceId: string): Promise<string> {
    try {
      const voices = await this.getVoices()
      const voiceExists = voices.some(voice => voice.voice_id === voiceId)

      if (!voiceExists) {
        logger.warn({
          message: '⚠️ Голос не найден, используем голос по умолчанию',
          description: 'Voice not found, using default voice',
          requested_voice: voiceId,
          default_voice: this.defaultVoiceId,
        })
        return this.defaultVoiceId
      }

      return voiceId
    } catch (error) {
      logger.warn({
        message: '⚠️ Ошибка проверки голоса, используем голос по умолчанию',
        description: 'Voice validation error, using default voice',
        error: error instanceof Error ? error.message : String(error),
        requested_voice: voiceId,
        default_voice: this.defaultVoiceId,
      })
      return this.defaultVoiceId
    }
  }

  async generate({
    voice,
    model_id,
    text,
  }: GenerateOptions): Promise<Readable> {
    return this.retryOperation(async () => {
      logger.info({
        message: '🎯 Отправляем запрос к ElevenLabs API',
        description: 'Sending request to ElevenLabs API',
        voice,
        model_id,
        text_length: text.length,
      })

      // Проверяем API ключ
      if (!this.apiKey) {
        logger.error({
          message: '❌ Отсутствует API ключ',
          description: 'Missing API key',
        })
        throw new Error('ElevenLabs API key is missing')
      }

      // Проверяем и валидируем voice_id
      const validatedVoice = await this.validateVoice(voice)

      const url = `${this.baseUrl}/text-to-speech/${validatedVoice}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        // Логируем детали ответа
        logger.info({
          message: '📡 Получен ответ от API',
          description: 'API response details',
          status: response.status,
          statusText: response.statusText,
          headers: {
            'content-type': response.headers.get('content-type'),
            'content-length': response.headers.get('content-length'),
          },
        })

        if (!response.ok) {
          let errorDetails = ''
          try {
            const errorJson = await response.json()
            errorDetails = JSON.stringify(errorJson)
          } catch (e) {
            errorDetails = await response.text()
          }

          logger.error({
            message: '❌ Ошибка API',
            description: 'API error details',
            status: response.status,
            statusText: response.statusText,
            errorDetails,
            voice: validatedVoice,
            model_id,
          })

          if (response.status === 400) {
            if (errorDetails.includes('voice_id')) {
              throw new Error('Invalid voice ID')
            }
            if (errorDetails.includes('text')) {
              throw new Error('Invalid text format')
            }
            throw new Error(`Bad request: ${errorDetails}`)
          }

          if (response.status === 502) {
            throw new Error(
              'ElevenLabs API временно недоступен. Пожалуйста, попробуйте позже.'
            )
          }

          throw new Error(
            `ElevenLabs API error: ${response.status} ${response.statusText}\n${errorDetails}`
          )
        }

        if (!response.body) {
          throw new Error('No response body received from API')
        }

        logger.info({
          message: '✅ Получен ответ от API',
          description: 'Response received from API',
          status: response.status,
          voice: validatedVoice,
        })

        const reader = response.body.getReader()
        let isDestroyed = false

        return new Readable({
          read() {
            if (isDestroyed) return

            reader.read().then(
              ({ done, value }) => {
                if (done) {
                  this.push(null)
                } else {
                  try {
                    this.push(Buffer.from(value))
                  } catch (error) {
                    logger.error({
                      message: '❌ Ошибка при обработке чанка данных',
                      description: 'Error processing data chunk',
                      error:
                        error instanceof Error ? error.message : String(error),
                    })
                    this.destroy(error as Error)
                  }
                }
              },
              error => {
                logger.error({
                  message: '❌ Ошибка чтения потока',
                  description: 'Stream read error',
                  error: error instanceof Error ? error.message : String(error),
                })
                if (!isDestroyed) {
                  this.destroy(error as Error)
                }
              }
            )
          },
          destroy(error, callback) {
            isDestroyed = true
            reader.cancel().then(() => {
              if (callback) {
                callback(error)
              }
            })
            return this
          },
        })
      } catch (error) {
        clearTimeout(timeoutId)

        if (error.name === 'AbortError') {
          logger.error({
            message: '❌ Превышено время ожидания запроса',
            description: 'Request timeout exceeded',
            timeout: this.timeout,
          })
          throw new Error('Превышено время ожидания запроса к ElevenLabs API')
        }

        logger.error({
          message: '❌ Ошибка при генерации аудио',
          description: 'Error generating audio',
          error: error instanceof Error ? error.message : String(error),
          voice: validatedVoice,
          model_id,
        })
        throw error
      }
    })
  }
}

// Создаем и экспортируем экземпляр клиента
const elevenlabs = new ElevenLabsClient(process.env.ELEVENLABS_API_KEY || '')
export default elevenlabs
