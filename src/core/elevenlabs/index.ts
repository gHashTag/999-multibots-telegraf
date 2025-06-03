// Mock-класс для ElevenLabs API
class MockElevenLabsClient {
  // Сохраняем конфиг для отладки
  private config: any

  constructor(config: any) {
    console.warn('[MOCK] Creating mock ElevenLabs client')
    this.config = config
  }

  // Мок-методы для всех необходимых методов API
  async getVoices() {
    console.warn('[MOCK] Called getVoices()')
    return { voices: [] }
  }

  async generateVoiceSpeech(voiceId: string, text: string) {
    console.warn('[MOCK] Called generateVoiceSpeech()', {
      voiceId,
      textLength: text.length,
    })
    // Возвращаем пустой ArrayBuffer (1 байт)
    return new Uint8Array(1).buffer
  }

  async generate(options: any) {
    console.warn('[MOCK] Called generate()', {
      voice: options.voice,
      textLength: options.text?.length,
      model: options.model_id,
    })
    // Return a mock readable stream
    const { Readable } = require('stream')
    const mockStream = new Readable({
      read() {
        this.push(Buffer.from('mock audio data'))
        this.push(null) // End the stream
      },
    })
    return mockStream
  }

  async voiceExists(voiceId: string): Promise<boolean> {
    console.warn('[MOCK] Called voiceExists()', { voiceId })
    return false // Mock always returns false to indicate voice doesn't exist
  }
}

// Определяем, используем реальный API или мок
const createElevenLabsClient = () => {
  // Сначала проверяем наличие API ключа
  if (!process.env.ELEVENLABS_API_KEY) {
    console.warn(
      'ELEVENLABS_API_KEY not found in environment, using mock client'
    )
    return new MockElevenLabsClient({ apiKey: 'mock-key' })
  }

  try {
    // Безопасная попытка использовать реальный клиент
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ElevenLabsClient } = require('elevenlabs')

    const client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    })

    // Add voiceExists method to the client
    client.voiceExists = async (voiceId: string): Promise<boolean> => {
      try {
        // Debug logging to see what API key is being used
        console.log(
          '[ElevenLabs] DEBUG: Checking voice existence with API key:',
          process.env.ELEVENLABS_API_KEY?.substring(0, 10) + '...'
        )
        console.log('[ElevenLabs] DEBUG: Looking for voice ID:', voiceId)

        const voices = await client.voices.getAll()
        console.log(
          '[ElevenLabs] DEBUG: Found voices count:',
          voices.voices.length
        )
        console.log(
          '[ElevenLabs] DEBUG: Voice IDs in account:',
          voices.voices.map((v: any) => v.voice_id)
        )

        const exists = voices.voices.some(
          (voice: any) => voice.voice_id === voiceId
        )
        console.log('[ElevenLabs] DEBUG: Voice exists?', exists)

        return exists
      } catch (error) {
        console.error('[ElevenLabs] Error checking if voice exists:', error)
        return false
      }
    }

    return client
  } catch (error) {
    console.error(
      'Error creating ElevenLabs client, falling back to mock:',
      error
    )
    return new MockElevenLabsClient({ apiKey: 'mock-key-after-error' })
  }
}

export const elevenlabs = createElevenLabsClient()

// Helper function to check if a voice exists
export const checkVoiceExists = async (voiceId: string): Promise<boolean> => {
  try {
    return await elevenlabs.voiceExists(voiceId)
  } catch (error) {
    console.error('[ElevenLabs] Error in checkVoiceExists:', error)
    return false
  }
}
