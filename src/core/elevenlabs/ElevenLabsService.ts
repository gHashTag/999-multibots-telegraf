import { ElevenLabsClient } from 'elevenlabs'
import { Readable } from 'stream'
import {
  checkHostConnection,
  checkApiConnection,
  retryWithBackoff,
} from '../network/checkConnection'

export class ElevenLabsService {
  private static instance: ElevenLabsService
  private client: ElevenLabsClient
  private readonly API_HOST = 'api.elevenlabs.io'
  private readonly API_URL = 'https://api.elevenlabs.io/v1/user'

  private constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not set')
    }
    this.client = new ElevenLabsClient({
      apiKey,
    })
  }

  public static getInstance(): ElevenLabsService {
    if (!ElevenLabsService.instance) {
      ElevenLabsService.instance = new ElevenLabsService()
    }
    return ElevenLabsService.instance
  }

  /**
   * Проверяет подключение к API ElevenLabs
   */
  private async checkConnection(): Promise<void> {
    console.log('🔍 Проверка подключения к ElevenLabs:', {
      description: 'Checking ElevenLabs connection',
      host: this.API_HOST,
    })

    const isDnsOk = await checkHostConnection(this.API_HOST)
    if (!isDnsOk) {
      throw new Error('DNS resolution failed for ElevenLabs API')
    }

    const isApiOk = await checkApiConnection(this.API_URL)
    if (!isApiOk) {
      throw new Error('Cannot connect to ElevenLabs API')
    }

    console.log('✅ Подключение к ElevenLabs проверено:', {
      description: 'ElevenLabs connection verified',
    })
  }

  /**
   * Генерирует речь из текста
   * @param text - Текст для преобразования в речь
   * @param voice - ID голоса для использования
   * @returns Readable поток с аудио данными
   */
  public async generateSpeech(text: string, voice: string): Promise<Readable> {
    try {
      console.log('🎙️ Начало генерации речи:', {
        text_length: text.length,
        voice,
      })

      // Проверяем подключение перед генерацией
      await this.checkConnection()

      // Используем retry для операции генерации
      const audioStream = await retryWithBackoff(
        async () => {
          const stream = await this.client.generate({
            text,
            voice,
            model_id: 'eleven_multilingual_v2',
          })

          if (!stream) {
            throw new Error('Не удалось получить аудио поток от ElevenLabs API')
          }

          if (!(stream instanceof Readable)) {
            throw new Error('Полученный аудио поток имеет неверный формат')
          }

          return stream
        },
        3, // максимальное количество попыток
        1000 // начальная задержка в мс
      )

      console.log('✅ Получен аудио поток')
      return audioStream
    } catch (error) {
      console.error('❌ Ошибка при генерации речи:', error)
      throw error
    }
  }

  /**
   * Добавляет новый голос
   * @param name - Имя голоса
   * @param description - Описание голоса
   * @param files - Массив файлов для обучения голоса
   * @param labels - Метки для голоса (опционально)
   * @returns ID созданного голоса
   */
  public async addVoice(
    name: string,
    description: string,
    files: string[],
    labels?: string
  ): Promise<string> {
    try {
      console.log('🎤 Начало создания голоса:', {
        name,
        description,
        files_count: files.length,
      })

      // Проверяем подключение перед созданием голоса
      await this.checkConnection()

      // Используем retry для операции создания голоса
      const voice = await retryWithBackoff(
        async () => {
          return await this.client.voices.add({
            name,
            description,
            files,
            labels,
          })
        },
        3,
        1000
      )

      console.log('✅ Голос успешно создан:', {
        voice_id: voice.voice_id,
      })

      return voice.voice_id
    } catch (error) {
      console.error('❌ Ошибка при создании голоса:', error)
      throw error
    }
  }
}
