/**
 * Test sending to Inngest CLOUD (correct approach!)
 * Inngest Cloud will trigger Railway render-server function
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { Inngest } from 'inngest'

const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY!

console.log('🧪 Testing CORRECT approach - send to Inngest Cloud...\n')

// Create client WITHOUT inngestBaseUrl - defaults to Inngest Cloud!
const client = new Inngest({
  name: 'telegram-bot-client',
  eventKey: renderEventKey, // ← Registered in Inngest Cloud Production
  // NO inngestBaseUrl! Defaults to https://inn.gs/
})

console.log('✅ Client created for Inngest Cloud')
console.log('Event key:', renderEventKey.substring(0, 20) + '...')
console.log('Will send to:', (client as any).inngestApiUrl?.href)
console.log('')

const payload = {
  job_id: `telegram-test-${Date.now()}`,
  eleven_labs_api_key: process.env.ELEVENLABS_API_KEY,
  kie_api_key: process.env.KIE_AI_API_KEY,
  cover_url: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
  intro_text_1: 'Test from Bot',
  intro_text_2: 'Via Inngest Cloud',
  upper_intro_text: 'Test',
  avatar_gen_service: 'hedra',
  avatar_settings: {
    api_key: process.env.HEDRA_API_KEY,
    avatar_photo_url:
      'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech: 'Test message sent via Inngest Cloud to Railway render-server',
  },
}

console.log('📤 Sending event to Inngest Cloud...')
console.log('Event name: render/avatar-video')
console.log('Job ID:', payload.job_id)
console.log('')

client
  .send({
    name: 'render/avatar-video',
    data: payload,
  })
  .then(() => {
    console.log('✅ SUCCESS! Event sent to Inngest Cloud!')
    console.log('Inngest Cloud will trigger Railway render-server function')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error.message)
    console.error('')
    console.error('Full error:', error)
    process.exit(1)
  })
