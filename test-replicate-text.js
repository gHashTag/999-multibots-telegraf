#!/usr/bin/env node

/**
 * 🕉️ ТЕСТ: Replicate API с TEXT вместо аудио
 * Проверяем работу Kling Lip-Sync с text параметром
 */

const Replicate = require('replicate')
require('dotenv').config()

// Проверяем есть ли токен
if (!process.env.REPLICATE_API_TOKEN) {
  console.error('❌ REPLICATE_API_TOKEN не найден в .env файле!')
  process.exit(1)
}

console.log('🔍 Replicate API Token найден:', process.env.REPLICATE_API_TOKEN.substring(0, 8) + '...')

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Используем текст вместо аудио
const TEST_DATA = {
  videoUrl: 'https://44ed576f17a7.ngrok.app/temp/1754490140931_d3c8f4310f2227b3.mp4',
  text: 'Привет! Это тест синхронизации губ с помощью искусственного интеллекта Kling.',
}

async function testReplicateText() {
  console.log('🧪 [TEST] Начинаем тест Replicate API с TEXT вместо аудио...')
  
  console.log('🔍 [TEST] Параметры:')
  console.log(`   Видео: ${TEST_DATA.videoUrl}`)
  console.log(`   Текст: "${TEST_DATA.text}"`)
  
  try {
    const replicateInput = {
      input: {
        video_url: TEST_DATA.videoUrl,
        text: TEST_DATA.text,
        // НЕ передаем audio_url, используем только text
      }
    }
    
    console.log('🎯 [TEST] Prepared Replicate input:', {
      modelId: 'kwaivgi/kling-lip-sync',
      video_url: TEST_DATA.videoUrl.substring(0, 80) + '...',
      text: TEST_DATA.text.substring(0, 50) + '...',
    })
    
    console.log('🚀 [TEST] Calling replicate.run with TEXT...')
    const prediction = await replicate.run(
      'kwaivgi/kling-lip-sync',
      replicateInput
    )
    
    console.log('🎉 [TEST] УСПЕХ! Replicate API работает с TEXT!')
    console.log('📥 [TEST] Результат:', typeof prediction === 'string' ? prediction.substring(0, 200) + '...' : prediction)
    
    return true
    
  } catch (error) {
    console.log('💥 [TEST] ОШИБКА в Replicate API:')
    console.log('   Message:', error.message)
    
    if (error.message.includes('text is required when no audio is provided')) {
      console.log('🤔 [TEST] Интересно... всё равно требует аудио даже с text!')
      console.log('💡 [TEST] Возможные решения:')
      console.log('   1. Попробовать передать И text И audio_url одновременно')
      console.log('   2. Сконвертировать аудио в WAV формат')
      console.log('   3. Удлинить аудиодорожку до минимум 10 секунд')
    }
    
    return false
  }
}

testReplicateText().catch(console.error)