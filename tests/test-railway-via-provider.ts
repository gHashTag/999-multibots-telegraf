/**
 * Test sending to Railway via Inngest Provider with direct Railway URL
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { inngestProvider } from '../src/inngest_app/inngest-provider'

async function test() {
  console.log('🧪 Testing Railway via Inngest Provider...\n')

  // Проверяем конфигурацию
  const config = inngestProvider.getConfig('RENDER')
  if (!config) {
    console.error('❌ RENDER instance not configured')
    process.exit(1)
  }

  console.log('✅ RENDER instance configured:')
  console.log('  Base URL:', config.baseUrl)
  console.log('  Has event key:', !!config.eventKey)
  console.log('  Has client:', !!config.client)
  console.log('')

  // Payload для AI Reels
  const payload = {
    job_id: `test-${Date.now()}`,
    eleven_labs_api_key: process.env.ELEVENLABS_API_KEY,
    kie_api_key: process.env.KIE_AI_API_KEY,
    cover_url: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
    intro_text_1: 'Test from Provider',
    intro_text_2: 'Direct Railway',
    upper_intro_text: 'Test',
    avatar_gen_service: 'hedra',
    avatar_settings: {
      api_key: process.env.HEDRA_API_KEY,
      avatar_photo_url:
        'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
      voice_id: '0BcDz9UPwL3MpsnTeUlO',
      avatar_speech: 'Test message via Inngest Provider to Railway',
    },
  }

  console.log('📤 Sending event to RENDER instance...')
  console.log('Event name: render/avatar-video')
  console.log('Job ID:', payload.job_id)
  console.log('')

  try {
    const result = await inngestProvider.sendEvent('RENDER', 'render/avatar-video', payload)

    console.log('✅ SUCCESS! Event sent to Railway!')
    console.log('Result:', result)
    process.exit(0)
  } catch (error) {
    console.error('❌ ERROR:', error instanceof Error ? error.message : String(error))
    console.error('')
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  }
}

test()
