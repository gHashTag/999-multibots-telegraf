/**
 * Test Direct POST to Render Server
 * Прямая отправка на render-server endpoint с подписью
 */

import * as crypto from 'crypto'

const INNGEST_EVENT_KEY = 'kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw'
const INNGEST_SIGNING_KEY = 'signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047'
const RENDER_SERVER_URL = 'https://render-v3-production.up.railway.app'

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
    api_key: 'sk_hedra_jTiPa9kEiQ25EwjwkAoaCPmxcMfZZalnSUi-tQOjZrBISgz9jqKtK0j96YzreHQ3',
    avatar_photo_url:
      'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech:
      'AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров.',
  },
}

/**
 * Создание Inngest signature для запроса
 */
function createInngestSignature(body: string, signingKey: string, timestamp: number): string {
  const data = `${timestamp}${body}`
  const hmac = crypto.createHmac('sha256', signingKey)
  hmac.update(data)
  return hmac.digest('hex')
}

async function testDirectPost() {
  console.log('🎬 Test: Прямая отправка на render-server с подписью')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  const timestamp = Date.now()
  const eventData = {
    name: 'render/avatar-video',
    data: testPayload,
    ts: timestamp,
  }

  const body = JSON.stringify(eventData)
  const signature = createInngestSignature(body, INNGEST_SIGNING_KEY, timestamp)

  console.log(`📍 URL: ${RENDER_SERVER_URL}/api/inngest`)
  console.log(`📦 Event: ${eventData.name}`)
  console.log(`⏰ Timestamp: ${timestamp}`)
  console.log(`🔐 Signature: ${signature.substring(0, 30)}...`)
  console.log('')

  try {
    const response = await fetch(`${RENDER_SERVER_URL}/api/inngest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-inngest-signature': `t=${timestamp},s=${signature}`,
        'x-inngest-sdk': 'js:2.0.0',
      },
      body: body,
    })

    console.log(`📡 Response: ${response.status} ${response.statusText}`)
    console.log('')

    if (response.ok) {
      const result = await response.json()
      console.log(`✅ SUCCESS!`)
      console.log(`📝 Response:`, JSON.stringify(result, null, 2))
    } else {
      const errorText = await response.text()
      console.log(`❌ FAILED`)
      console.log(`📝 Error:`, errorText.substring(0, 500))
    }
  } catch (error) {
    console.error(`❌ Error:`, error instanceof Error ? error.message : error)
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Попробуем разные варианты event name
  console.log('Пробуем альтернативные имена событий:')
  console.log('')

  const eventNames = [
    'render/avatar-video',
    'render-avatar-video',
    'avatar-video',
    'render.avatar-video',
  ]

  for (const eventName of eventNames) {
    const timestamp2 = Date.now()
    const eventData2 = {
      name: eventName,
      data: testPayload,
      ts: timestamp2,
    }
    const body2 = JSON.stringify(eventData2)
    const signature2 = createInngestSignature(body2, INNGEST_SIGNING_KEY, timestamp2)

    console.log(`Testing: "${eventName}"`)

    try {
      const response = await fetch(`${RENDER_SERVER_URL}/api/inngest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-inngest-signature': `t=${timestamp2},s=${signature2}`,
          'x-inngest-sdk': 'js:2.0.0',
        },
        body: body2,
      })

      if (response.ok) {
        console.log(`  ✅ ${response.status} - SUCCESS!`)
        const result = await response.json()
        console.log(`  📝 Response:`, JSON.stringify(result, null, 2))
        break
      } else {
        console.log(`  ❌ ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : error}`)
    }

    // Небольшая задержка между запросами
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

testDirectPost()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
