/**
 * Test Inngest Connection
 * Проверяет доступность Inngest endpoint и возможность отправки событий
 */

import * as dotenv from 'dotenv'
dotenv.config()

const INNGEST_BASE_URL = 'https://three-head-dragon.shop/api/inngest'
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY

async function testInngestConnection() {
  console.log('🧪 Testing Inngest Connection...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📍 Base URL: ${INNGEST_BASE_URL}`)
  console.log(`🔑 Event Key: ${INNGEST_EVENT_KEY ? '✅ Set' : '❌ Not set'}`)
  console.log('')

  // Test 1: Check endpoint availability
  console.log('Test 1: Checking endpoint availability...')
  try {
    const response = await fetch(INNGEST_BASE_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    console.log(`✅ Status: ${response.status} ${response.statusText}`)

    if (response.ok) {
      const data = await response.text()
      console.log(`📦 Response: ${data.substring(0, 200)}`)
    } else {
      console.log(`❌ Error response: ${await response.text()}`)
    }
  } catch (error) {
    console.error(`❌ Connection failed:`, error instanceof Error ? error.message : error)
  }

  console.log('')

  // Test 2: Try to send event (if EVENT_KEY is available)
  if (INNGEST_EVENT_KEY) {
    console.log('Test 2: Sending test event...')
    try {
      const response = await fetch(`https://api.inngest.com/e/${INNGEST_EVENT_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'test/connection',
          data: {
            timestamp: new Date().toISOString(),
            test: true,
          },
        }),
      })

      console.log(`✅ Event sent: ${response.status} ${response.statusText}`)

      if (response.ok) {
        const result = await response.json()
        console.log(`📦 Response:`, result)
      } else {
        console.log(`❌ Error: ${await response.text()}`)
      }
    } catch (error) {
      console.error(`❌ Failed to send event:`, error instanceof Error ? error.message : error)
    }
  } else {
    console.log('⚠️ Test 2 skipped: INNGEST_EVENT_KEY not set')
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

// Run test
testInngestConnection()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
