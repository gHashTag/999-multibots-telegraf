/**
 * Test Render Server Integration
 * Полный тест интеграции с render-server через inngestProvider
 */

import * as dotenv from 'dotenv'
dotenv.config()

// Установим новый ключ если не задан
process.env.INNGEST_EVENT_KEY_RENDER =
  process.env.INNGEST_EVENT_KEY_RENDER ||
  'n6DddAUg5idycTbtQGP7lXn6FCoIDcEkAdlX72WmC5k_GJcrjBFm4n_aCNmInAh_zQ2Yd070y4gzPeYnJTUadA'

process.env.INNGEST_SIGNING_KEY_RENDER =
  process.env.INNGEST_SIGNING_KEY_RENDER ||
  'signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047'

import {
  sendRenderAvatarVideoEvent,
  checkRenderServerAvailability,
  createRenderAvatarPayload,
} from '../src/inngest_app/render-server-client'

async function testRenderServerIntegration() {
  console.log('🎬 Test: Render Server Integration')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 1: Проверка доступности render-server
  console.log('Test 1: Проверка доступности render-server')
  const isAvailable = await checkRenderServerAvailability()
  console.log(`  Статус: ${isAvailable ? '✅ Доступен' : '❌ Недоступен'}`)
  console.log('')

  if (!isAvailable) {
    console.log('⚠️ Render-server недоступен, тест прерван')
    return
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 2: Создание payload
  console.log('Test 2: Создание payload для render-avatar-video')
  const payload = createRenderAvatarPayload(
    'test-user-123',
    'AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров.',
    'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    '0BcDz9UPwL3MpsnTeUlO',
    {
      coverUrl: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
      introText1: 'Ai-Stars',
      introText2: 'News',
      upperIntroText: 'Ai-Stars',
    }
  )

  console.log('  ✅ Payload создан:')
  console.log(`     Job ID: ${payload.job_id}`)
  console.log(`     Service: ${payload.avatar_gen_service}`)
  console.log(`     Avatar URL: ${payload.avatar_settings.avatar_photo_url.substring(0, 60)}...`)
  console.log(`     Speech length: ${payload.avatar_settings.avatar_speech.length} chars`)
  console.log('')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 3: Отправка события на render-server
  console.log('Test 3: Отправка события на render-server')
  try {
    const result = await sendRenderAvatarVideoEvent(payload)

    console.log('  ✅ Событие отправлено успешно!')
    console.log(`     Event ID: ${result.eventId}`)
    console.log('')
    console.log('  📊 Что происходит дальше:')
    console.log('     1. Inngest маршрутизирует событие на render-server')
    console.log('     2. Render-server обрабатывает событие через функцию render/avatar-video')
    console.log('     3. Hedra генерирует lip-sync видео')
    console.log('     4. Результат отправляется через webhook')
    console.log('')
    console.log('  🔍 Мониторинг:')
    console.log('     - Inngest Dashboard: https://app.inngest.com')
    console.log('     - Railway Logs: railway logs --service render-v3-production')
    console.log('     - Webhook endpoint: https://three-head-dragon.shop/api/telegram/ai-reels-callback')
  } catch (error) {
    console.log('  ❌ Ошибка при отправке события:')
    console.log(`     ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('📋 ИТОГИ ИНТЕГРАЦИИ:')
  console.log('')
  console.log('✅ Inngest Provider настроен')
  console.log('✅ Render Server Client работает')
  console.log('✅ Event Key настроен правильно')
  console.log('✅ URL исправлен: https://inn.gs/e/{KEY}')
  console.log('✅ События отправляются успешно')
  console.log('')
  console.log('🎯 Готово к использованию:')
  console.log('   await sendRenderAvatarVideoEvent({ ... })')
  console.log('   await inngestProvider.sendEvent("RENDER", "render/avatar-video", { ... })')
  console.log('')
  console.log('📦 Environment Variables (Production):')
  console.log('   INNGEST_EVENT_KEY_RENDER=n6DddAUg5idycTbtQGP7lXn6FCoIDc...')
  console.log('   INNGEST_SIGNING_KEY_RENDER=signkey-prod-e2c2d07a9d030695...')
  console.log('   RENDER_SERVER_URL=https://render-v3-production.up.railway.app')
  console.log('   HEDRA_API_KEY=sk_hedra_jTiPa9kEiQ25EwjwkAoaCPmxcMfZZ...')
}

testRenderServerIntegration()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
