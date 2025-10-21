/**
 * Test script for render-server на https://999-agents.site
 * Проверяет полный флоу: Bot → Inngest Cloud → render-server → callback → Bot
 */

import * as dotenv from 'dotenv'
dotenv.config()

const RENDER_EVENT_KEY = process.env.RENDER_INNGEST_EVENT_KEY
const TEST_TELEGRAM_ID = '999999999' // Тестовый ID
const CALLBACK_URL = 'https://three-head-dragon.shop/api/telegram/ai-reels-callback'

if (!RENDER_EVENT_KEY) {
  console.error('❌ RENDER_INNGEST_EVENT_KEY not found in .env!')
  process.exit(1)
}

console.log('🧪 [TEST] Starting render-server integration test')
console.log('📍 Target: https://999-agents.site/api/inngest')
console.log('🔑 Event Key:', RENDER_EVENT_KEY.substring(0, 20) + '...')
console.log('📞 Callback URL:', CALLBACK_URL)
console.log('')

// Тестовый payload для render-riddle
const testPayload = {
  job_id: `test-${TEST_TELEGRAM_ID}-${Date.now()}`,
  eleven_labs_api_key: process.env.ELEVENLABS_API_KEY || 'test_key',
  kie_api_key: process.env.KIE_AI_API_KEY || 'test_key',
  cover_url: 'https://example.com/test-cover.jpg',
  intro_text_1: {
    text: 'TEST',
    position: [540, 1200],
    font_size: 100,
  },
  intro_text_2: {
    text: 'RENDER',
    position: [540, 1340],
    font_size: 100,
  },
  upper_intro_text: 'Integration Test',
  circle_position: [872, 1360, 0.0],
  circle_scale: [150, 150, 100],
  callback_url: CALLBACK_URL,
  avatar_gen_service: 'hedra',
  avatar_settings: {
    api_key: process.env.HEDRA_API_KEY || 'test_key',
    avatar_photo_url: 'https://example.com/test-avatar.jpg',
    voice_id: 'test_voice',
    avatar_speech: 'This is a test render',
  },
}

async function testRenderServer() {
  try {
    console.log('📤 [TEST] Sending event to Inngest Cloud...')

    const inngestCloudUrl = `https://inn.gs/e/${RENDER_EVENT_KEY}`

    const response = await fetch(inngestCloudUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'render-riddle',
        data: testPayload,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Inngest Cloud returned ${response.status}: ${errorText}`)
    }

    const result = await response.json()

    console.log('✅ [TEST] Event sent to Inngest Cloud successfully!')
    console.log('📋 Event IDs:', result.ids)
    console.log('📊 Status:', result.status)
    console.log('')
    console.log('⏳ [TEST] Event should now be processed by render-server...')
    console.log('📍 Expected flow:')
    console.log('   1. Inngest Cloud → https://999-agents.site/api/inngest')
    console.log('   2. render-server processes render-riddle event')
    console.log('   3. Callback sent to:', CALLBACK_URL)
    console.log('')
    console.log('🔍 [TEST] Monitor logs for callback:')
    console.log('   ssh -i ~/.ssh/zomro root@212.86.115.30 "docker logs 999-multibots --follow | grep AI.REELS.CALLBACK"')
    console.log('')
    console.log('✅ [TEST] Test completed. Check logs for callback.')

    return result
  } catch (error) {
    console.error('❌ [TEST] Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

testRenderServer()
