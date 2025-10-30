/**
 * Direct test of Kie Provider with detailed logging
 */

import { KieVeedFabricProvider } from '../src/core/lipsync/providers/kie-veed-fabric-provider'

const TEST_CONFIG = {
  TELEGRAM_ID: '144022504',
  TEST_IMAGE_URL: 'https://file.aiquickdraw.com/custom-page/akr/section-images/17586211027543cqpf268.webp', // Public test image from kie.ai docs
  TEST_TEXT: 'Привет! Это тестовое сообщение.',
}

async function testKieProviderDirect() {
  console.log('🧪 Testing Kie Provider directly with detailed logging...\n')

  try {
    console.log('1️⃣  Creating provider instance...')
    const provider = new KieVeedFabricProvider()
    console.log('✅ Provider created')
    console.log()

    console.log('2️⃣  Checking provider availability...')
    const isAvailable = await provider.isAvailable()
    console.log('✅ Provider available:', isAvailable)
    console.log()

    if (!isAvailable) {
      console.error('❌ Provider not available!')
      process.exit(1)
    }

    console.log('3️⃣  Creating input...')
    const input = {
      provider: 'kie' as const,
      modelId: 'veed-fabric' as const,
      imageUrl: TEST_CONFIG.TEST_IMAGE_URL,
      text: TEST_CONFIG.TEST_TEXT,
      telegramId: TEST_CONFIG.TELEGRAM_ID,
      botName: 'test_bot',
      resolution: '480p' as const,
    }
    console.log('✅ Input created:', JSON.stringify(input, null, 2))
    console.log()

    console.log('4️⃣  Starting generation...')
    console.log('⏳ This may take 30-90 seconds...')
    console.log()

    const startTime = Date.now()
    const result = await provider.generate(input)
    const duration = Date.now() - startTime

    console.log()
    console.log(`⏱️  Generation took ${(duration / 1000).toFixed(2)}s`)
    console.log()

    if ('id' in result) {
      console.log('✅ SUCCESS!')
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log('❌ FAILED!')
      console.log(JSON.stringify(result, null, 2))
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test failed with exception:')
    console.error(error)
    process.exit(1)
  }
}

testKieProviderDirect()
