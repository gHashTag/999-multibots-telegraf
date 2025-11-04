/**
 * ElevenLabs Service Stub
 * Заглушка для функциональности ElevenLabs (генерация речи и транскрибация)
 */

export interface GenerateSpeechRequest {
  text: string
  voice_id: string
  model_id?: string
  output_format?: string
}

export interface TranscriptionResponse {
  id: string
  text: string
  words?: Array<{
    text: string
    start: number
    end: number
  }>
  result?: any
}

export class ElevenLabsService {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    console.log('[ELEVENLABS STUB] Service initialized (stub mode)')
  }

  async generateSpeech(request: GenerateSpeechRequest): Promise<Buffer> {
    console.log('[ELEVENLABS STUB] Generating speech', {
      text_length: request.text.length,
      voice_id: request.voice_id,
      model_id: request.model_id
    })

    // Return stub MP3 buffer (minimal valid MP3 header)
    return Buffer.from([0xFF, 0xFB, 0x90, 0x00])
  }

  async transcribeAudioFromUrl(audioUrl: string): Promise<TranscriptionResponse> {
    console.log(`[ELEVENLABS STUB] Transcribing audio from URL: ${audioUrl}`)

    return {
      id: `transcription_${Date.now()}`,
      text: 'Stub transcription text',
      words: [
        { text: 'Stub', start: 0, end: 0.5 },
        { text: 'transcription', start: 0.5, end: 1.5 },
        { text: 'text', start: 1.5, end: 2.0 }
      ],
      result: {
        words: [
          { text: 'Stub', start: 0, end: 0.5 },
          { text: 'transcription', start: 0.5, end: 1.5 },
          { text: 'text', start: 1.5, end: 2.0 }
        ]
      }
    }
  }
}

/**
 * Generate speech audio from text
 * Exported function for compatibility
 */
export async function generateSpeech(
  request: GenerateSpeechRequest & { output_format?: string },
  apiKey: string,
  userId?: string,
  jobId?: string
): Promise<string> {
  console.log('[ELEVENLABS STUB] generateSpeech function', {
    text_length: request.text.length,
    voice_id: request.voice_id,
    userId,
    jobId
  })

  // Return stub URL
  return `https://stub.elevenlabs.com/audio/${Date.now()}.mp3`
}

/**
 * Transcribe audio from buffer
 * Exported function for compatibility
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  apiKey: string,
  audioUrl: string,
  userId?: string,
  jobId?: string,
  model?: string
): Promise<TranscriptionResponse> {
  console.log('[ELEVENLABS STUB] transcribeAudio function', {
    buffer_size: audioBuffer.length,
    userId,
    jobId,
    model
  })

  return {
    id: `transcription_${Date.now()}`,
    text: 'Stub transcription from buffer',
    words: [
      { text: 'Stub', start: 0, end: 0.5 },
      { text: 'transcription', start: 0.5, end: 1.5 },
      { text: 'from', start: 1.5, end: 2.0 },
      { text: 'buffer', start: 2.0, end: 2.5 }
    ],
    result: {
      words: [
        { text: 'Stub', start: 0, end: 0.5 },
        { text: 'transcription', start: 0.5, end: 1.5 },
        { text: 'from', start: 1.5, end: 2.0 },
        { text: 'buffer', start: 2.0, end: 2.5 }
      ]
    }
  }
}
