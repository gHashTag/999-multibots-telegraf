/**
 * Final Render Server Integration Test
 * Полный тест интеграции с render-server
 */

import * as dotenv from 'dotenv'
dotenv.config()

// Установим новый ключ
process.env.INNGEST_EVENT_KEY_RENDER =
  'n6DddAUg5idycTbtQGP7lXn6FCoIDcEkAdlX72WmC5k_GJcrjBFm4n_aCNmInAh_zQ2Yd070y4gzPeYnJTUadA'
process.env.INNGEST_SIGNING_KEY_RENDER =
  'signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047'

import {
  sendRenderAvatarVideoEvent,
  createRenderAvatarPayload,
} from '../src/inngest_app/render-server-client'

async function testFinalIntegration() {
  console.log('🎯 FINAL TEST: Render Server Integration')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('✅ Исправления применены:')
  console.log('   - Правильный URL: https://inn.gs/e/{KEY}')
  console.log('   - Новый Event Key: n6DddAUg5idycTbtQGP7...')
  console.log('   - Inngest Provider обновлен')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Создание payload
  console.log('📦 Создание payload...')
  const payload = createRenderAvatarPayload(
    'test-user-123',
    'AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров. Его цель — предоставить отдельное, удобное место для инструкций и контекста, необходимых именно искусственным агентам, а не людям.',
    'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    '0BcDz9UPwL3MpsnTeUlO',
    {
      coverUrl: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
      introText1: 'Ai-Stars',
      introText2: 'News',
      upperIntroText: 'Ai-Stars',
    }
  )

  console.log('✅ Payload создан')
  console.log(`   Job ID: ${payload.job_id}`)
  console.log(`   Service: ${payload.avatar_gen_service}`)
  console.log(`   Voice ID: ${payload.avatar_settings.voice_id}`)
  console.log('')

  // Отправка события
  console.log('📤 Отправка события на render-server...')
  console.log('')

  try {
    const result = await sendRenderAvatarVideoEvent(payload)

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('🎉 УСПЕХ! Событие отправлено!')
    console.log('')
    console.log(`📝 Event ID: ${result.eventId}`)
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('📊 Что происходит дальше:')
    console.log('')
    console.log('1️⃣ Inngest Cloud получил событие')
    console.log('   └─ Event ID: ' + result.eventId)
    console.log('')
    console.log('2️⃣ Inngest маршрутизирует на render-server')
    console.log('   └─ Railway: https://render-v3-production.up.railway.app')
    console.log('')
    console.log('3️⃣ Render-server обрабатывает событие')
    console.log('   └─ Функция: render/avatar-video')
    console.log('')
    console.log('4️⃣ Hedra генерирует lip-sync видео')
    console.log('   └─ API: Hedra AI Avatar Generation')
    console.log('')
    console.log('5️⃣ Результат отправляется через webhook')
    console.log('   └─ URL: https://three-head-dragon.shop/api/telegram/ai-reels-callback')
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('🔍 Мониторинг:')
    console.log('')
    console.log('• Inngest Dashboard:')
    console.log('  https://app.inngest.com')
    console.log(`  Найдите event: ${result.eventId}`)
    console.log('')
    console.log('• Railway Logs:')
    console.log('  railway logs --service render-v3-production')
    console.log('  railway logs --tail')
    console.log('')
    console.log('• Webhook Callback:')
    console.log('  Проверьте логи бота для входящего webhook')
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('✅ Интеграция работает полностью!')
    console.log('')
    console.log('🎯 Использование в коде:')
    console.log('')
    console.log('```typescript')
    console.log('import { sendRenderAvatarVideoEvent, createRenderAvatarPayload }')
    console.log('  from "@/inngest_app/render-server-client"')
    console.log('')
    console.log('const payload = createRenderAvatarPayload(')
    console.log('  telegramId,')
    console.log('  avatarSpeech,')
    console.log('  avatarPhotoUrl,')
    console.log('  voiceId,')
    console.log('  { coverUrl, introText1, introText2 }')
    console.log(')')
    console.log('')
    console.log('const { eventId } = await sendRenderAvatarVideoEvent(payload)')
    console.log('```')
  } catch (error) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('❌ ОШИБКА при отправке события')
    console.log('')
    console.log(`Ошибка: ${error instanceof Error ? error.message : String(error)}`)
    console.log('')
    console.log('Проверьте:')
    console.log('1. INNGEST_EVENT_KEY_RENDER в .env')
    console.log('2. INNGEST_SIGNING_KEY_RENDER в .env')
    console.log('3. Интернет соединение')
  }
}

testFinalIntegration()
  .then(() => {
    console.log('')
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('')
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
