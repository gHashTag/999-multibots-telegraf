import { ElevenLabsClient } from 'elevenlabs'

// Используем мок в тестовом окружении
let elevenlabs

if (process.env.NODE_ENV === 'test') {
  const {
    elevenlabs: mockElevenlabs,
  } = require('@/test-utils/mocks/elevenlabs.mock')
  elevenlabs = mockElevenlabs
} else {
  try {
    elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY || '',
    })
  } catch (error) {
    console.error('Failed to initialize ElevenLabs client:', error)
    throw error
  }
}

export { elevenlabs }
