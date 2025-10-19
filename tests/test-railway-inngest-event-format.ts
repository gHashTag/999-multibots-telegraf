/**
 * Test sending to Railway in Inngest Event format
 * Railway endpoint expects Inngest Event format: { name, data }
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { createHmac } from 'crypto'

const RAILWAY_URL = 'https://render-v3-production.up.railway.app/api/inngest'
const SIGNING_KEY = process.env.RENDER_INNGEST_SIGNING_KEY!
const EVENT_KEY = process.env.RENDER_INNGEST_EVENT_KEY!

function createSignature(body: string, timestamp: number): string {
  const hmac = createHmac('sha256', SIGNING_KEY)
  hmac.update(timestamp.toString())
  hmac.update(body)
  return `t=${timestamp}&s=${hmac.digest('hex')}`
}

// Payload в формате Inngest Event
const inngestEvent = {
  name: 'render/avatar-video', // ← Event name как в Python коде
  data: {
    // ← Payload внутри data
    job_id: `test-${Date.now()}`,
    eleven_labs_api_key: process.env.ELEVENLABS_API_KEY,
    kie_api_key: process.env.KIE_AI_API_KEY,
    cover_url: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
    intro_text_1: 'Test from Bot',
    intro_text_2: 'Inngest Event Format',
    upper_intro_text: 'Test',
    avatar_gen_service: 'hedra',
    avatar_settings: {
      api_key: process.env.HEDRA_API_KEY,
      avatar_photo_url:
        'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
      voice_id: '0BcDz9UPwL3MpsnTeUlO',
      avatar_speech: 'Test message in Inngest Event format',
    },
  },
}

console.log('🧪 Testing Railway with Inngest Event format...\n')
console.log('URL:', RAILWAY_URL)
console.log('Event name:', inngestEvent.name)
console.log('Job ID:', inngestEvent.data.job_id)
console.log('')

const bodyString = JSON.stringify(inngestEvent)
const timestamp = Math.floor(Date.now() / 1000)
const signature = createSignature(bodyString, timestamp)

console.log('📤 Sending POST request...')
console.log('Format: { name: "render/avatar-video", data: { ...payload... } }')
console.log('Signature:', signature.substring(0, 50) + '...')
console.log('')

fetch(RAILWAY_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Inngest-Signature': signature,
    Authorization: `Bearer ${EVENT_KEY}`,
  },
  body: bodyString,
})
  .then(async (response) => {
    console.log('Response status:', response.status, response.statusText)

    const text = await response.text()
    console.log('Response body:', text)

    if (response.ok) {
      console.log('\n✅ SUCCESS! Railway accepted Inngest Event format!')
      process.exit(0)
    } else {
      console.log('\n❌ Failed:', response.status)
      process.exit(1)
    }
  })
  .catch((error) => {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
