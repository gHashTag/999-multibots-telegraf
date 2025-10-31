/**
 * Test Inngest Provider
 * Проверяет работу inngestProvider с несколькими инстансами
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { inngestProvider } from '../src/inngest_app/inngest-provider'

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
    api_key: 'sk_hedra_jTiPa9kEiQ25EwjwkAoaCPmxcMfZZalnSUi-tQOjZrBISgz9jqKtK0j96YzreHQ3',
    avatar_photo_url:
      'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech:
      'AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров.',
  },
}

async function testInngestProvider() {
  console.log('🧪 Testing Inngest Provider...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Test 1: Список доступных инстансов
  console.log('Test 1: Available Instances')
  const instances = inngestProvider.getAvailableInstances()
  console.log(`  Configured instances: ${instances.join(', ')}`)
  console.log('')

  // Test 2: Проверка конфигураций
  console.log('Test 2: Instance Configurations')
  for (const instance of instances) {
    const config = inngestProvider.getConfig(instance)
    if (config) {
      console.log(`  ${instance}:`)
      console.log(`    Name: ${config.name}`)
      console.log(`    Base URL: ${config.baseUrl || 'N/A'}`)
      console.log(`    Event Key: ${config.eventKey.substring(0, 20)}...`)
      console.log(`    Signing Key: ${config.signingKey ? config.signingKey.substring(0, 20) + '...' : 'N/A'}`)
    }
  }
  console.log('')

  // Test 3: Проверка доступности
  console.log('Test 3: Availability Check')
  const status = await inngestProvider.getStatus()
  for (const [instance, stat] of Object.entries(status)) {
    console.log(`  ${instance}:`)
    console.log(`    Configured: ${stat.configured ? '✅' : '❌'}`)
    console.log(`    Available: ${stat.available ? '✅' : '❌'}`)
  }
  console.log('')

  // Test 4: Отправка события на RENDER
  console.log('Test 4: Send Event to RENDER')
  try {
    const result = await inngestProvider.sendEvent('RENDER', 'render/avatar-video', testPayload)
    if (result) {
      console.log(`  ✅ Event sent successfully!`)
      console.log(`  Event ID: ${result.eventId}`)
    }
  } catch (error) {
    console.error(`  ❌ Failed to send event:`, error instanceof Error ? error.message : error)
  }
  console.log('')

  // Test 5: Отправка события на BOT (если доступен)
  console.log('Test 5: Send Event to BOT')
  try {
    const result = await inngestProvider.sendEvent('BOT', 'ai-reels/generate', {
      telegramId: 'test-user',
      imageUrl: 'https://example.com/test.jpg',
      text: 'Test message',
      resolution: '720p',
    })
    if (result) {
      console.log(`  ✅ Event sent successfully!`)
      console.log(`  Event ID: ${result.eventId}`)
    }
  } catch (error) {
    console.error(`  ❌ Failed to send event:`, error instanceof Error ? error.message : error)
  }
  console.log('')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('📋 SUMMARY:')
  console.log('  - Inngest Provider manages multiple instances')
  console.log('  - BOT instance: for main bot functions (our server)')
  console.log('  - RENDER instance: for render-server functions (Railway)')
  console.log('  - Each instance has its own event key and signing key')
  console.log('')
  console.log('🎯 Environment Variables Required:')
  console.log('  BOT:')
  console.log('    - INNGEST_EVENT_KEY')
  console.log('    - INNGEST_SIGNING_KEY (optional)')
  console.log('    - INNGEST_BASE_URL (optional)')
  console.log('  RENDER:')
  console.log('    - INNGEST_EVENT_KEY_RENDER')
  console.log('    - INNGEST_SIGNING_KEY_RENDER (optional)')
}

testInngestProvider()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
