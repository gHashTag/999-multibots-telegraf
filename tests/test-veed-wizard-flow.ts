/**
 * Test script to verify Veed Fabric wizard flow
 * Mimics the exact flow that the wizard uses
 */

import { lipSyncOrchestrator } from '../src/core/lipsync/lipsync-orchestrator'
import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'

async function testVeedFabricWizardFlow() {
  console.log('🧪 Testing Veed Fabric wizard flow...\n')

  try {
    // Test 1: Text mode (как wizard передает с текстом)
    console.log('📝 Test 1: Text mode (no audioUrl, text only)')
    const textInput = LipSyncInputBuilder.forVeedFabric(
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/test-image.jpg',
      'Привет, это тестовое сообщение для проверки генерации видео', // text
      '144022504',
      {
        botName: 'test_bot',
        resolution: '480p',
        isAudioUrl: false, // ❗ Флаг: это текст, а не audioUrl
      }
    )

    console.log('✅ Created text input:', JSON.stringify(textInput, null, 2))
    console.log()

    // Test 2: Voice mode (как wizard передает с голосовым сообщением)
    console.log('🎤 Test 2: Voice mode (audioUrl from voice message)')
    const voiceInput = LipSyncInputBuilder.forVeedFabric(
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/test-image.jpg',
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/test-audio.ogg', // audioUrl
      '144022504',
      {
        botName: 'test_bot',
        resolution: '480p',
        isAudioUrl: true, // ❗ Флаг: это audioUrl, а не текст
      }
    )

    console.log('✅ Created voice input:', JSON.stringify(voiceInput, null, 2))
    console.log()

    // Test 3: Проверка поддержки провайдера
    console.log('🔍 Test 3: Provider availability check')
    const isAvailable = lipSyncOrchestrator.isProviderAvailable('kie')
    console.log('Provider "kie" available:', isAvailable)
    console.log()

    // Test 4: Список доступных провайдеров
    console.log('📋 Test 4: Available providers list')
    const availableProviders = lipSyncOrchestrator.getAvailableProviders()
    console.log('Available providers:', availableProviders)
    console.log()

    console.log('✅ All structural tests passed!')
    console.log('📌 Note: This test only verifies input structure, not actual API calls')
  } catch (error) {
    console.error('❌ Test failed with error:')
    console.error(error)
    process.exit(1)
  }
}

testVeedFabricWizardFlow()
