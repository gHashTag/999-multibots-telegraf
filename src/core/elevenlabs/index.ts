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

    return new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    })
  } catch (error) {
    console.error(
      'Error creating ElevenLabs client, falling back to mock:',
      error
    )
    return new MockElevenLabsClient({ apiKey: 'mock-key-after-error' })
  }
}

export const elevenlabs = createElevenLabsClient()
