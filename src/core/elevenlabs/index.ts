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
    })

    const url = `${this.baseUrl}/text-to-speech/${voice}`
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

    if (!response.ok) {
      throw new Error(
        `ElevenLabs API error: ${response.status} ${response.statusText}`
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
            this.destroy(error)
          }
        )
      },
    })
  }
}

// Создаем и экспортируем экземпляр клиента
const elevenLabsClient = new ElevenLabsClient(
  process.env.ELEVENLABS_API_KEY || ''
)
export default elevenLabsClient
