/**
 * Test sending Inngest Event in correct format
 * Like Python code does with inngest.Event()
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { Inngest } from 'inngest'
import { randomUUID } from 'crypto'

const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY!
const renderSigningKey = process.env.RENDER_INNGEST_SIGNING_KEY!
const renderBaseUrl = 'https://render-v3-production.up.railway.app'

console.log('🧪 Testing Inngest Event format (like Python SDK)...\n')

// Set environment variables BEFORE creating client
const originalBaseUrl = process.env.INNGEST_BASE_URL
const originalSigningKey = process.env.INNGEST_SIGNING_KEY
const originalEventKey = process.env.INNGEST_EVENT_KEY

process.env.INNGEST_BASE_URL = renderBaseUrl
process.env.INNGEST_SIGNING_KEY = renderSigningKey
process.env.INNGEST_EVENT_KEY = renderEventKey

console.log('Environment set:')
console.log('- INNGEST_BASE_URL:', process.env.INNGEST_BASE_URL)
console.log('- INNGEST_EVENT_KEY:', process.env.INNGEST_EVENT_KEY?.substring(0, 20) + '...')
console.log('- INNGEST_SIGNING_KEY:', process.env.INNGEST_SIGNING_KEY?.substring(0, 20) + '...')
console.log('')

// Create client AFTER setting env vars
const client = new Inngest({
  name: 'render-test-client',
  eventKey: renderEventKey,
  inngestBaseUrl: renderBaseUrl,
})

console.log('✅ Client created')
console.log('Client URL:', (client as any).inngestApiUrl?.href)
console.log('')

// Create payload in Inngest Event format
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

console.log('📤 Sending event in Inngest format...')
console.log('Event name: render/avatar-video')
console.log('Job ID:', payload.job_id)
console.log('')

client
  .send({
    // id: `render-avatar/${randomUUID()}`, // Optional
    name: 'render/avatar-video', // ← Event name like Python!
    data: payload, // ← Payload inside data
  })
  .then(() => {
    console.log('✅ SUCCESS! Event sent to Railway!')

    // Restore environment
    if (originalBaseUrl) process.env.INNGEST_BASE_URL = originalBaseUrl
    else delete process.env.INNGEST_BASE_URL
    if (originalSigningKey) process.env.INNGEST_SIGNING_KEY = originalSigningKey
    else delete process.env.INNGEST_SIGNING_KEY
    if (originalEventKey) process.env.INNGEST_EVENT_KEY = originalEventKey
    else delete process.env.INNGEST_EVENT_KEY

    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error.message)
    console.error('')
    console.error('Full error:', error)

    // Restore environment
    if (originalBaseUrl) process.env.INNGEST_BASE_URL = originalBaseUrl
    else delete process.env.INNGEST_BASE_URL
    if (originalSigningKey) process.env.INNGEST_SIGNING_KEY = originalSigningKey
    else delete process.env.INNGEST_SIGNING_KEY
    if (originalEventKey) process.env.INNGEST_EVENT_KEY = originalEventKey
    else delete process.env.INNGEST_EVENT_KEY

    process.exit(1)
  })
