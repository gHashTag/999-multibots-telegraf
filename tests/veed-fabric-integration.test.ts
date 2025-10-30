/**
 * Integration test for Veed Fabric Lip-Sync API
 * Tests the complete flow: Text → ElevenLabs Audio → Kie.ai Video
 */

import axios from 'axios'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config()

// Test configuration - NO FALLBACKS to force correct env loading
const TEST_CONFIG = {
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  KIE_AI_API_KEY: process.env.KIE_AI_API_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  VOICE_ID: 'oR3nngEAzEtQhlGZHQ6P', // User's voice from logs
  TEST_IMAGE_URL: 'https://file.aiquickdraw.com/custom-page/akr/section-images/17586211027543cqpf268.webp', // Public test image from kie.ai docs
  TEST_TEXT: 'Привет! Это тест синхронизации губ.',
}

// Initialize Supabase client
const supabase = createClient(TEST_CONFIG.SUPABASE_URL!, TEST_CONFIG.SUPABASE_SERVICE_ROLE_KEY!)

// Validate API keys are loaded
if (!TEST_CONFIG.ELEVENLABS_API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY not found in environment')
  process.exit(1)
}
if (!TEST_CONFIG.KIE_AI_API_KEY) {
  console.error('❌ KIE_AI_API_KEY not found in environment')
  process.exit(1)
}
if (!TEST_CONFIG.SUPABASE_URL || !TEST_CONFIG.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment')
  process.exit(1)
}

console.log('🔑 API Keys loaded from .env:')
console.log(`  ELEVENLABS_API_KEY: ${TEST_CONFIG.ELEVENLABS_API_KEY.substring(0, 10)}...`)
console.log(`  KIE_AI_API_KEY: ${TEST_CONFIG.KIE_AI_API_KEY.substring(0, 10)}...`)
console.log(`  SUPABASE_URL: ${TEST_CONFIG.SUPABASE_URL}`)

console.log('🧪 Starting Veed Fabric Integration Test\n')
console.log('📋 Test Configuration:')
console.log(`  - ELEVENLABS_API_KEY: ${TEST_CONFIG.ELEVENLABS_API_KEY ? '✅ Set' : '❌ Missing'}`)
console.log(`  - KIE_AI_API_KEY: ${TEST_CONFIG.KIE_AI_API_KEY ? '✅ Set' : '❌ Missing'}`)
console.log(`  - VOICE_ID: ${TEST_CONFIG.VOICE_ID}`)
console.log(`  - TEST_TEXT: "${TEST_CONFIG.TEST_TEXT}"`)
console.log()

/**
 * Step 1: Generate audio via ElevenLabs
 */
