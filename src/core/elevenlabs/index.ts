import { logger } from '../../utils/logger'
import { Readable } from 'stream'

interface GenerateOptions {
  voice: string
  model_id: string
  text: string
}

class ElevenLabsClient {
  private apiKey: string
  private baseUrl = 'https://api.elevenlabs.io/v1'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generate({
    voice,
    model_id,
    text,
  }: GenerateOptions): Promise<Readable> {
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

    // Проверяем voice_id
    if (!voice) {
      logger.error({
        message: '❌ Отсутствует voice_id',
        description: 'Missing voice_id',
      })
      throw new Error('Voice ID is missing')
    }

    const url = `${this.baseUrl}/text-to-speech/${voice}`

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
      })

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
          voice,
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
      })

      const reader = response.body.getReader()
      return new Readable({
        read() {
          reader.read().then(
            ({ done, value }) => {
              if (done) {
                this.push(null)
              } else {
                this.push(Buffer.from(value))
              }
            },
            error => {
              logger.error({
                message: '❌ Ошибка чтения потока',
                description: 'Stream read error',
                error: error instanceof Error ? error.message : String(error),
              })
              this.destroy(error)
            }
          )
        },
      })
    } catch (error) {
      logger.error({
        message: '❌ Ошибка запроса к API',
        description: 'API request error',
        error: error instanceof Error ? error.message : String(error),
        voice,
        model_id,
      })
      throw error
    }
  }
}

// Создаем и экспортируем экземпляр клиента
const elevenLabsClient = new ElevenLabsClient(
  process.env.ELEVENLABS_API_KEY || ''
)
export default elevenLabsClient
