import { InngestTestEngine } from '../inngest-test-engine'
import { createUser } from '@/core/supabase/createUser'
import fs from 'fs'
import path from 'path'
import { TestResult } from '../types'
import { voiceToTextProcessor } from '@/inngest-functions/voiceToText.inngest'

// Создаем WAV файл с минимальной длительностью 0.1 секунды
function createTestWavFile(): Buffer {
  // Параметры WAV файла
  const sampleRate = 44100 // Частота дискретизации
  const duration = 0.1 // Длительность в секундах
  const numChannels = 1 // Моно
  const bitsPerSample = 16 // 16 бит на сэмпл

  // Рассчитываем размер данных
  const numSamples = Math.ceil(sampleRate * duration)
  const dataSize = numSamples * numChannels * (bitsPerSample / 8)
  const fileSize = 44 + dataSize // 44 байта заголовка + размер данных

  // Создаем буфер для WAV файла
  const buffer = Buffer.alloc(fileSize)

  // RIFF chunk descriptor
  buffer.write('RIFF', 0) // ChunkID
  buffer.writeUInt32LE(fileSize - 8, 4) // ChunkSize
  buffer.write('WAVE', 8) // Format

  // fmt sub-chunk
  buffer.write('fmt ', 12) // Subchunk1ID
  buffer.writeUInt32LE(16, 16) // Subchunk1Size (16 для PCM)
  buffer.writeUInt16LE(1, 20) // AudioFormat (1 для PCM)
  buffer.writeUInt16LE(numChannels, 22) // NumChannels
  buffer.writeUInt32LE(sampleRate, 24) // SampleRate
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28) // ByteRate
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32) // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34) // BitsPerSample

  // data sub-chunk
  buffer.write('data', 36) // Subchunk2ID
  buffer.writeUInt32LE(dataSize, 40) // Subchunk2Size

  // Заполняем данные тишиной (все нули)
  buffer.fill(0, 44)

  return buffer
}

/**
 * Тест для проверки функциональности распознавания голоса
 */
export async function testVoiceToText(): Promise<TestResult> {
  const testName = 'Voice to Text Test'
  let testAudioPath: string | null = null

  try {
    // Создаем тестового пользователя
    const telegram_id = Date.now().toString()
    const username = `test_user_${telegram_id}`
    await createUser({
      telegram_id,
      username,
      language_code: 'ru',
      bot_name: 'test_bot',
    })

    // Создаем тестовый аудио файл
    testAudioPath = path.join(__dirname, 'test_voice.wav')
    fs.writeFileSync(testAudioPath, createTestWavFile())

    // Инициализируем тестовый движок
    const testEngine = new InngestTestEngine({
      maxWaitTime: 30000,
      eventBufferSize: 200,
    })

    // Регистрируем обработчик
    testEngine.register('voice-to-text.requested', voiceToTextProcessor)

    // Отправляем тестовое событие
    await testEngine.send({
      name: 'voice-to-text.requested',
      data: {
        fileUrl: `file://${testAudioPath}`,
        telegram_id,
        is_ru: true,
        bot_name: 'test_bot',
        username,
      },
    })

    return {
      success: true,
      name: testName,
      message: '✅ Voice to Text test completed successfully',
      startTime: Date.now(),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      name: testName,
      message: `❌ Voice to Text test failed: Voice message processing failed: Error: ${errorMessage}`,
      error: new Error(
        `Voice message processing failed: Error: ${errorMessage}`
      ),
      startTime: Date.now(),
    }
  } finally {
    // Удаляем тестовый файл
    if (testAudioPath && fs.existsSync(testAudioPath)) {
      fs.unlinkSync(testAudioPath)
    }
  }
}
