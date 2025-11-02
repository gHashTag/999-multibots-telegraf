/**
 * Test Correct Inngest URL
 * Проверка с ПРАВИЛЬНЫМ URL: https://inn.gs/e/{EVENT_KEY}
 */

// СТАРЫЙ ключ (render-server)
const OLD_EVENT_KEY = 'kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw'

// НОВЫЙ ключ (от пользователя)
const NEW_EVENT_KEY = 'n6DddAUg5idycTbtQGP7lXn6FCoIDcEkAdlX72WmC5k_GJcrjBFm4n_aCNmInAh_zQ2Yd070y4gzPeYnJTUadA'

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
      'AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров. Его цель — предоставить отдельное, удобное место для инструкций и контекста, необходимых именно искусственным агентам, а не людям. AGENTS.md помогает агентам быстрее понимать архитектуру проекта, правила взаимодействия с кодом и предпочтительные практики разработки, минимизируя необходимость дополнительных пояснений от человека.',
  },
}

async function testCorrectUrl() {
  console.log('🎯 Test: Правильный Inngest URL')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('✅ ПРАВИЛЬНЫЙ URL: https://inn.gs/e/{EVENT_KEY}')
  console.log('❌ НЕПРАВИЛЬНЫЙ URL: https://api.inngest.com/e/{EVENT_KEY}')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 1: СТАРЫЙ ключ
  console.log('🔵 Test 1: СТАРЫЙ Event Key')
  console.log(`   Key: ${OLD_EVENT_KEY.substring(0, 30)}...`)
  console.log('')

  await testEventKey(OLD_EVENT_KEY, 'СТАРЫЙ')

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 2: НОВЫЙ ключ
  console.log('🟢 Test 2: НОВЫЙ Event Key')
  console.log(`   Key: ${NEW_EVENT_KEY.substring(0, 30)}...`)
  console.log('')

  await testEventKey(NEW_EVENT_KEY, 'НОВЫЙ')

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('📊 ИТОГИ:')
  console.log('')
  console.log('✅ 200 OK + Event IDs = Ключ работает правильно!')
  console.log('   → События отправляются на render-server')
  console.log('   → Обновите INNGEST_EVENT_KEY_RENDER в .env')
  console.log('')
  console.log('❌ 404 Not Found = Ключ не связан с app')
  console.log('   → Проверьте настройки в Inngest Dashboard')
  console.log('')
  console.log('❌ 401 Unauthorized = Неправильный ключ')
  console.log('   → Проверьте что ключ скопирован полностью')
}

async function testEventKey(eventKey: string, label: string) {
  const correctUrl = `https://inn.gs/e/${eventKey}`

  console.log(`📤 Отправка на: ${correctUrl}`)
  console.log(`📦 Event: render/avatar-video`)
  console.log(`📊 Payload size: ${JSON.stringify(testPayload).length} bytes`)
  console.log('')

  try {
    const response = await fetch(correctUrl, {
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

    console.log(`📡 Response: ${response.status} ${response.statusText}`)
    console.log('')

    if (response.ok) {
      const result = await response.json()
      console.log(`✅ SUCCESS! ${label} ключ РАБОТАЕТ!`)
      console.log(`📝 Response:`)
      console.log(JSON.stringify(result, null, 2))
      console.log('')
      console.log(`🎉 Event IDs: ${result.ids?.join(', ') || 'N/A'}`)
      console.log(`📊 Status: ${result.status || 'queued'}`)
      console.log('')
      console.log(`💡 ИСПОЛЬЗУЙТЕ ЭТОТ КЛЮЧ: ${eventKey.substring(0, 30)}...`)
    } else {
      const errorText = await response.text()
      console.log(`❌ FAILED! ${label} ключ НЕ РАБОТАЕТ`)
      console.log(`📝 Error Response:`)
      console.log(errorText.substring(0, 500))
      console.log('')

      if (response.status === 404) {
        console.log('💡 404 = Event Key не связан с render-server app')
        console.log('   Действия:')
        console.log('   1. Откройте Inngest Dashboard: https://app.inngest.com')
        console.log('   2. Найдите render-server app')
        console.log('   3. Проверьте что этот Event Key связан с app')
      } else if (response.status === 401) {
        console.log('💡 401 = Неправильный Event Key')
        console.log('   Проверьте что ключ скопирован полностью')
      }
    }
  } catch (error) {
    console.log(`❌ Exception: ${error instanceof Error ? error.message : error}`)
  }

  // Задержка между тестами
  await new Promise(resolve => setTimeout(resolve, 1000))
}

testCorrectUrl()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
