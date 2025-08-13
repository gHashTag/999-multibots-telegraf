import dotenv from 'dotenv'
import path from 'path'
import {
  generateTextToVideo,
  checkVideoGenerationStatus,
} from './services/generateTextToVideo'

// Загружаем переменные окружения
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function testTextToVideoGeneration() {
  console.log('🚀 Starting text-to-video generation test...')
  console.log('----------------------------------------')

  // Тестовые параметры
  const testRequest = {
    prompt:
      'A majestic white cat wearing a starry wizard robe, casting magical spells with floating golden sparkles in a mystical forest',
    videoModel: 'veo-3' as const,
    telegram_id: '144022504',
    username: 'playra',
    is_ru: false,
    bot_name: 'neuro_blogger_bot',
  }

  console.log('📝 Test parameters:')
  console.log('- Prompt:', testRequest.prompt)
  console.log('- Model:', testRequest.videoModel)
  console.log('- User:', testRequest.username)
  console.log('- Bot:', testRequest.bot_name)
  console.log('----------------------------------------')

  try {
    // Отправляем запрос на генерацию
    console.log('⏳ Sending generation request...')
    const response = await generateTextToVideo(testRequest)

    // Проверяем, начался ли процесс генерации
    if (response.message === 'Processing started') {
      console.log('✅ Video generation started successfully!')
      console.log('- Message:', response.message)
      console.log(
        'ℹ️ Note: The current API endpoint starts processing but does not return jobId or videoUrl yet.'
      )
      console.log('This is expected behavior for the initial implementation.')
      return
    }

    if (!response.success) {
      console.error('❌ Generation failed:', response.error || 'Unknown error')
      return
    }

    console.log('✅ Initial response received!')
    console.log('- Success:', response.success)
    console.log('- Job ID:', response.jobId)
    console.log('- Video URL:', response.videoUrl)
    console.log('- Message:', response.message)

    // Если есть jobId, проверяем статус генерации
    if (response.jobId && !response.videoUrl) {
      console.log('----------------------------------------')
      console.log('🔄 Video is being generated. Checking status...')

      let attempts = 0
      const maxAttempts = 60 // Максимум 5 минут (60 * 5 сек)

      while (attempts < maxAttempts) {
        await sleep(5000) // Ждем 5 секунд между проверками
        attempts++

        console.log(
          `⏳ Checking status... (attempt ${attempts}/${maxAttempts})`
        )
        const statusResponse = await checkVideoGenerationStatus(
          response.jobId,
          testRequest.is_ru
        )

        if (statusResponse.success && statusResponse.videoUrl) {
          console.log('🎉 Video generated successfully!')
          console.log('📹 Video URL:', statusResponse.videoUrl)
          break
        } else if (!statusResponse.success) {
          console.error('❌ Status check failed:', statusResponse.error)
          break
        }
      }

      if (attempts >= maxAttempts) {
        console.error('⏱️ Timeout: Video generation took too long')
      }
    } else if (response.videoUrl) {
      console.log('🎉 Video generated immediately!')
      console.log('📹 Video URL:', response.videoUrl)
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }

  console.log('----------------------------------------')
  console.log('✅ Test completed!')
}

// Запускаем тест
testTextToVideoGeneration().catch(console.error)
