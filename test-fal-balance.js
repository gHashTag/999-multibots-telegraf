/**
 * Тест баланса и ключа Fal.ai
 */

require('dotenv').config()
const { fal } = require('@fal-ai/client')

async function testFalBalance() {
  try {
    console.log('🔍 Проверяем баланс и ключ Fal.ai...')
    
    const FAL_KEY = process.env.FAL_KEY
    if (!FAL_KEY) {
      console.error('❌ FAL_KEY не установлен')
      return
    }
    
    console.log('✅ FAL_KEY найден:', FAL_KEY.substring(0, 20) + '...')
    
    // Устанавливаем ключ для fal клиента
    fal.config({
      credentials: FAL_KEY
    })
    
    console.log('📡 Тестируем VEED/fabric-1.0/fast...')
    
    const result = await fal.subscribe("VEED/fabric-1.0/fast", {
      input: {
        image_url: "https://v3b.fal.media/files/b/kangaroo/njT1l9rhs9aPiJTINV_Bu_IMG_7135.JPG",
        audio_url: "https://v3b.fal.media/files/b/zebra/dGoIz0ifgjJZbc_CGx80I_dpbelarus.ogg",
        resolution: "720p"
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    })
    
    console.log('✅ Результат получен:')
    console.log('Data:', result.data)
    console.log('Request ID:', result.requestId)
    
  } catch (error) {
    console.error('❌ Ошибка Fal.ai:')
    console.error('Message:', error.message)
    console.error('Status:', error.status)
    console.error('Response:', error.response)
  }
}

testFalBalance()
