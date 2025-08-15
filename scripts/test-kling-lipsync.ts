#!/usr/bin/env bun

import { generateKlingLipSync } from '../src/core/replicate/generateKlingLipSync'
import { logger } from '../src/utils/logger'

async function testKlingLipSync() {
  console.log('🧪 Тестируем Kling LipSync...\n')

  // Тестовые данные с публичными URL
  // Видео: короткое тестовое видео (15 секунд)
  const testVideoUrl = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  // Аудио: короткий mp3 файл (меньше 5MB)
  const testAudioUrl = 'https://file-examples.com/storage/fe1170c816762d3e51cbce0/2017/11/file_example_MP3_700KB.mp3'
  const testTelegramId = 'test_user_123'

  try {
    console.log('📤 Отправляем запрос к Replicate API...')
    console.log('Video URL:', testVideoUrl)
    console.log('Audio URL:', testAudioUrl)
    console.log('Telegram ID:', testTelegramId)
    console.log('\n')

    const result = await generateKlingLipSync(
      testTelegramId,
      testVideoUrl,
      testAudioUrl,
      true
    )

    console.log('✅ Результат получен:')
    console.log(JSON.stringify(result, null, 2))

    // Проверяем тип результата
    if ('message' in result && 'error' in result) {
      console.log('\n❌ Получена ошибка от API:')
      console.log('Message:', result.message)
      console.log('Error:', result.error)
    } else if ('id' in result && 'status' in result) {
      console.log('\n✅ Prediction создан успешно:')
      console.log('ID:', result.id)
      console.log('Status:', result.status)
      console.log('Output:', result.output)
    }
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении теста:')
    console.error(error)
    
    if (error instanceof Error) {
      console.error('\nДетали ошибки:')
      console.error('Message:', error.message)
      console.error('Stack:', error.stack)
    }
  }
}

// Запускаем тест
testKlingLipSync()
