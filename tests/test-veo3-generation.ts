import { generateTextToVideo, checkVideoGenerationStatus } from '../src/services/generateTextToVideo'
import { config } from 'dotenv'
import { logger } from '../src/utils/logger'

// Загружаем переменные окружения
config({ path: '.env' })

// Используем production API
process.env.USE_PRODUCTION_API = 'true'

async function testVeo3Generation() {
  console.log('🚀 Начинаем тест генерации видео Veo 3...')
  
  const testParams = {
    prompt: 'shaman dancing in forest',
    videoModel: 'veo-3-fast' as const,
    telegram_id: '144022504',
    username: 'test_user',
    is_ru: true,
    bot_name: 'test_bot',
    aspectRatio: '9:16',
    duration: 8
  }
  
  console.log('📋 Параметры теста:', testParams)
  
  try {
    // Шаг 1: Запуск генерации
    console.log('\n📡 Отправляем запрос на генерацию...')
    const response = await generateTextToVideo(testParams)
    
    console.log('\n✅ Ответ от сервера:')
    console.log(JSON.stringify(response, null, 2))
    
    if (!response.success) {
      console.error('❌ Генерация не удалась:', response.error)
      return
    }
    
    // Если есть jobId, проверяем статус
    if (response.jobId) {
      console.log(`\n⏳ Получен jobId: ${response.jobId}`)
      console.log('Проверяем статус генерации...')
      
      let attempts = 0
      const maxAttempts = 60 // 5 минут максимум
      
      const checkStatus = async () => {
        attempts++
        console.log(`\n🔄 Попытка ${attempts}/${maxAttempts}...`)
        
        const statusResponse = await checkVideoGenerationStatus(response.jobId!, testParams.is_ru)
        console.log('Статус:', JSON.stringify(statusResponse, null, 2))
        
        if (statusResponse.success && statusResponse.videoUrl) {
          console.log('\n🎉 Видео готово!')
          console.log('📹 URL видео:', statusResponse.videoUrl)
          return true
        } else if (!statusResponse.success && statusResponse.error) {
          console.error('\n❌ Ошибка генерации:', statusResponse.error)
          return false
        }
        
        return null // Продолжаем проверку
      }
      
      // Проверяем статус каждые 5 секунд
      while (attempts < maxAttempts) {
        const result = await checkStatus()
        if (result !== null) break
        
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
      
      if (attempts >= maxAttempts) {
        console.error('⏱️ Таймаут: генерация заняла слишком много времени')
      }
    } else if (response.videoUrl) {
      // Видео готово сразу
      console.log('\n🎉 Видео готово сразу!')
      console.log('📹 URL видео:', response.videoUrl)
    } else {
      console.log('\n⚠️ Нет ни jobId, ни videoUrl в ответе')
    }
    
  } catch (error) {
    console.error('\n❌ Ошибка при тестировании:', error)
  }
}

// Запускаем тест
testVeo3Generation()
  .then(() => {
    console.log('\n✅ Тест завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Критическая ошибка:', error)
    process.exit(1)
  })