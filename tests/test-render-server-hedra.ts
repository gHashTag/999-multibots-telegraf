/**
 * Test Render Server API Call with Hedra parameters
 * Проверяет доступность render-server для генерации видео с Hedra
 */

import * as dotenv from 'dotenv'
dotenv.config()

const RENDER_SERVER_URL = 'https://render-v3-production.up.railway.app'
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY

const testPayload = {
  "job_id": "00000000-0000-0000-0000-000000000003",
  "eleven_labs_api_key": "sk_6c8d7345808baf2d2fdc4347c56830375ebf68ad980bb502",
  "kie_api_key": "c98141e4b2b6413688fbea2a9b78f127",
  "cover_url": "https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg",
  "intro_text_1": "Ai-Stars",
  "intro_text_2": "News",
  "upper_intro_text": "Ai-Stars",
  "avatar_gen_service": "hedra",
  "avatar_settings": {
    "api_key": "YOUR_HEDRA_API_KEY_HERE",
    "avatar_photo_url": "https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg",
    "voice_id": "0BcDz9UPwL3MpsnTeUlO",
    "avatar_speech": "AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров. Его цель — предоставить отдельное, удобное место для инструкций и контекста, необходимых именно искусственным агентам, а не людям. AGENTS.md помогает агентам быстрее понимать архитектуру проекта, правила взаимодействия с кодом и предпочтительные практики разработки, минимизируя необходимость дополнительных пояснений от человека."
  }
}

async function testRenderServer() {
  console.log('🎬 Testing Render Server with Hedra parameters...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📍 Server URL: ${RENDER_SERVER_URL}`)
  console.log(`🔑 Event Key: ${INNGEST_EVENT_KEY ? '✅ Set' : '❌ Not set'}`)
  console.log('')

  // Test 1: Check Inngest endpoint
  console.log('Test 1: Checking Inngest endpoint...')
  try {
    const response = await fetch(`${RENDER_SERVER_URL}/api/inngest`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    console.log(`✅ Status: ${response.status} ${response.statusText}`)

    if (response.ok) {
      const data = await response.json()
      console.log(`📦 Response:`, JSON.stringify(data, null, 2))
    } else {
      const errorText = await response.text()
      console.log(`⚠️ Response: ${errorText.substring(0, 300)}`)
    }
  } catch (error) {
    console.error(`❌ Connection failed:`, error instanceof Error ? error.message : error)
  }

  console.log('')

  // Test 2: Send event to render-avatar-video function
  if (INNGEST_EVENT_KEY) {
    console.log('Test 2: Sending event to render-avatar-video...')
    try {
      const response = await fetch(`https://api.inngest.com/e/${INNGEST_EVENT_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'render/avatar-video',
          data: testPayload,
          ts: Date.now(),
        }),
      })

      console.log(`✅ Event sent: ${response.status} ${response.statusText}`)

      if (response.ok) {
        const result = await response.json()
        console.log(`📦 Response:`, JSON.stringify(result, null, 2))
        console.log(`\n🎉 SUCCESS! Event ID: ${result.ids?.[0]}`)
      } else {
        const errorText = await response.text()
        console.log(`❌ Error: ${errorText}`)
      }
    } catch (error) {
      console.error(`❌ Failed to send event:`, error instanceof Error ? error.message : error)
    }
  } else {
    console.log('⚠️ Test 2 skipped: INNGEST_EVENT_KEY not set')
  }

  console.log('')

  // Test 3: Try direct API call (if available)
  console.log('Test 3: Checking available endpoints...')
  const endpoints = [
    '/api/render',
    '/api/avatar-video',
    '/render/avatar-video',
    '/health',
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${RENDER_SERVER_URL}${endpoint}`, {
        method: 'GET',
      })

      console.log(`  ${endpoint}: ${response.status} ${response.statusText}`)
    } catch (error) {
      console.log(`  ${endpoint}: ❌ Not accessible`)
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('📋 SUMMARY:')
  console.log('  - Inngest endpoint: https://render-v3-production.up.railway.app/api/inngest')
  console.log('  - Available functions: render, render-avatar-video, render-riddle')
  console.log('  - Event name: render/avatar-video')
  console.log('  - SDK: Python + FastAPI')
}

// Run test
testRenderServer()
  .then(() => {
    console.log('\n✅ Test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
