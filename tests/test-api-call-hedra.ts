/**
 * Test API Call with Hedra parameters
 * Проверяет доступность API для генерации видео с Hedra
 */

const API_BASE_URL = 'https://three-head-dragon.shop'

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
    "api_key": "sk_hedra_jTiPa9kEiQ25EwjwkAoaCPmxcMfZZalnSUi-tQOjZrBISgz9jqKtK0j96YzreHQ3",
    "avatar_photo_url": "https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg",
    "voice_id": "0BcDz9UPwL3MpsnTeUlO",
    "avatar_speech": "AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров. Его цель — предоставить отдельное, удобное место для инструкций и контекста, необходимых именно искусственным агентам, а не людям. AGENTS.md помогает агентам быстрее понимать архитектуру проекта, правила взаимодействия с кодом и предпочтительные практики разработки, минимизируя необходимость дополнительных пояснений от человека."
  }
}

async function testAPICall() {
  console.log('🧪 Testing API Call with Hedra parameters...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📍 Base URL: ${API_BASE_URL}`)
  console.log(`🎬 Service: ${testPayload.avatar_gen_service}`)
  console.log('')

  // Test 1: Check server health
  console.log('Test 1: Checking server health...')
  try {
    const healthResponse = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
    })

    console.log(`✅ Server status: ${healthResponse.status} ${healthResponse.statusText}`)

    if (healthResponse.ok) {
      const data = await healthResponse.text()
      console.log(`📦 Response: ${data.substring(0, 200)}`)
    }
  } catch (error) {
    console.error(`❌ Health check failed:`, error instanceof Error ? error.message : error)
  }

  console.log('')

  // Test 2: Check available endpoints
  console.log('Test 2: Checking API endpoints...')
  const endpoints = [
    '/api/inngest',
    '/api/lipsync/generate',
    '/api/generation/video',
    '/api/kie-ai/callback',
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
      })

      console.log(`  ${endpoint}: ${response.status} ${response.statusText}`)
    } catch (error) {
      console.log(`  ${endpoint}: ❌ Not accessible`)
    }
  }

  console.log('')

  // Test 3: Try video generation endpoint (if exists)
  console.log('Test 3: Testing video generation with Hedra parameters...')
  const possibleEndpoints = [
    '/api/generation/video',
    '/api/generate/video',
    '/api/lipsync/generate',
    '/generate/video',
  ]

  for (const endpoint of possibleEndpoints) {
    try {
      console.log(`\n  Trying: ${endpoint}`)
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      })

      console.log(`  ✅ Status: ${response.status} ${response.statusText}`)

      if (response.ok) {
        const result = await response.json()
        console.log(`  📦 Response:`, JSON.stringify(result, null, 2))
      } else {
        const errorText = await response.text()
        console.log(`  ⚠️ Response: ${errorText.substring(0, 300)}`)
      }

      // If we got any response (even error), endpoint exists
      if (response.status !== 404) {
        console.log(`\n  ✅ Endpoint ${endpoint} is AVAILABLE`)
        break
      }
    } catch (error) {
      console.log(`  ❌ Error:`, error instanceof Error ? error.message : error)
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

// Run test
testAPICall()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