async function testElevenLabsAudio() {
  console.log('🎤 [Step 1/3] Testing ElevenLabs Audio Generation...')

  try {
    const startTime = Date.now()

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${TEST_CONFIG.VOICE_ID}`,
      {
        text: TEST_CONFIG.TEST_TEXT,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          'xi-api-key': TEST_CONFIG.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      }
    )

    const duration = Date.now() - startTime

    console.log(`✅ ElevenLabs Response:`)
    console.log(`   - Status: ${response.status}`)
    console.log(`   - Duration: ${duration}ms`)
    console.log(`   - Audio size: ${response.data.length} bytes`)
    console.log(`   - Content-Type: ${response.headers['content-type']}`)

    // Upload to Supabase Storage
    console.log(`📤 Uploading audio to Supabase Storage...`)
    const audioBuffer = Buffer.from(response.data)
    const fileName = `lipsync-audio/test/${Date.now()}.mp3`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Failed to upload audio to Supabase: ${uploadError.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(fileName)

    console.log(`✅ Audio uploaded to Supabase:`)
    console.log(`   - File name: ${fileName}`)
    console.log(`   - Public URL: ${urlData.publicUrl}`)
    console.log()

    return urlData.publicUrl
  } catch (error) {
    console.error('❌ ElevenLabs Error:', error)
    if (axios.isAxiosError(error)) {
      console.error('   - Status:', error.response?.status)
      console.error('   - Data:', error.response?.data)
      console.error('   - Headers:', error.response?.headers)
    }
    throw error
  }
}

/**
 * Step 2: Generate lip-sync video via Kie.ai
 */
async function testKieAiVideo(audioDataUrl: string) {
  console.log('🎬 [Step 2/3] Testing Kie.ai Video Generation (Async API)...')

  try {
    const startTime = Date.now()

    console.log('📤 Creating task at kie.ai:')
    console.log(`   - Endpoint: https://api.kie.ai/api/v1/jobs/createTask`)
    console.log(`   - Model: veed/fabric-1`)
    console.log(`   - Image URL: ${TEST_CONFIG.TEST_IMAGE_URL}`)
    console.log(`   - Audio URL length: ${audioDataUrl.length} chars`)
    console.log(`   - Resolution: 480p`)

    // Step 1: Create task
    const createResponse = await axios.post(
      'https://api.kie.ai/api/v1/jobs/createTask',
      {
        model: 'veed/fabric-1',
        input: {
          image_url: TEST_CONFIG.TEST_IMAGE_URL,
          audio_url: audioDataUrl,
          resolution: '480p',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${TEST_CONFIG.KIE_AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    )

    console.log(`✅ Task Created:`)
    console.log(`   - Status: ${createResponse.status}`)
    console.log(`   - Response:`, JSON.stringify(createResponse.data, null, 2))

    const taskId = createResponse.data.data?.taskId
    const recordId = createResponse.data.data?.recordId

    if (!taskId && !recordId) {
      throw new Error('No taskId or recordId in response')
    }

    // Use recordId for polling if available, otherwise taskId
    const pollId = recordId || taskId

    console.log(`   - TaskId: ${taskId}`)
    console.log(`   - RecordId: ${recordId}`)
    console.log(`   - Using for polling: ${pollId}`)
    console.log()

    // Step 2: Poll for completion
    console.log('⏳ Polling for task completion...')

    let attempts = 0
    const maxAttempts = 60 // 5 minutes
    let videoUrl: string | null = null

    while (attempts < maxAttempts) {
      attempts++

      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds

      const statusResponse = await axios.get(
        `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${pollId}`,
        {
          headers: {
            Authorization: `Bearer ${TEST_CONFIG.KIE_AI_API_KEY}`,
          },
          timeout: 30000,
        }
      )

      const taskData = statusResponse.data.data
      const state = taskData?.state

      console.log(`   - Poll #${attempts}: state=${state}`)

      if (state === 'success') {
        const resultJson = JSON.parse(taskData.resultJson || '{}')
        videoUrl = resultJson.resultUrls?.[0]

        const duration = Date.now() - startTime

        console.log()
        console.log(`✅ Task Completed Successfully!`)
        console.log(`   - Total Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`)
        console.log(`   - Cost Time: ${taskData.costTime}s`)
        console.log(`   - Consume Credits: ${taskData.consumeCredits}`)
        console.log(`   - Video URL: ${videoUrl}`)
        console.log()

        if (!videoUrl) {
          throw new Error('No video URL in success response')
        }

        return videoUrl
      } else if (state === 'fail') {
        console.error()
        console.error(`❌ Task Failed:`)
        console.error(`   - Fail Code: ${taskData.failCode}`)
        console.error(`   - Fail Message: ${taskData.failMsg}`)
        throw new Error(`Task failed: ${taskData.failMsg}`)
      }

      // Continue polling (state is 'processing' or 'waiting')
    }

    throw new Error(`Task timeout after ${attempts} attempts`)
  } catch (error) {
    console.error('❌ Kie.ai Error:', error)
    if (axios.isAxiosError(error)) {
      console.error('   - Status:', error.response?.status)
      console.error('   - Data:', JSON.stringify(error.response?.data, null, 2))
      console.error('   - Headers:', error.response?.headers)
    }
    throw error
  }
}

/**
 * Step 3: Verify video is accessible
 */
async function testVideoAccess(videoUrl: string) {
  console.log('📹 [Step 3/3] Testing Video Accessibility...')

  try {
    const response = await axios.head(videoUrl, {
      timeout: 10000,
      maxRedirects: 5,
    })

    console.log(`✅ Video is accessible:`)
    console.log(`   - Status: ${response.status}`)
    console.log(`   - Content-Type: ${response.headers['content-type']}`)
    console.log(`   - Content-Length: ${response.headers['content-length']} bytes`)
    console.log()

    return true
  } catch (error) {
    console.error('❌ Video access error:', error)
    if (axios.isAxiosError(error)) {
      console.error('   - Status:', error.response?.status)
    }
    return false
  }
}

/**
 * Main test runner
 */
async function runIntegrationTest() {
  try {
    console.log('═══════════════════════════════════════════════════════')
    console.log('🚀 Starting Complete Integration Test')
    console.log('═══════════════════════════════════════════════════════\n')

    const totalStartTime = Date.now()

    // Step 1: Generate audio
    const audioDataUrl = await testElevenLabsAudio()

    // Step 2: Generate video
    const videoUrl = await testKieAiVideo(audioDataUrl)

    // Step 3: Verify video
    await testVideoAccess(videoUrl)

    const totalDuration = Date.now() - totalStartTime

    console.log('═══════════════════════════════════════════════════════')
    console.log('✅ ALL TESTS PASSED!')
    console.log('═══════════════════════════════════════════════════════')
    console.log(`Total time: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`)
    console.log(`Video URL: ${videoUrl}`)
    console.log('═══════════════════════════════════════════════════════\n')

    process.exit(0)
  } catch (error) {
    console.log()
    console.log('═══════════════════════════════════════════════════════')
    console.error('❌ TEST FAILED')
    console.log('═══════════════════════════════════════════════════════')
    console.error(error)
    console.log('═══════════════════════════════════════════════════════\n')

    process.exit(1)
  }
}

// Run the test
runIntegrationTest()
