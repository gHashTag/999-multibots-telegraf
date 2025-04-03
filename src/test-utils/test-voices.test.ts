import { elevenlabs as elevenLabsClient } from '../core/elevenlabs'
import { logger } from '../utils/logger'

export async function testVoices(): Promise<{
  name: string
  passed: boolean
  error?: string
}> {
  try {
    logger.info('🎯 Testing ElevenLabs voices...')
    const response = await elevenLabsClient.voices.getAll()

    if (!response || !Array.isArray(response.voices)) {
      throw new Error('Invalid response format')
    }

    if (response.voices.length === 0) {
      throw new Error('No voices found')
    }

    logger.info(`✅ Found ${response.voices.length} voices`)

    return {
      name: 'Test ElevenLabs Voices',
      passed: true,
    }
  } catch (error) {
    logger.error('❌ Error testing voices:', error)
    return {
      name: 'Test ElevenLabs Voices',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
