/**
 * Тест обоих путей отправки на render-server
 */

import { config } from 'dotenv'
config() // Загружаем переменные окружения

import { 
  createRenderAvatarPayload, 
  sendRenderAvatarVideoEvent,
  sendDirectToRenderServer 
} from './src/inngest_app/render-server-client'

async function testBothPaths() {
  console.log('🧪 [TEST] Testing both paths to render-server...')
  
  // Создаем payload
  const payload = createRenderAvatarPayload(
    '123456789',
    'Тестовый текст для озвучки аватара',
    'https://example.com/avatar.jpg',
    '0BcDz9UPwL3MpsnTeUlO',
    {
      coverUrl: 'https://example.com/cover.jpg',
      introText1: 'Ai-Stars',
      introText2: 'News',
      upperIntroText: 'Ai-Stars'
    }
  )

  console.log('📦 [TEST] Payload created with avatar_id:', payload.avatar_settings.avatar_id)
  console.log('')

  // Тест 1: Через Inngest Cloud
  console.log('🚀 [TEST 1] Testing Inngest Cloud path...')
  try {
    const result1 = await sendRenderAvatarVideoEvent(payload)
    console.log('✅ [TEST 1] Inngest Cloud SUCCESS:', result1.eventId)
  } catch (error) {
    console.log('❌ [TEST 1] Inngest Cloud FAILED:', error instanceof Error ? error.message : error)
  }

  console.log('')

  // Тест 2: Прямо на Railway
  console.log('🚀 [TEST 2] Testing direct Railway path...')
  try {
    const result2 = await sendDirectToRenderServer(payload)
    console.log('✅ [TEST 2] Direct Railway SUCCESS:', result2.eventId)
  } catch (error) {
    console.log('❌ [TEST 2] Direct Railway FAILED:', error instanceof Error ? error.message : error)
  }

  console.log('')
  console.log('🔍 [TEST] Both paths tested. Check results above.')
}

testBothPaths().catch(console.error)
