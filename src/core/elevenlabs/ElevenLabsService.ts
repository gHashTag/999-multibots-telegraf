import { ElevenLabsClient } from 'elevenlabs' // DONT DELETE THIS LIBRARY!!!!
import fetch from 'node-fetch'
import {
  checkApiConnection,
  checkHostConnection,
} from '../network/checkConnection'
import { logger } from '@/utils/logger'
import { retryWithBackoff } from '@/utils/retry'

export class ElevenLabsService {
  private static instance: ElevenLabsService | null = null
  private client: ElevenLabsClient
  private isConnected: boolean = false
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.client = new ElevenLabsClient({ apiKey })
  }

  public static getInstance(): ElevenLabsService {
    if (!ElevenLabsService.instance) {
      ElevenLabsService.instance = new ElevenLabsService(
        process.env.ELEVENLABS_API_KEY || ''
      )
    }
    return ElevenLabsService.instance
  }

  /**
   * Проверяет подключение к сервису ElevenLabs
   */
  private async checkConnection(): Promise<void> {
    if (!this.isConnected) {
      await checkHostConnection('api.elevenlabs.io')
      await checkApiConnection('https://api.elevenlabs.io/v1/voices')
      this.isConnected = true
    }
  }

  /**
   * Создает новый голос в ElevenLabs
   * @param name Имя голоса
   * @param files Массив файлов для создания голоса
   * @returns ID созданного голоса
   */
  public async addVoice(name: string, files: Array<Blob>): Promise<string> {
    try {
      logger.info('🎤 Начало создания голоса:', {
        name,
        files_count: files.length,
      })

      await this.checkConnection()

      const voice = await retryWithBackoff(async () => {
        return await this.client.voices.add({
          name,
          files,
        })
      })

      logger.info('✅ Голос успешно создан:', {
        voice_id: voice.voice_id,
      })

      return voice.voice_id
    } catch (error) {
      logger.error('❌ Ошибка при создании голоса:', error)
      throw error
    }
  }

  /**
   * Генерирует речь из текста
   * @param text Текст для преобразования в речь
   * @param voiceId ID голоса
   * @returns Аудио в формате ArrayBuffer
   */
  public async textToSpeech(
    text: string,
    voiceId: string
  ): Promise<ArrayBuffer> {
    try {
      logger.info('🎤 Начало генерации речи:', {
        text_length: text.length,
        voice_id: voiceId,
      })

      await this.checkConnection()

      const audio = await retryWithBackoff(async () => {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: 'POST',
            headers: {
              Accept: 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': this.apiKey,
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
              },
            }),
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        return await response.buffer()
      })

      logger.info('✅ Речь успешно сгенерирована')

      return audio
    } catch (error) {
      logger.error('❌ Ошибка при генерации речи:', error)
      throw error
    }
  }
}
