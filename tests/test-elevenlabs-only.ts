/**
 * Test ElevenLabs API separately to isolate the issue
 */

import axios from 'axios'
import { ELEVENLABS_API_KEY } from '../src/config'

const TEST_CONFIG = {
  VOICE_ID: 'oR3nngEAzEtQhlGZHQ6P',
  TEXT: 'Привет! Это тест.',
}

async function testElevenLabsAPI() {
  console.log('🧪 Testing ElevenLabs API...\n')

  console.log('📋 Configuration:')
  console.log('- API Key present:', !!ELEVENLABS_API_KEY)
  console.log('- API Key length:', ELEVENLABS_API_KEY?.length || 0)
  console.log('- Voice ID:', TEST_CONFIG.VOICE_ID)
  console.log('- Text:', TEST_CONFIG.TEXT)
  console.log()

  if (!ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY is not set!')
    process.exit(1)
  }

  try {
    console.log('🚀 Sending request to ElevenLabs...')
    const startTime = Date.now()

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${TEST_CONFIG.VOICE_ID}`,
      {
        text: TEST_CONFIG.TEXT,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      }
    )

    const duration = Date.now() - startTime
    console.log(`✅ Success! (${(duration / 1000).toFixed(2)}s)`)
    console.log('- Status:', response.status)
    console.log('- Audio size:', response.data.byteLength, 'bytes')
    console.log()
    console.log('✅ ElevenLabs API is working correctly!')
  } catch (error) {
    console.error('❌ ElevenLabs API failed:')
    if (axios.isAxiosError(error)) {
      console.error('- Status:', error.response?.status)
      console.error('- Status text:', error.response?.statusText)
      console.error('- Error data:', error.response?.data?.toString())
      console.error('- Message:', error.message)
    } else {
      console.error(error)
    }
    process.exit(1)
  }
}

testElevenLabsAPI()
