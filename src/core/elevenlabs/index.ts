// Import config to load .env before checking ELEVENLABS_API_KEY
import '@/config'
import { secretFingerprint } from '@/utils/secretFingerprint'

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
    const { Readable } = require('node:stream')
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
  const apiKey = process.env.ELEVENLABS_API_KEY

  console.log(
    '[ElevenLabs] Creating client with API key:',
    apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT FOUND'
  )

  if (!apiKey) {
    console.warn(
      'ELEVENLABS_API_KEY not found in environment, using mock client'
    )
    return new MockElevenLabsClient({ apiKey: 'mock-key' })
  }

  try {
    // Безопасная попытка использовать реальный клиент
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ElevenLabsClient } = require('elevenlabs')

    // The digest tells two environments apart just as well as a prefix did,
    // without putting key material into Railway's log retention. The length
    // stays: a truncated key is a real and common misconfiguration.
    console.log(
      '[ElevenLabs] Initializing ElevenLabsClient with key:',
      `${secretFingerprint(apiKey)} (${apiKey.length} chars)`
    )

    const client = new ElevenLabsClient({
      apiKey: apiKey,
    })

    console.log('[ElevenLabs] Client created successfully')

    // Add voiceExists method to the client
    client.voiceExists = async (voiceId: string): Promise<boolean> => {
      try {
        // Debug logging to see what API key is being used
        console.log(
          '[ElevenLabs] DEBUG: Checking voice existence with API key:',
          secretFingerprint(process.env.ELEVENLABS_API_KEY)
        )
        console.log('[ElevenLabs] DEBUG: Looking for voice ID:', voiceId)

        const voicesResponse = await client.voices.getAll()
        console.log('[ElevenLabs] DEBUG: Raw API response:', voicesResponse)

        // Handle different possible response structures
        const voicesList = voicesResponse?.voices || voicesResponse || []
        console.log(
          '[ElevenLabs] DEBUG: Found voices count:',
          Array.isArray(voicesList) ? voicesList.length : 'Not an array'
        )

        if (!Array.isArray(voicesList)) {
          console.error(
            '[ElevenLabs] ERROR: Voices response is not an array:',
            typeof voicesList
          )
          return false
        }

        console.log(
          '[ElevenLabs] DEBUG: Voice IDs in account:',
          voicesList.map((v: any) => v.voice_id || v.id)
        )

        const exists = voicesList.some(
          (voice: any) => (voice.voice_id || voice.id) === voiceId
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

// Lazy initialization - create client only when accessed
let _elevenlabs: any = null

export const getElevenLabsClient = () => {
  if (!_elevenlabs) {
    _elevenlabs = createElevenLabsClient()
  }
  return _elevenlabs
}

// Export a proxy that creates client on first access
export const elevenlabs = new Proxy({} as any, {
  get(_target, prop) {
    const client = getElevenLabsClient()
    return client[prop]
  },
})

// Helper function to check if a voice exists
export const checkVoiceExists = async (voiceId: string): Promise<boolean> => {
  try {
    return await getElevenLabsClient().voiceExists(voiceId)
  } catch (error) {
    console.error('[ElevenLabs] Error in checkVoiceExists:', error)
    return false
  }
}

// Authoritative existence check for DESTRUCTIVE callers (validateAndCleanVoiceId
// clears the user's saved voice pointer on "absent"). checkVoiceExists returns
// false on every non-authoritative outcome too -- no key (mock client), an
// invalid key (401), a rate-limit/5xx, or a malformed response -- so using it to
// drive a DB clear wipes valid pointers for all users during a key gap/outage.
// This variant returns false ONLY when a successful voice list omits the id, and
// THROWS on any non-authoritative outcome. A thrown error means "could not
// determine -- do not clear".
export const assertVoiceExistsAuthoritative = async (
  voiceId: string
): Promise<boolean> => {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error(
      'ELEVENLABS_API_KEY not loaded; voice existence is not authoritative'
    )
  }
  // The mock client (used on client-creation error) has no `voices`, so this
  // throws; a real client with a bad key rejects getAll() with 401 -- both are
  // correctly treated as non-authoritative by the caller.
  const voicesResponse = await getElevenLabsClient().voices.getAll()
  const voicesList = voicesResponse?.voices || voicesResponse || []
  if (!Array.isArray(voicesList)) {
    throw new Error(
      'ElevenLabs voices response is not an array; not authoritative'
    )
  }
  return voicesList.some(
    (voice: { voice_id?: string; id?: string }) =>
      (voice.voice_id || voice.id) === voiceId
  )
}
