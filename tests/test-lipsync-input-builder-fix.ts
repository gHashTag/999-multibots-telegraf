/**
 * Test to verify the LipSyncInputBuilder.forVeedFabric fix
 * This test verifies that the method now exists and works correctly
 */

import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'

async function testLipSyncInputBuilderFix() {
  console.log('🧪 Testing LipSyncInputBuilder.forVeedFabric fix...\n')

  try {
    // ✅ Test 1: Verify method exists
    console.log('📝 Test 1: Verify forVeedFabric method exists')
    if (typeof LipSyncInputBuilder.forVeedFabric !== 'function') {
      throw new Error('❌ forVeedFabric method does not exist!')
    }
    console.log('✅ Method exists\n')

    // ✅ Test 2: Text mode (no audioUrl)
    console.log('📝 Test 2: Text mode (isAudioUrl=false)')
    const textInput = LipSyncInputBuilder.forVeedFabric(
      'https://example.com/image.jpg',
      'Привет, это тестовое сообщение',
      '144022504',
      {
        botName: 'test_bot',
        resolution: '720p',
        isAudioUrl: false,
      }
    )

    console.log('Created input:', JSON.stringify(textInput, null, 2))

    // Verify text input structure
    if (!textInput.imageUrl) throw new Error('Missing imageUrl')
    if (!textInput.text) throw new Error('Missing text in text mode')
    if (textInput.audioUrl) throw new Error('audioUrl should be undefined in text mode')
    if (textInput.provider !== 'kie') throw new Error('Wrong provider')
    if (textInput.modelId !== 'veed-fabric') throw new Error('Wrong modelId')

    console.log('✅ Text mode works correctly\n')

    // ✅ Test 3: Audio mode (isAudioUrl=true)
    console.log('📝 Test 3: Audio mode (isAudioUrl=true)')
    const audioInput = LipSyncInputBuilder.forVeedFabric(
      'https://example.com/image.jpg',
      'https://example.com/audio.mp3',
      '144022504',
      {
        botName: 'test_bot',
        resolution: '480p',
        isAudioUrl: true,
      }
    )

    console.log('Created input:', JSON.stringify(audioInput, null, 2))

    // Verify audio input structure
    if (!audioInput.imageUrl) throw new Error('Missing imageUrl')
    if (audioInput.text) throw new Error('text should be undefined in audio mode')
    if (!audioInput.audioUrl) throw new Error('Missing audioUrl in audio mode')
    if (audioInput.provider !== 'kie') throw new Error('Wrong provider')
    if (audioInput.modelId !== 'veed-fabric') throw new Error('Wrong modelId')

    console.log('✅ Audio mode works correctly\n')

    // ✅ Test 4: Default values
    console.log('📝 Test 4: Default values when options not provided')
    const defaultInput = LipSyncInputBuilder.forVeedFabric(
      'https://example.com/image.jpg',
      'Test text',
      '144022504'
    )

    console.log('Created input:', JSON.stringify(defaultInput, null, 2))

    if (defaultInput.botName !== 'unknown_bot') throw new Error('Wrong default botName')
    if (defaultInput.resolution !== '480p') throw new Error('Wrong default resolution')

    console.log('✅ Default values work correctly\n')

    console.log('🎉 All tests passed! The bug is fixed.')
    console.log('\n📊 Summary:')
    console.log('  ✅ forVeedFabric method exists')
    console.log('  ✅ Text mode works correctly')
    console.log('  ✅ Audio mode works correctly')
    console.log('  ✅ Default values work correctly')

  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Run test
testLipSyncInputBuilderFix()
  .then(() => {
    console.log('\n✅ Test suite completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error)
    process.exit(1)
  })
