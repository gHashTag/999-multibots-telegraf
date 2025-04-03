import { logger } from '../utils/logger'
import { Buffer } from 'buffer'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { TestResult } from './types'

import { createAudioFileFromText } from '@/core/elevenlabs/createAudioFileFromText'

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
      name: testName,
      passed: true,
      success: true,
      duration: Date.now() - startTime,
      message: 'Аудио успешно сгенерировано и сохранено',
      testName: 'AudioGenerationTest',
      details: [`Buffer size: ${audioBuffer.length}`, `Saved to: ${tempFile}`],
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте генерации аудио',
      description: 'Error in audio generation test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      name: testName,
      passed: false,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      message: 'Ошибка при генерации аудио',
      testName: 'AudioGenerationTest',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
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

    // Генерируем аудио
    const audioUrl = await createAudioFileFromText({
      text: testText,
      voice_id: testVoiceId,
    })

    // Проверяем, что файл создан
    if (!fs.existsSync(audioUrl)) {
      throw new Error('Аудио файл не создан')
    }

    // Проверяем размер файла
    const stats = fs.statSync(audioUrl)
    if (stats.size === 0) {
      throw new Error('Аудио файл пустой')
    }

    logger.info({
      message: '✅ Тест успешно завершен',
      description: 'Test completed successfully',
      audioUrl,
      fileSize: stats.size,
    })

    // Удаляем временный файл
    fs.unlinkSync(audioUrl)

    return {
      name: testName,
      passed: true,
      success: true,
      duration: Date.now() - startTime,
      message: 'Аудио успешно сгенерировано',
      testName: 'SpeechGenerationTest',
      details: { audioUrl, fileSize: stats.size },
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте генерации речи',
      description: 'Error in speech generation test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      name: testName,
      passed: false,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      message: 'Ошибка при генерации речи',
      testName: 'SpeechGenerationTest',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
