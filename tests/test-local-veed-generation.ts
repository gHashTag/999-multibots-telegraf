/**
 * Local test for Veed Fabric generation with real API call
 */

import { lipSyncOrchestrator } from '../src/core/lipsync/lipsync-orchestrator'
import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'

const TEST_CONFIG = {
  TELEGRAM_ID: '144022504',
  TEST_IMAGE_URL: 'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/neuro-photo/144022504/flux_dev_1734052846683_face.png',
  TEST_TEXT: 'Привет! Это тестовое сообщение для проверки работы Veed Fabric.',
}

async function testLocalVeedGeneration() {
  console.log('🧪 Testing local Veed Fabric generation with real API...\n')

  try {
    console.log('📋 Test configuration:')
    console.log('- Telegram ID:', TEST_CONFIG.TELEGRAM_ID)
    console.log('- Image URL:', TEST_CONFIG.TEST_IMAGE_URL.substring(0, 80) + '...')
    console.log('- Text:', TEST_CONFIG.TEST_TEXT)
    console.log()

    // Создаем input как в wizard
    const input = LipSyncInputBuilder.forVeedFabric(
      TEST_CONFIG.TEST_IMAGE_URL,
      TEST_CONFIG.TEST_TEXT,
      TEST_CONFIG.TELEGRAM_ID,
      {
        botName: 'test_bot',
        resolution: '480p',
        isAudioUrl: false, // Используем текст, а не audioUrl
      }
    )

    console.log('✅ Created input:', JSON.stringify(input, null, 2))
    console.log()

    console.log('🚀 Starting generation...')
    const startTime = Date.now()

    const result = await lipSyncOrchestrator.generate(input)

    const duration = Date.now() - startTime
    console.log(`⏱️ Generation took ${(duration / 1000).toFixed(2)}s`)
    console.log()

    // Проверяем результат
    if ('id' in result) {
      console.log('✅ SUCCESS! Video generated:', {
        id: result.id,
        status: result.status,
        output: result.output,
        modelUsed: result.modelUsed,
        costEstimate: result.costEstimate,
        processingTime: result.processingTime,
      })
    } else {
      console.log('❌ FAILED! Error:', {
        message: result.message,
        error: result.error,
        code: result.code,
        provider: result.provider,
        modelId: result.modelId,
      })
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test failed with exception:')
    console.error(error)
    process.exit(1)
  }
}

testLocalVeedGeneration()
