/**
 * Test Render Server с минимальным payload
 * Проверка базовой функциональности
 */

import * as crypto from 'crypto'

const INNGEST_SIGNING_KEY = 'signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047'
const RENDER_SERVER_URL = 'https://render-v3-production.up.railway.app'

function createInngestSignature(body: string, signingKey: string, timestamp: number): string {
  const data = `${timestamp}${body}`
  const hmac = crypto.createHmac('sha256', signingKey)
  hmac.update(data)
  return hmac.digest('hex')
}

async function testSimplePayload() {
  console.log('🧪 Test: Минимальный payload для render-server')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 1: Самый простой payload
  console.log('Test 1: Минимальный payload')
  const minimalPayload = {
    job_id: 'test-job-001',
    avatar_gen_service: 'hedra',
  }

  await sendTestEvent('render/avatar-video', minimalPayload, '1️⃣')

  console.log('')

  // Test 2: Payload с обязательными полями
  console.log('Test 2: Базовые обязательные поля')
  const basicPayload = {
    job_id: 'test-job-002',
    eleven_labs_api_key: 'test-key',
    kie_api_key: 'test-key',
    avatar_gen_service: 'hedra',
    avatar_settings: {
      api_key: 'test-key',
      avatar_photo_url: 'https://example.com/test.jpg',
      voice_id: 'test-voice',
      avatar_speech: 'Test speech',
    },
  }

  await sendTestEvent('render/avatar-video', basicPayload, '2️⃣')

  console.log('')

  // Test 3: Полный payload без intro текстов
  console.log('Test 3: Полный payload (без intro)')
  const fullPayloadNoIntro = {
    job_id: 'test-job-003',
    eleven_labs_api_key: 'sk_6c8d7345808baf2d2fdc4347c56830375ebf68ad980bb502',
    kie_api_key: 'c98141e4b2b6413688fbea2a9b78f127',
    avatar_gen_service: 'hedra',
    avatar_settings: {
      api_key: 'YOUR_HEDRA_API_KEY_HERE',
      avatar_photo_url:
        'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
      voice_id: '0BcDz9UPwL3MpsnTeUlO',
      avatar_speech: 'Test speech for avatar',
    },
  }

  await sendTestEvent('render/avatar-video', fullPayloadNoIntro, '3️⃣')

  console.log('')

  // Test 4: Проверка других event names
  console.log('Test 4: Проверка других функций')
  const renderPayload = {
    job_id: 'test-job-render',
    data: 'test',
  }

  await sendTestEvent('render', renderPayload, '4️⃣')

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('📋 РЕКОМЕНДАЦИИ:')
  console.log('  - Если все тесты возвращают 500: проверить логи Railway')
  console.log('  - Если один из тестов работает: использовать тот формат')
  console.log('  - Если 400/422: проверить required fields в документации')
  console.log('  - Если 401: проверить signing key')
}

async function sendTestEvent(eventName: string, payload: any, emoji: string) {
  const timestamp = Date.now()
  const eventData = {
    name: eventName,
    data: payload,
    ts: timestamp,
  }

  const body = JSON.stringify(eventData)
  const signature = createInngestSignature(body, INNGEST_SIGNING_KEY, timestamp)

  console.log(`${emoji} Event: "${eventName}"`)
  console.log(`   Payload size: ${body.length} bytes`)
  console.log(`   Fields: ${Object.keys(payload).join(', ')}`)

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

    console.log(`   Response: ${response.status} ${response.statusText}`)

    if (response.ok) {
      const result = await response.json()
      console.log(`   ✅ SUCCESS!`)
      console.log(`   📝 Result:`, JSON.stringify(result, null, 2))
    } else {
      const errorText = await response.text()
      console.log(`   ❌ Error: ${errorText.substring(0, 200)}`)
    }
  } catch (error) {
    console.log(`   ❌ Exception: ${error instanceof Error ? error.message : error}`)
  }

  // Задержка между запросами
  await new Promise(resolve => setTimeout(resolve, 500))
}

testSimplePayload()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
