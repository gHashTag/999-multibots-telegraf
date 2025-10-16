/**
 * 🎬 Тест Sora 2 Image-to-Video
 */

import * as dotenv from 'dotenv'
import { KieAiProvider } from '../src/services/video-providers/KieAiProvider'

dotenv.config()

// Фото пользователя (замените на реальный URL)
const USER_IMAGE_URL = process.env.TEST_IMAGE_URL || 'https://example.com/user-photo.jpg'

const TEST_PROMPT = `Динамичное движение, профессиональное освещение, кинематографический стиль`

async function testSoraImageToVideo() {
  console.log('\n🎬 ============ ТЕСТ SORA 2 IMAGE-TO-VIDEO ============\n')
  console.log('📸 Изображение:', USER_IMAGE_URL)
  console.log('📐 Aspect Ratio: 9:16 (portrait)')
  console.log('⏱️  Длительность: 10 секунд')
  console.log('\n' + '='.repeat(70) + '\n')

  const provider = new KieAiProvider()

  // === SORA 2 I2V ===
  console.log('🎬 Тест 1: Sora 2 Image-to-Video (Standard)\n')
  console.log('─'.repeat(70))

  try {
    const result1 = await provider.generateSoraVideo(
      TEST_PROMPT, // опциональный промпт для управления движением
      'sora-2-image-to-video',
      'portrait', // 9:16
      true, // remove watermark
      10, // duration
      'standard', // size
      USER_IMAGE_URL // image URL
    )

    if (result1.success) {
      console.log('✅ Sora 2 I2V - Task создан!')
      console.log('   Task ID:', result1.data?.taskId)
      console.log('   Стоимость:', result1.cost.stars + '⭐', `($${result1.cost.usd})`)
      console.log('   Webhook: https://three-head-dragon.shop/api/kie-ai/sora-callback')
    } else {
      console.log('❌ Ошибка:', result1.error)
    }
  } catch (error) {
    console.log('❌ Критическая ошибка:', error.message)
  }

  console.log('\n' + '='.repeat(70) + '\n')

  // === SORA 2 PRO I2V ===
  console.log('🎬 Тест 2: Sora 2 Pro Image-to-Video (Standard)\n')
  console.log('─'.repeat(70))

  try {
    const result2 = await provider.generateSoraVideo(
      TEST_PROMPT,
      'sora-2-pro-image-to-video',
      'portrait', // 9:16
      true, // remove watermark
      10, // duration
      'standard', // size
      USER_IMAGE_URL // image URL
    )

    if (result2.success) {
      console.log('✅ Sora 2 Pro I2V - Task создан!')
      console.log('   Task ID:', result2.data?.taskId)
      console.log('   Стоимость:', result2.cost.stars + '⭐', `($${result2.cost.usd})`)
      console.log('   Webhook: https://three-head-dragon.shop/api/kie-ai/sora-callback')
    } else {
      console.log('❌ Ошибка:', result2.error)
    }
  } catch (error) {
    console.log('❌ Критическая ошибка:', error.message)
  }

  console.log('\n' + '='.repeat(70))
  console.log('✅ Тестирование завершено!')
  console.log('='.repeat(70) + '\n')
}

testSoraImageToVideo()
  .then(() => {
    console.log('✅ Скрипт успешно завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Ошибка:', error)
    process.exit(1)
  })
