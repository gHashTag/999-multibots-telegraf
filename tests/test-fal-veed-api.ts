/**
 * Test FAL.ai VEED/fabric-1.0 API accessibility and key validity
 * Based on user's example code
 */

import * as dotenv from 'dotenv'
import { fal } from '@fal-ai/client'

// Load environment variables
dotenv.config()

// Configure FAL client with API key
if (!process.env.FAL_KEY) {
  console.error('❌ ERROR: FAL_KEY not found in .env!')
  process.exit(1)
}

fal.config({
  credentials: process.env.FAL_KEY
})

async function testFalVeedApi() {
  console.log('🧪 Testing FAL.ai VEED/fabric-1.0 API...')
  console.log('📋 API Key:', process.env.FAL_KEY?.substring(0, 15) + '...')
  console.log('')

  try {
    // Test data from user's example
    const testInput = {
      image_url: 'https://v3b.fal.media/files/b/kangaroo/yb1YuFGFtxfGgLNPdOpfP_01.jpg',
      audio_url: 'https://v3b.fal.media/files/b/rabbit/ZudwVPvNROR-jt5_oc6f-_audio_1760628119301.mp3',
      resolution: '720p' as const
    }

    console.log('📤 Sending request to FAL.ai...')
    console.log('   Model: fal-ai/VEED/fabric-1.0')
    console.log('   Image URL:', testInput.image_url.substring(0, 50) + '...')
    console.log('   Audio URL:', testInput.audio_url.substring(0, 50) + '...')
    console.log('   Resolution:', testInput.resolution)
    console.log('')

    const startTime = Date.now()

    // Subscribe to FAL.ai with progress tracking
    const result = await fal.subscribe('fal-ai/VEED/fabric-1.0', {
      input: testInput,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('⏳ Progress:', update.status)
          update.logs.map((log) => log.message).forEach(console.log)
        } else if (update.status === 'COMPLETED') {
          console.log('✅ Status: COMPLETED')
        } else {
          console.log('📊 Status:', update.status)
        }
      },
    })

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('')
    console.log('✅ SUCCESS! FAL.ai API is accessible and working')
    console.log('⏱️  Processing time:', processingTime, 'seconds')
    console.log('')
    console.log('📥 Result:')
    console.log(JSON.stringify(result, null, 2))
    console.log('')

    // Check result structure
    if (result.data?.video) {
      console.log('✅ Video URL received:', result.data.video.url)
    } else if (result.video) {
      console.log('✅ Video URL received:', result.video)
    } else {
      console.log('⚠️  Result structure:', Object.keys(result))
    }

    console.log('')
    console.log('🎉 Test PASSED - FAL.ai API key is valid and working!')

  } catch (error) {
    console.error('')
    console.error('❌ TEST FAILED')
    console.error('Error:', error instanceof Error ? error.message : String(error))

    if (error instanceof Error && error.message.includes('401')) {
      console.error('')
      console.error('💡 TIP: API key is invalid. Check FAL_KEY in .env file')
    } else if (error instanceof Error && error.message.includes('403')) {
      console.error('')
      console.error('💡 TIP: Access forbidden. Check API key permissions')
    } else if (error instanceof Error && error.message.includes('timeout')) {
      console.error('')
      console.error('💡 TIP: Request timed out. FAL.ai might be slow or unavailable')
    }

    console.error('')
    process.exit(1)
  }
}

// Run test
testFalVeedApi()
  .then(() => {
    console.log('✨ All tests completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Unhandled error:', error)
    process.exit(1)
  })
