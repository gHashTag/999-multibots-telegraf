/**
 * Test sending to Railway render-server with CORRECT format
 * Railway render-server is NOT Inngest - it's a custom endpoint!
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { createHmac } from 'crypto'

const RAILWAY_URL = 'https://render-v3-production.up.railway.app/api/inngest'
const SIGNING_KEY = process.env.RENDER_INNGEST_SIGNING_KEY!
const EVENT_KEY = process.env.RENDER_INNGEST_EVENT_KEY!

function createHmacSignature(body: string, timestamp: number): string {
  const hmac = createHmac('sha256', SIGNING_KEY)
  hmac.update(timestamp.toString())
  hmac.update(body)
  const signature = hmac.digest('hex')
  return `t=${timestamp}&s=${signature}`
}

async function testRailway() {
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
      avatar_speech: 'Test message from Claude Code',
    },
  }

  const bodyString = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmacSignature(bodyString, timestamp)

  console.log('🧪 Testing Railway render-server...')
  console.log('URL:', RAILWAY_URL)
  console.log('Job ID:', payload.job_id)
  console.log('Signature:', signature.substring(0, 30) + '...')
  console.log('')

  try {
    const response = await fetch(RAILWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inngest-Signature': signature,
        'Authorization': `Bearer ${EVENT_KEY}`,
      },
      body: bodyString,
    })

    console.log('Response status:', response.status, response.statusText)

    const text = await response.text()
    console.log('Response body:', text)

    if (response.ok) {
      console.log('\n✅ SUCCESS! Railway render-server accepted the request!')
      return true
    } else {
      console.log('\n❌ Failed:', response.status)
      return false
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error))
    return false
  }
}

testRailway().then((success) => {
  process.exit(success ? 0 : 1)
})
