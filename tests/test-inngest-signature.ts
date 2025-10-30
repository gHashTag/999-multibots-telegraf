/**
 * Test Inngest signature and Railway connection
 */

import { createHmac } from 'crypto'

const RENDER_URL = 'https://render-v3-production.up.railway.app/api/inngest'
const EVENT_KEY = 'kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw'
const SIGNING_KEY = 'signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047'

function createInngestSignature(signingKey: string, body: string, timestamp?: number): string {
  // Try WITHOUT normalization - keep the prefix!
  const keyToUse = signingKey
  const ts = timestamp || Math.floor(Date.now() / 1000)

  // Try different order: timestamp FIRST, then body
  const hmac = createHmac('sha256', keyToUse)
  hmac.update(ts.toString())
  hmac.update(body)

  const signature = hmac.digest('hex')
  console.log('🔍 Debug signature:', {
    timestamp: ts,
    bodyLength: body.length,
    keyLength: keyToUse.length,
    keyPrefix: keyToUse.substring(0, 15) + '...',
    signature: signature.substring(0, 20) + '...',
  })
  return `t=${ts}&s=${signature}`
}

async function testRailwayConnection() {
  // Используем один timestamp И для payload И для подписи
  const tsSeconds = Math.floor(Date.now() / 1000)

  const payload = {
    name: 'test/connection',
    data: {
      test: true,
      source: 'test-script',
    },
    ts: tsSeconds * 1000, // Milliseconds для payload
  }

  const bodyString = JSON.stringify(payload)
  const signature = createInngestSignature(SIGNING_KEY, bodyString, tsSeconds)

  console.log('📤 Sending test event to Railway...')
  console.log('🔗 URL:', RENDER_URL)
  console.log('📦 Payload size:', bodyString.length, 'bytes')
  console.log('🔏 Signature:', signature.substring(0, 20) + '...')

  try {
    // Test 1: Only X-Inngest-Signature (NO Authorization)
    console.log('\n🧪 Test 1: Only signature, no Authorization...')
    let response = await fetch(RENDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inngest-Signature': signature,
      },
      body: bodyString,
    })

    console.log('Test 1 Result:', response.status, response.statusText)
    let responseText = await response.text()
    console.log('Test 1 Body:', responseText)

    if (response.ok) {
      console.log('\n✅ SUCCESS with signature only!')
      return
    }

    // Test 2: Both Authorization AND X-Inngest-Signature
    console.log('\n🧪 Test 2: Both Authorization + signature...')
    response = await fetch(RENDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EVENT_KEY}`,
        'X-Inngest-Signature': signature,
      },
      body: bodyString,
    })

    console.log('Test 2 Result:', response.status, response.statusText)
    responseText = await response.text()
    console.log('Test 2 Body:', responseText)

    if (response.ok) {
      console.log('\n✅ SUCCESS with both headers!')
    } else {
      console.log('\n❌ FAILED both tests')
    }
  } catch (error) {
    console.error('\n❌ ERROR sending request:', error)
  }
}

testRailwayConnection()
