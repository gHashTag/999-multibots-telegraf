/**
 * Test Direct Render Server Call
 * Пробуем разные способы вызова render-server функций
 */

import * as dotenv from 'dotenv'
dotenv.config()

const RENDER_SERVER_URL = 'https://render-v3-production.up.railway.app'
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY

const testPayload = {
  job_id: '00000000-0000-0000-0000-000000000003',
  eleven_labs_api_key: 'sk_6c8d7345808baf2d2fdc4347c56830375ebf68ad980bb502',
  kie_api_key: 'c98141e4b2b6413688fbea2a9b78f127',
  cover_url: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
  intro_text_1: 'Ai-Stars',
  intro_text_2: 'News',
  upper_intro_text: 'Ai-Stars',
  avatar_gen_service: 'hedra',
  avatar_settings: {
    api_key: 'YOUR_HEDRA_API_KEY_HERE',
    avatar_photo_url:
      'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech:
      'AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров.',
  },
}

async function testRenderServerDirect() {
  console.log('🎬 Testing Direct Render Server Call...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📍 Render Server: ${RENDER_SERVER_URL}`)
  console.log('')

  // Approach 1: Send to render-server's Inngest endpoint directly
  console.log('Approach 1: POST to render-server/api/inngest')
  try {
    const response = await fetch(`${RENDER_SERVER_URL}/api/inngest`, {
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

    console.log(`Status: ${response.status} ${response.statusText}`)
    const text = await response.text()
    console.log(`Response: ${text.substring(0, 500)}`)
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
  }

  console.log('')

  // Approach 2: Try different event name formats
  console.log('Approach 2: Try different event name formats via Inngest Cloud')
  const eventNames = [
    'render/avatar-video',
    'render-avatar-video',
    'avatar-video',
    'render.avatar-video',
  ]

  if (INNGEST_EVENT_KEY) {
    for (const eventName of eventNames) {
      try {
        console.log(`  Testing event name: "${eventName}"`)
        const response = await fetch(`https://api.inngest.com/e/${INNGEST_EVENT_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: eventName,
            data: testPayload,
            ts: Date.now(),
          }),
        })

        console.log(`    Status: ${response.status}`)
        if (response.ok) {
          const result = await response.json()
          console.log(`    ✅ SUCCESS! Event ID: ${result.ids?.[0]}`)
          break
        }
      } catch (error) {
        console.log(`    ❌ Error: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  console.log('')

  // Approach 3: Check if there's a direct HTTP endpoint
  console.log('Approach 3: Check for direct HTTP endpoints')
  const endpoints = [
    { path: '/render/avatar-video', method: 'POST' },
    { path: '/api/render/avatar-video', method: 'POST' },
    { path: '/avatar-video', method: 'POST' },
  ]

  for (const { path, method } of endpoints) {
    try {
      console.log(`  Trying: ${method} ${path}`)
      const response = await fetch(`${RENDER_SERVER_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      })

      console.log(`    Status: ${response.status} ${response.statusText}`)
      if (response.ok || response.status !== 404) {
        const text = await response.text()
        console.log(`    Response: ${text.substring(0, 300)}`)
      }
    } catch (error) {
      console.log(`    ❌ Error: ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('💡 SUMMARY:')
  console.log('  - Render Server: https://render-v3-production.up.railway.app')
  console.log('  - Inngest endpoint: /api/inngest')
  console.log('  - Functions: render, render-avatar-video, render-riddle')
  console.log('  - SDK: Python FastAPI + Inngest')
  console.log('')
  console.log('📋 Next steps:')
  console.log('  1. Check render-server source code for actual event names')
  console.log('  2. Verify INNGEST_EVENT_KEY connects to render-server')
  console.log('  3. Check if render-server needs separate event key')
}

testRenderServerDirect()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
