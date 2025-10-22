/**
 * Тест Fal.ai API напрямую
 */

require('dotenv').config()
const axios = require('axios')

async function testFalApi() {
  try {
    console.log('🔍 Тестируем Fal.ai API...')
    
    const FAL_KEY = process.env.FAL_KEY
    if (!FAL_KEY) {
      console.error('❌ FAL_KEY не установлен')
      return
    }
    
    console.log('✅ FAL_KEY найден:', FAL_KEY.substring(0, 20) + '...')
    
    const testData = {
      image_url: 'https://example.com/test-image.jpg',
      audio_url: 'https://example.com/test-audio.mp3',
      resolution: '720p'
    }
    
    console.log('📡 Отправляем запрос к Fal.ai API...')
    console.log('URL:', 'https://fal.run/veed/fabric-1.0/fast')
    console.log('Data:', testData)
    
    const response = await axios.post(
      'https://fal.run/veed/fabric-1.0/fast',
      testData,
      {
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )
    
    console.log('✅ Ответ получен:')
    console.log('Status:', response.status)
    console.log('Data:', JSON.stringify(response.data, null, 2))
    
  } catch (error) {
    console.error('❌ Ошибка Fal.ai API:')
    console.error('Message:', error.message)
    console.error('Status:', error.response?.status)
    console.error('Status Text:', error.response?.statusText)
    console.error('Response Data:', error.response?.data)
    console.error('Headers:', error.response?.headers)
  }
}

testFalApi()
