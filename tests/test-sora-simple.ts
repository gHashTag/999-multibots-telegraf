/**
 * Простой тест Sora 2 через Kie.ai (без Telegram)
 *
 * ВАЖНО: API ключи загружаются из .env файла!
 * Перед запуском убедитесь, что в .env есть KIE_AI_API_KEY
 */

import { KieAiProvider } from '../src/services/video-providers/KieAiProvider'
import * as dotenv from 'dotenv'

// Загрузка переменных окружения из .env
dotenv.config()

if (!process.env.KIE_AI_API_KEY) {
  console.error('❌ ERROR: KIE_AI_API_KEY not found in .env file!')
  process.exit(1)
}

async function testSora() {
  console.log('\n🎬 ТЕСТ SORA 2 (Kie.ai)\n')
  console.log('='.repeat(60))

  const provider = new KieAiProvider()

  // Профессиональный промпт
  const enhancedPrompt = `Cinematic sci-fi style, wide tracking shot at street level,
humanoid robot with glowing blue circuitry walks slowly through rain-soaked neon-lit street,
wet pavement reflecting colorful shop signs and holograms,
camera tracks from behind at walking pace, low angle emphasizing robot against towering buildings,
dramatic single-source lighting from overhead neon, blue-purple color palette with warm accent lights,
ambient sound of rain, distant traffic, mechanical footsteps`

  console.log('\n📝 ПРОМПТ:')
  console.log(enhancedPrompt)
  console.log('\n' + '='.repeat(60))

  console.log('\n⏳ Отправка запроса в Kie.ai...')

  const result = await provider.generateVideo({
    model: 'sora-2',
    prompt: enhancedPrompt,
    duration: 10,
    aspectRatio: '16:9'
  })

  console.log('\n📊 РЕЗУЛЬТАТ:')
  console.log('Success:', result.success)
  console.log('Provider:', result.provider)
  console.log('Model:', result.model)

  if (result.success && result.data) {
    console.log('\n✅ УСПЕШНО!')
    console.log('Task ID:', result.data.taskId)
    console.log('Duration:', result.data.duration, 'seconds')
    console.log('Video URL:', result.data.videoUrl || 'pending')
    console.log('Cost: $' + result.cost.usd.toFixed(3), '(' + result.cost.stars + '⭐)')
    console.log('Processing time:', result.processingTime, 'ms')

    // Если есть taskId, можно проверить статус
    if (result.data.taskId && !result.data.videoUrl) {
      console.log('\n⏳ Видео генерируется асинхронно')
      console.log('Task ID для проверки:', result.data.taskId)
      console.log('Проверить статус можно через checkVideoStatus(taskId)')
    }
  } else {
    console.log('\n❌ ОШИБКА:',  result.error)
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ ТЕСТ ЗАВЕРШЕН\n')
}

testSora()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Ошибка:', error)
    process.exit(1)
  })
