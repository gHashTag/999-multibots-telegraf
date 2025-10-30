/**
 * Test direct Railway sending via Inngest SDK
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { Inngest } from 'inngest'

const RAILWAY_URL = process.env.RENDER_INNGEST_BASE_URL || 'https://render-v3-production.up.railway.app/api/inngest'
const EVENT_KEY = process.env.RENDER_INNGEST_EVENT_KEY!

console.log('🧪 Testing direct Railway via Inngest SDK...\n')
console.log('Railway URL:', RAILWAY_URL)
console.log('Event key:', EVENT_KEY.substring(0, 20) + '...')
console.log('')

// Create Inngest client with Railway URL
const client = new Inngest({
  name: 'render-test-client',
  eventKey: EVENT_KEY,
  inngestBaseUrl: RAILWAY_URL, // ← Direct Railway URL!
})

console.log('✅ Client created with Railway baseUrl')
console.log('Client API URL:', (client as any).inngestApiUrl?.href || 'unknown')
console.log('')

const payload = {
  job_id: `test-${Date.now()}`,
  eleven_labs_api_key: process.env.ELEVENLABS_API_KEY,
  kie_api_key: process.env.KIE_AI_API_KEY,
  cover_url: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
  intro_text_1: 'Test Direct Railway',
  intro_text_2: 'Via Inngest SDK',
  upper_intro_text: 'Test',
  avatar_gen_service: 'hedra',
  avatar_settings: {
    api_key: process.env.HEDRA_API_KEY,
    avatar_photo_url:
      'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech: 'Testing direct Railway call via Inngest SDK',
  },
}

console.log('📤 Sending event to Railway via SDK...')
console.log('Event name: render/avatar-video')
console.log('Job ID:', payload.job_id)
console.log('')

client
  .send({
    name: 'render/avatar-video',
    data: payload,
  })
  .then(() => {
    console.log('✅ SUCCESS! Event sent to Railway via Inngest SDK!')
    console.log('SDK handled authentication and signature automatically')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error.message || String(error))
    console.error('')
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
    }
    process.exit(1)
  })
