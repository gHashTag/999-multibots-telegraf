/**
 * Test Kie.ai Sora 2 Integration
 *
 * This test validates the Sora 2 video generation API integration.
 *
 * Usage:
 *   npm run build && node dist/tests/test-kie-sora-integration.js
 */

import { KieAiProvider } from '../src/services/video-providers/KieAiProvider'

async function testSoraIntegration() {
  console.log('🎬 Testing Kie.ai Sora 2 Integration...\n')

  const provider = new KieAiProvider()

  // Test 1: Check if API key is configured
  console.log('1️⃣ Checking API configuration...')
  try {
    const balance = await provider.getAccountBalance()
    console.log(`✅ Account balance: ${balance.credits} credits\n`)
  } catch (error) {
    console.error(`❌ API key not configured or invalid: ${error}\n`)
    return
  }

  // Test 2: Generate Sora 2 video (standard)
  console.log('2️⃣ Testing Sora 2 text-to-video generation...')
  const prompt = 'A serene sunset over a calm ocean with gentle waves'

  try {
    const result = await provider.generateSoraVideo(
      prompt,
      'sora-2-text-to-video',
      'landscape',
      false
    )

    console.log('Generation response:', {
      success: result.success,
      taskId: result.data?.taskId,
      provider: result.provider,
      model: result.model,
      costUSD: result.cost.usd,
      costStars: result.cost.stars,
      error: result.error,
    })

    if (!result.success) {
      console.error(`❌ Failed to create Sora video task: ${result.error}\n`)
      return
    }

    if (!result.data?.taskId) {
      console.error('❌ No task ID returned\n')
      return
    }

    console.log(`✅ Task created successfully!`)
    console.log(`   Task ID: ${result.data.taskId}`)
    console.log(`   Cost: $${result.cost.usd} (${result.cost.stars} stars)\n`)

    // Test 3: Poll task status
    console.log('3️⃣ Testing task status polling...')
    console.log('   Polling task status (max 3 minutes)...')

    const finalResult = await provider.pollSoraTaskStatus(result.data.taskId)

    console.log('Final result:', {
      success: finalResult.success,
      hasVideo: !!finalResult.data?.videoUrl,
      videoUrl: finalResult.data?.videoUrl?.substring(0, 50) + '...',
      duration: finalResult.data?.duration,
      error: finalResult.error,
    })

    if (finalResult.success && finalResult.data?.videoUrl) {
      console.log(`✅ Video generated successfully!`)
      console.log(`   Video URL: ${finalResult.data.videoUrl}`)
      console.log(`   Duration: ${finalResult.data.duration}s\n`)
    } else {
      console.error(`❌ Video generation failed: ${finalResult.error}\n`)
    }

  } catch (error) {
    console.error(`❌ Test failed: ${error}\n`)
  }

  // Test 4: Test Sora 2 Pro model
  console.log('4️⃣ Testing Sora 2 Pro model (cost calculation only)...')
  try {
    const proResult = await provider.generateSoraVideo(
      'A futuristic cityscape at night with neon lights',
      'sora-2-pro-text-to-video',
      'portrait',
      true
    )

    console.log('Sora 2 Pro response:', {
      success: proResult.success,
      taskId: proResult.data?.taskId,
      costUSD: proResult.cost.usd,
      costStars: proResult.cost.stars,
    })

    if (proResult.success) {
      console.log(`✅ Sora 2 Pro task created`)
      console.log(`   Cost: $${proResult.cost.usd} (${proResult.cost.stars} stars)\n`)
    }
  } catch (error) {
    console.error(`❌ Sora 2 Pro test failed: ${error}\n`)
  }

  console.log('🏁 Test completed!')
}

// Run the test
testSoraIntegration().catch(console.error)
