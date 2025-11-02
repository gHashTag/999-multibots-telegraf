/**
 * Test New Event Key
 * Проверка нового event key для render-server
 */

import * as crypto from 'crypto'

// СТАРЫЙ ключ (render-server)
const OLD_EVENT_KEY = 'kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw'

// НОВЫЙ ключ (от пользователя)
const NEW_EVENT_KEY = 'n6DddAUg5idycTbtQGP7lXn6FCoIDcEkAdlX72WmC5k_GJcrjBFm4n_aCNmInAh_zQ2Yd070y4gzPeYnJTUadA'

const SIGNING_KEY = 'signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047'
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
    api_key: 'YOUR_HEDRA_API_KEY_HERE',
    avatar_photo_url:
      'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech: 'AGENTS.md — это новый формат для AI-агентов.',
  },
}

function createInngestSignature(body: string, signingKey: string, timestamp: number): string {
  const data = `${timestamp}${body}`
  const hmac = crypto.createHmac('sha256', signingKey)
  hmac.update(data)
  return hmac.digest('hex')
}

async function testNewEventKey() {
  console.log('🔑 Test: Новый Event Key для render-server')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('📋 ИНФОРМАЦИЯ О EVENT KEY:')
  console.log('')
  console.log('Event Key - это ключ для отправки событий в Inngest.')
  console.log('Каждый Event Key связан с конкретным App/Environment.')
  console.log('')
  console.log('🎯 НАЗНАЧЕНИЕ:')
  console.log('  1. Отправлять события через Inngest Cloud API')
  console.log('  2. Маршрутизировать события на правильный app')
  console.log('  3. Идентифицировать источник событий')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 1: СТАРЫЙ ключ
  console.log('Test 1: СТАРЫЙ Event Key')
  console.log(`  Key: ${OLD_EVENT_KEY.substring(0, 30)}...`)
  console.log('')

  await testEventKey(OLD_EVENT_KEY, '  🔵 СТАРЫЙ')

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 2: НОВЫЙ ключ
  console.log('Test 2: НОВЫЙ Event Key')
  console.log(`  Key: ${NEW_EVENT_KEY.substring(0, 30)}...`)
  console.log('')

  await testEventKey(NEW_EVENT_KEY, '  🟢 НОВЫЙ')

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('📊 ВЫВОДЫ:')
  console.log('')
  console.log('✅ 200 OK = Event Key связан с render-server app')
  console.log('   → События будут доставлены на render-server')
  console.log('   → Используйте этот ключ для отправки')
  console.log('')
  console.log('❌ 404 Not Found = Event Key НЕ связан с render-server')
  console.log('   → События не найдут правильный app')
  console.log('   → Нужно настроить в Inngest Dashboard')
  console.log('')
  console.log('❌ 500 Error = Event Key правильный, но проблема на сервере')
  console.log('   → Проверить логи render-server: railway logs')
  console.log('')
  console.log('💡 ЧТО ДЕЛАТЬ:')
  console.log('  1. Если НОВЫЙ ключ работает (200) → обновить .env')
  console.log('  2. Если оба ключа 404 → настроить Event Key в Inngest')
  console.log('  3. Если 500 → проверить логи Railway')
}

async function testEventKey(eventKey: string, label: string) {
  // 1. Тест через Inngest Cloud API
  console.log(`${label}: Отправка через Inngest Cloud API`)

  try {
    const response = await fetch(`https://api.inngest.com/e/${eventKey}`, {
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

    console.log(`${label}:   Response: ${response.status} ${response.statusText}`)

    if (response.ok) {
      const result = await response.json()
      console.log(`${label}:   ✅ SUCCESS! Event ID: ${result.ids?.[0]}`)
      console.log(`${label}:   📝 Response:`, JSON.stringify(result, null, 2))
    } else {
      const errorText = await response.text()
      console.log(`${label}:   ❌ Error: ${errorText.substring(0, 200)}`)
    }
  } catch (error) {
    console.log(`${label}:   ❌ Exception: ${error instanceof Error ? error.message : error}`)
  }

  console.log('')

  // 2. Тест прямой отправки на render-server (с подписью)
  console.log(`${label}: Прямая отправка на render-server`)

  const timestamp = Date.now()
  const eventData = {
    name: 'render/avatar-video',
    data: testPayload,
    ts: timestamp,
  }
  const body = JSON.stringify(eventData)
  const signature = createInngestSignature(body, SIGNING_KEY, timestamp)

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

    console.log(`${label}:   Response: ${response.status} ${response.statusText}`)

    if (response.ok) {
      const result = await response.json()
      console.log(`${label}:   ✅ SUCCESS!`)
      console.log(`${label}:   📝 Response:`, JSON.stringify(result, null, 2))
    } else {
      const errorText = await response.text()
      console.log(`${label}:   ❌ Error: ${errorText.substring(0, 100)}`)
    }
  } catch (error) {
    console.log(`${label}:   ❌ Exception: ${error instanceof Error ? error.message : error}`)
  }

  // Задержка между тестами
  await new Promise(resolve => setTimeout(resolve, 1000))
}

testNewEventKey()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
