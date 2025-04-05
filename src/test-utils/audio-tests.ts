import { TelegramId } from '@/interfaces/telegram.interface';
import { logger } from '../utils/logger'
import { Buffer } from 'buffer'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Telegraf } from 'telegraf'
import { MyContext } from '../interfaces'
import { generateSpeech } from '../core/generateSpeech'

/**
 * Интерфейс для результатов теста
 */
export interface TestResult {
  success: boolean
  error?: string
  duration?: number
  testName: string
  message?: string
  details?: string
}

export async function generateAudioBuffer(
  text: string,
  voice_id: string
): Promise<Buffer> {
  logger.info({
    message: '🚀 Начинаем генерацию аудио',
    description: 'Starting audio generation',
    text,
    voice_id,
    timestamp: new Date().toISOString(),
  })

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`
  const headers = {
    'xi-api-key': process.env.ELEVENLABS_API_KEY as string,
    'Content-Type': 'application/json',
  }

  const body = {
    text,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  }

  logger.info({
    message: '📡 Отправляем запрос к ElevenLabs API',
    description: 'Sending request to ElevenLabs API',
    url,
    voice_id,
    timestamp: new Date().toISOString(),
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(
        `ElevenLabs API вернула ошибку: ${response.status} ${response.statusText}`
      )
    }

    if (!response.body) {
      throw new Error('Не получен стрим от API')
    }

    logger.info({
      message: '📡 Получен ответ от API, начинаем чтение бинарных данных',
      description: 'Response received from API, starting binary data reading',
      timestamp: new Date().toISOString(),
    })

    const chunks: Uint8Array[] = []
    let totalSize = 0
    let isReading = true

    const reader = response.body.getReader()

    while (isReading) {
      const { done, value } = await reader.read()

      if (done) {
        logger.info({
          message: '✅ Чтение стрима завершено',
          description: 'Stream reading completed',
          totalSize,
          timestamp: new Date().toISOString(),
        })
        isReading = false
        continue
      }

      chunks.push(value)
      totalSize += value.length
      logger.debug({
        message: '📦 Получен чанк данных',
        description: 'Data chunk received',
        chunkSize: value.length,
        totalSize,
        timestamp: new Date().toISOString(),
      })
    }

    const audioBuffer = Buffer.concat(chunks)
    logger.info({
      message: '✅ Аудио буфер создан',
      description: 'Audio buffer created',
      size: audioBuffer.length,
      timestamp: new Date().toISOString(),
    })

    if (audioBuffer.length === 0) {
      throw new Error('Получен пустой аудио буфер')
    }

    return audioBuffer
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при генерации аудио',
      description: 'Error generating audio',
      error: error instanceof Error ? error.message : String(error),
      voice_id,
      timestamp: new Date().toISOString(),
    })
    throw error
  }
}

export async function testAudioGeneration(): Promise<TestResult> {
  const startTime = Date.now()
  const testName = 'Audio Generation Test'

  try {
    logger.info({
      message: '🎯 Запуск теста генерации аудио',
      description: 'Starting audio generation test',
    })

    // Тестовые данные
    const testText = 'Hello, this is a test.'
    const testVoiceId = 'ljyyJh982fsUinaSQPvv'

    // Генерируем аудио буфер
    const audioBuffer = await generateAudioBuffer(testText, testVoiceId)

    // Проверяем, что буфер не пустой
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Аудио буфер пустой или не создан')
    }

    // Проверяем, что это действительно Buffer
    if (!Buffer.isBuffer(audioBuffer)) {
      throw new Error('Результат не является Buffer')
    }

    // Сохраняем буфер во временный файл для проверки
    const tempFile = path.join(os.tmpdir(), `test-audio-${Date.now()}.mp3`)
    await fs.promises.writeFile(tempFile, new Uint8Array(audioBuffer))

    logger.info({
      message: '✅ Тест успешно завершен',
      description: 'Test completed successfully',
      bufferSize: audioBuffer.length,
      tempFile,
    })

    return {
      success: true,
      duration: Date.now() - startTime,
      testName,
      message: 'Аудио успешно сгенерировано и сохранено',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте генерации аудио',
      description: 'Error in audio generation test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      testName,
      message: 'Ошибка при генерации аудио',
    }
  }
}

async function mockBot() {
  const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN || 'mock-token')

  // Мокаем методы бота
  bot.telegram.sendMessage = async () => {
    logger.info({
      message: '📤 Отправка сообщения в Telegram',
      description: 'Sending message to Telegram (mocked)',
    })
    return {} as any
  }

  bot.telegram.sendAudio = async () => {
    logger.info({
      message: '🎵 Отправка аудио в Telegram',
      description: 'Sending audio to Telegram (mocked)',
    })
    return {} as any
  }

  return bot
}

// Мокаем переменные окружения для тестов
process.env.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'mock-key'

export async function testSpeechGeneration(): Promise<TestResult> {
  const startTime = Date.now()
  const testName = 'Speech Generation Test'

  try {
    logger.info({
      message: '🎯 Запуск теста генерации речи',
      description: 'Starting speech generation test',
    })

    // Тестовые данные
    const testText = 'Hello, this is a test.'
    const testVoiceId = 'ljyyJh982fsUinaSQPvv'
    const testTelegramId = '123456789'
    const bot = await mockBot()

    // Генерируем аудио
    const result = await generateSpeech({
      text: testText,
      voice_id: testVoiceId,
      telegram_id: testTelegramId,
      is_ru: false,
      bot,
      bot_name: 'test_bot',
    })

    // Проверяем, что файл создан
    if (!fs.existsSync(result.audioUrl)) {
      throw new Error('Аудио файл не создан')
    }

    // Проверяем размер файла
    const stats = fs.statSync(result.audioUrl)
    if (stats.size === 0) {
      throw new Error('Аудио файл пустой')
    }

    logger.info({
      message: '✅ Тест успешно завершен',
      description: 'Test completed successfully',
      audioUrl: result.audioUrl,
      fileSize: stats.size,
    })

    // Удаляем временный файл
    fs.unlinkSync(result.audioUrl)

    return {
      success: true,
      duration: Date.now() - startTime,
      testName,
      message: 'Аудио успешно сгенерировано и отправлено',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте генерации речи',
      description: 'Error in speech generation test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      testName,
      message: 'Ошибка при генерации речи',
    }
  }
}
