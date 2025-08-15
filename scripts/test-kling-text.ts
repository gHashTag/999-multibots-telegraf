#!/usr/bin/env bun

import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

async function testKlingWithText() {
  console.log('🧪 Тестируем Kling LipSync с текстом...\n')

  try {
    // Используем короткое видео и текст вместо аудио
    const input = {
      video_url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      text: 'Hello, this is a test of the lip sync feature.',
      voice_id: 'en_AOT', // английский голос
    }

    console.log('📤 Отправляем запрос к Replicate API...')
    console.log('Input:', JSON.stringify(input, null, 2))
    console.log('\n')

    const prediction = await replicate.run('kwaivgi/kling-lip-sync', {
      input,
    })

    console.log('✅ Результат получен:')
    console.log('Type:', typeof prediction)
    console.log('Is Array:', Array.isArray(prediction))
    
    if (typeof prediction === 'string') {
      console.log('Result URL:', prediction)
    } else if (Array.isArray(prediction)) {
      console.log('Result (array):', prediction)
    } else {
      console.log('Result (object):', JSON.stringify(prediction, null, 2))
    }

  } catch (error) {
    console.error('\n❌ Ошибка:')
    console.error(error)
    
    if (error instanceof Error) {
      console.error('\nДетали ошибки:')
      console.error('Message:', error.message)
      console.error('Stack:', error.stack)
    }
  }
}

testKlingWithText()
