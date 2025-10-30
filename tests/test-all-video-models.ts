/**
 * 🎬 Полное тестирование ВСЕХ видео моделей
 *
 * - Text-to-Video модели
 * - Image-to-Video модели с фото пользователя
 * - Aspect ratio 9:16 (portrait)
 * - Callback URL для webhook
 */

import * as dotenv from 'dotenv'
import { KieAiProvider } from '../src/services/video-providers/KieAiProvider'
import { VIDEO_MODELS } from '../src/services/videoModels'

dotenv.config()

// Стандартный промпт
const TEST_PROMPT = `Уже в эту пятницу, 17 октября, в 11:00 приглашаю вас в Café 13 на бизнес-завтрак IP Business Club.

Я поделюсь своим опытом создания ИИ-агентов — расскажу, как можно просто и быстро создавать приложения и ботов с помощью вайбкодинга, используя обычный язык вместо программирования.`

// Фото пользователя для image-to-video (сохранить локально или использовать URL)
const USER_IMAGE_URL = process.env.TEST_IMAGE_URL || 'https://example.com/user-photo.jpg'

// Callback URL
const CALLBACK_BASE = process.env.BASE_WEBHOOK_URL || 'https://three-head-dragon.shop'

async function testAllModels() {
  console.log('\n🎬 ============ ТЕСТИРОВАНИЕ ВСЕХ ВИДЕО МОДЕЛЕЙ ============\n')
  console.log('📐 Aspect Ratio: 9:16 (portrait)')
  console.log('📡 Callback URL: ' + CALLBACK_BASE)
  console.log('🖼️  Test Image: ' + USER_IMAGE_URL)
  console.log('\n' + '='.repeat(70) + '\n')

  const provider = new KieAiProvider()
  const results = []

  // Получаем все модели
  const allModels = Object.values(VIDEO_MODELS)

  console.log(`📊 Всего моделей: ${allModels.length}`)
  console.log(`   Text-to-Video: ${allModels.filter(m => m.inputTypes.includes('text')).length}`)
  console.log(`   Image-to-Video: ${allModels.filter(m => m.inputTypes.includes('image')).length}`)
  console.log('\n' + '='.repeat(70) + '\n')

  // === TEXT-TO-VIDEO МОДЕЛИ ===
  console.log('📝 TEXT-TO-VIDEO МОДЕЛИ:\n')

  const textModels = allModels.filter(m => m.inputTypes.includes('text'))

  for (const model of textModels) {
    console.log(`\n🎬 Тестирую: ${model.name} (${model.id})`)
    console.log('─'.repeat(70))

    try {
      // Для Sora моделей используем специальный метод
      if (model.id === 'sora-2' || model.id === 'sora-2-pro') {
        const result = await provider.generateSoraVideo(
          TEST_PROMPT,
          model.id === 'sora-2' ? 'sora-2-text-to-video' : 'sora-2-pro-text-to-video',
          'portrait', // 9:16
          true, // remove watermark
          10, // duration
          'standard' // size
        )

        if (result.success) {
          console.log(`✅ Task создан: ${result.data?.taskId}`)
          console.log(`💰 Стоимость: ${result.cost.stars}⭐ ($${result.cost.usd})`)
          console.log(`📡 Webhook: ${CALLBACK_BASE}/api/kie-ai/sora-callback`)
          results.push({
            model: model.name,
            type: 'text',
            success: true,
            taskId: result.data?.taskId,
            cost: result.cost.stars
          })
        } else {
          console.log(`❌ Ошибка: ${result.error}`)
          results.push({
            model: model.name,
            type: 'text',
            success: false,
            error: result.error
          })
        }
      }
      // Другие Kie.ai модели
      else if (['veo3_fast', 'veo3', 'runway-aleph'].includes(model.id)) {
        const result = await provider.generateVideo({
          prompt: TEST_PROMPT,
          model: model.id,
          duration: model.defaultDuration || 8,
          aspectRatio: '9:16'
        })

        if (result.success) {
          console.log(`✅ Task создан: ${result.data?.taskId}`)
          console.log(`💰 Стоимость: ${result.cost.stars}⭐ ($${result.cost.usd})`)
          console.log(`📡 Webhook: ${CALLBACK_BASE}/api/kie-ai/callback`)
          results.push({
            model: model.name,
            type: 'text',
            success: true,
            taskId: result.data?.taskId,
            cost: result.cost.stars
          })
        } else {
          console.log(`❌ Ошибка: ${result.error}`)
          results.push({
            model: model.name,
            type: 'text',
            success: false,
            error: result.error
          })
        }
      }
      // Replicate модели (polling, no webhook)
      else {
        console.log(`⚠️  ${model.name} - Replicate модель (polling)`)
        console.log(`   Пропускаю для экономии токенов`)
        results.push({
          model: model.name,
          type: 'text',
          success: null,
          note: 'Replicate - skipped to save costs'
        })
      }

    } catch (error) {
      console.log(`❌ Критическая ошибка: ${error.message}`)
      results.push({
        model: model.name,
        type: 'text',
        success: false,
        error: error.message
      })
    }

    // Задержка между запросами
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // === IMAGE-TO-VIDEO МОДЕЛИ ===
  console.log('\n\n🖼️  IMAGE-TO-VIDEO МОДЕЛИ:\n')

  const imageModels = allModels.filter(m => m.inputTypes.includes('image') && !m.inputTypes.includes('text'))

  for (const model of imageModels) {
    console.log(`\n🎬 Тестирую: ${model.name} (${model.id})`)
    console.log('─'.repeat(70))

    try {
      // Kie.ai image-to-video модели
      if (['veo3_fast', 'runway-aleph'].includes(model.id)) {
        const result = await provider.generateVideo({
          prompt: TEST_PROMPT,
          model: model.id,
          imageUrl: USER_IMAGE_URL,
          duration: model.defaultDuration || 6,
          aspectRatio: '9:16'
        })

        if (result.success) {
          console.log(`✅ Task создан: ${result.data?.taskId}`)
          console.log(`💰 Стоимость: ${result.cost.stars}⭐ ($${result.cost.usd})`)
          console.log(`📡 Webhook: ${CALLBACK_BASE}/api/kie-ai/callback`)
          results.push({
            model: model.name,
            type: 'image',
            success: true,
            taskId: result.data?.taskId,
            cost: result.cost.stars
          })
        } else {
          console.log(`❌ Ошибка: ${result.error}`)
          results.push({
            model: model.name,
            type: 'image',
            success: false,
            error: result.error
          })
        }
      }
      // Replicate модели
      else {
        console.log(`⚠️  ${model.name} - Replicate модель (polling)`)
        console.log(`   Пропускаю для экономии токенов`)
        results.push({
          model: model.name,
          type: 'image',
          success: null,
          note: 'Replicate - skipped to save costs'
        })
      }

    } catch (error) {
      console.log(`❌ Критическая ошибка: ${error.message}`)
      results.push({
        model: model.name,
        type: 'image',
        success: false,
        error: error.message
      })
    }

    // Задержка между запросами
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // === ФИНАЛЬНЫЙ ОТЧЕТ ===
  console.log('\n\n📊 ============ ФИНАЛЬНЫЙ ОТЧЕТ ============\n')
  console.log('Всего протестировано:', results.length)
  console.log('Успешно:', results.filter(r => r.success === true).length, '✅')
  console.log('Ошибки:', results.filter(r => r.success === false).length, '❌')
  console.log('Пропущено:', results.filter(r => r.success === null).length, '⚠️')

  console.log('\n📋 Детальные результаты:\n')

  console.log('## Text-to-Video:')
  results.filter(r => r.type === 'text').forEach(r => {
    const status = r.success === true ? '✅' : r.success === false ? '❌' : '⚠️'
    console.log(`${status} ${r.model}`)
    if (r.taskId) console.log(`   Task: ${r.taskId}`)
    if (r.cost) console.log(`   Cost: ${r.cost}⭐`)
    if (r.error) console.log(`   Error: ${r.error}`)
    if (r.note) console.log(`   Note: ${r.note}`)
  })

  console.log('\n## Image-to-Video:')
  results.filter(r => r.type === 'image').forEach(r => {
    const status = r.success === true ? '✅' : r.success === false ? '❌' : '⚠️'
    console.log(`${status} ${r.model}`)
    if (r.taskId) console.log(`   Task: ${r.taskId}`)
    if (r.cost) console.log(`   Cost: ${r.cost}⭐`)
    if (r.error) console.log(`   Error: ${r.error}`)
    if (r.note) console.log(`   Note: ${r.note}`)
  })

  console.log('\n✅ Тестирование завершено!\n')
}

testAllModels()
  .then(() => {
    console.log('Скрипт успешно завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('Критическая ошибка:', error)
    process.exit(1)
  })
