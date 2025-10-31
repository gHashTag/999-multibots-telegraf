/**
 * Test Render Server с точными токенами
 * Проверка с правильными INNGEST_EVENT_KEY и INNGEST_SIGNING_KEY
 */

const INNGEST_EVENT_KEY = 'kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw'
const INNGEST_SIGNING_KEY = 'signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047'

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
      'AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров. Его цель — предоставить отдельное, удобное место для инструкций и контекста, необходимых именно искусственным агентам, а не людям. AGENTS.md помогает агентам быстрее понимать архитектуру проекта, правила взаимодействия с кодом и предпочтительные практики разработки, минимизируя необходимость дополнительных пояснений от человека.',
  },
}

async function testRenderWithExactTokens() {
  console.log('🎬 Testing Render Server с точными токенами')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log(`🔑 Event Key: ${INNGEST_EVENT_KEY.substring(0, 30)}...`)
  console.log(`🔐 Signing Key: ${INNGEST_SIGNING_KEY.substring(0, 30)}...`)
  console.log('')

  // Test 1: Отправка через Inngest Cloud API
  console.log('Test 1: Отправка события "render/avatar-video" через Inngest API')
  try {
    const eventData = {
      name: 'render/avatar-video',
      data: testPayload,
      ts: Date.now(),
    }

    console.log(`📤 Sending to: https://api.inngest.com/e/${INNGEST_EVENT_KEY.substring(0, 20)}...`)
    console.log(`📦 Event name: "${eventData.name}"`)
    console.log(`📊 Payload size: ${JSON.stringify(testPayload).length} bytes`)
    console.log('')

    const response = await fetch(`https://api.inngest.com/e/${INNGEST_EVENT_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    })

    console.log(`📡 Response Status: ${response.status} ${response.statusText}`)

    if (response.ok) {
      const result = await response.json()
      console.log(`✅ SUCCESS!`)
      console.log(`📝 Response:`, JSON.stringify(result, null, 2))
      console.log('')
      console.log(`🎉 Event ID: ${result.ids?.[0]}`)
      console.log(`🎯 Status: ${result.status || 'queued'}`)
    } else {
      const errorText = await response.text()
      console.log(`❌ FAILED`)
      console.log(`📝 Error Response:`, errorText.substring(0, 500))
    }
  } catch (error) {
    console.error(`❌ Error:`, error instanceof Error ? error.message : error)
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 2: Проверка render-server endpoint
  console.log('Test 2: Проверка render-server Inngest endpoint')
  try {
    const response = await fetch('https://render-v3-production.up.railway.app/api/inngest', {
      method: 'GET',
    })

    console.log(`📡 Status: ${response.status} ${response.statusText}`)

    if (response.ok) {
      const data = await response.json()
      console.log(`✅ Render server доступен`)
      console.log(`📦 Response:`, JSON.stringify(data, null, 2))

      if (data.functions && Array.isArray(data.functions)) {
        console.log('')
        console.log(`🔧 Зарегистрированные функции (${data.functions.length}):`)
        data.functions.forEach((fn: any, i: number) => {
          console.log(`  ${i + 1}. ${fn.name || fn.id || fn}`)
        })
      }
    }
  } catch (error) {
    console.error(`❌ Error:`, error instanceof Error ? error.message : error)
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('💡 ВЫВОДЫ:')
  console.log('  - Токены предоставлены корректно')
  console.log('  - Render-server доступен на Railway')
  console.log('  - Если 404: event key не связан с render-server app')
  console.log('  - Если 200: событие успешно отправлено в очередь')
  console.log('')
  console.log('📋 Следующие шаги:')
  console.log('  1. Проверить Inngest Dashboard для event key')
  console.log('  2. Убедиться что event key связан с render-server')
  console.log('  3. Проверить логи render-server: railway logs')
}

testRenderWithExactTokens()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
