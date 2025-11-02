/**
 * Test Render Server Event Names
 * Пробуем разные форматы имен событий для render-server
 */

import * as dotenv from 'dotenv'
dotenv.config()

const INNGEST_EVENT_KEY_RENDER =
  process.env.INNGEST_EVENT_KEY_RENDER ||
  'kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw'

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

async function testEventNames() {
  console.log('🎬 Testing Render Server Event Names...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Список возможных форматов имен событий
  const eventNames = [
    // Slash format (стандартный для Inngest)
    'render/avatar-video',
    'render/avatar_video',
    'render-server/avatar-video',

    // Hyphen format
    'render-avatar-video',
    'render-avatar_video',

    // Dot format
    'render.avatar-video',
    'render.avatar_video',

    // Without namespace
    'avatar-video',
    'avatar_video',

    // Python naming conventions
    'render_avatar_video',
    'renderAvatarVideo',

    // Event type prefix
    'event/render/avatar-video',
    'inngest/render/avatar-video',
  ]

  let successCount = 0
  let failCount = 0

  for (const eventName of eventNames) {
    try {
      console.log(`Testing: "${eventName}"`)

      const response = await fetch(`https://api.inngest.com/e/${INNGEST_EVENT_KEY_RENDER}`, {
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

      if (response.ok) {
        const result = await response.json()
        console.log(`  ✅ SUCCESS! Event ID: ${result.ids?.[0]}`)
        console.log(`  📝 Correct event name: "${eventName}"`)
        console.log('')
        successCount++
        break // Нашли правильное имя, прекращаем поиск
      } else {
        console.log(`  ❌ Status: ${response.status} ${response.statusText}`)
        failCount++
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : error}`)
      failCount++
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('📊 RESULTS:')
  console.log(`  Success: ${successCount}`)
  console.log(`  Failed: ${failCount}`)
  console.log('')

  if (successCount === 0) {
    console.log('⚠️ ANALYSIS:')
    console.log('  None of the event names worked.')
    console.log('  Possible reasons:')
    console.log('  1. Render-server functions have custom event names')
    console.log('  2. Event key routing is not configured')
    console.log('  3. Render-server expects events via direct endpoint')
    console.log('')
    console.log('💡 RECOMMENDATIONS:')
    console.log('  1. Check render-server source code for actual event names')
    console.log('  2. Verify event key is associated with render-server in Inngest dashboard')
    console.log('  3. Try direct POST to render-server endpoint with signing')
  }
}

testEventNames()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
