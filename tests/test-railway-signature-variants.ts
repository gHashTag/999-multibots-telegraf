/**
 * Test different signature formats for Railway render-server
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { createHmac } from 'crypto'

const RAILWAY_URL = 'https://render-v3-production.up.railway.app/api/inngest'
const SIGNING_KEY = process.env.RENDER_INNGEST_SIGNING_KEY!
const EVENT_KEY = process.env.RENDER_INNGEST_EVENT_KEY!

const payload = {
  job_id: `test-${Date.now()}`,
  eleven_labs_api_key: process.env.ELEVENLABS_API_KEY,
  kie_api_key: process.env.KIE_AI_API_KEY,
  cover_url: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
  intro_text_1: 'Test',
  intro_text_2: 'Test',
  upper_intro_text: 'Test',
  avatar_gen_service: 'hedra',
  avatar_settings: {
    api_key: process.env.HEDRA_API_KEY,
    avatar_photo_url:
      'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech: 'Test from Claude Code',
  },
}

const bodyString = JSON.stringify(payload)
const timestamp = Math.floor(Date.now() / 1000)

// Вариант 1: t=timestamp&s=signature (Inngest format)
function sig1(body: string, ts: number): string {
  const hmac = createHmac('sha256', SIGNING_KEY)
  hmac.update(ts.toString())
  hmac.update(body)
  return `t=${ts}&s=${hmac.digest('hex')}`
}

// Вариант 2: только hex signature
function sig2(body: string, ts: number): string {
  const hmac = createHmac('sha256', SIGNING_KEY)
  hmac.update(ts.toString())
  hmac.update(body)
  return hmac.digest('hex')
}

// Вариант 3: body без timestamp
function sig3(body: string): string {
  const hmac = createHmac('sha256', SIGNING_KEY)
  hmac.update(body)
  return hmac.digest('hex')
}

// Вариант 4: timestamp + body (разделитель пробел)
function sig4(body: string, ts: number): string {
  const hmac = createHmac('sha256', SIGNING_KEY)
  const data = `${ts} ${body}`
  hmac.update(data)
  return hmac.digest('hex')
}

async function testSignature(
  name: string,
  signature: string,
  useTimestampHeader: boolean = false
) {
  console.log(`\n🧪 Testing: ${name}`)
  console.log('Signature:', signature.substring(0, 50) + '...')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Inngest-Signature': signature,
    Authorization: `Bearer ${EVENT_KEY}`,
  }

  if (useTimestampHeader) {
    headers['X-Inngest-Timestamp'] = timestamp.toString()
  }

  try {
    const response = await fetch(RAILWAY_URL, {
      method: 'POST',
      headers,
      body: bodyString,
    })

    console.log('Status:', response.status, response.statusText)
    const text = await response.text()
    console.log('Response:', text.substring(0, 100))

    if (response.ok) {
      console.log('✅ SUCCESS!')
      return true
    }
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : String(error))
  }

  return false
}

async function runTests() {
  console.log('🔍 Testing different signature formats...\n')
  console.log('Railway URL:', RAILWAY_URL)
  console.log('Job ID:', payload.job_id)
  console.log('Timestamp:', timestamp)

  const tests = [
    { name: 'Variant 1: t=ts&s=sig (Inngest)', sig: sig1(bodyString, timestamp) },
    { name: 'Variant 2: hex only', sig: sig2(bodyString, timestamp) },
    { name: 'Variant 3: body only (no ts)', sig: sig3(bodyString) },
    { name: 'Variant 4: ts + body', sig: sig4(bodyString, timestamp) },
  ]

  for (const test of tests) {
    const success = await testSignature(test.name, test.sig)
    if (success) {
      console.log('\n🎉 Found working signature format!')
      process.exit(0)
    }
  }

  // Try with timestamp header
  console.log('\n🔍 Trying with X-Inngest-Timestamp header...')
  const success = await testSignature(
    'Variant 1 with timestamp header',
    sig1(bodyString, timestamp),
    true
  )

  if (success) {
    console.log('\n🎉 Found working signature format!')
    process.exit(0)
  }

  console.log('\n❌ All signature variants failed')
  process.exit(1)
}

runTests()
