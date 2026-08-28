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
      model_id: request.model_id,
    })

    // Return stub MP3 buffer (minimal valid MP3 header)
    return Buffer.from([0xff, 0xfb, 0x90, 0x00])
  }

  async transcribeAudioFromUrl(
    audioUrl: string
  ): Promise<TranscriptionResponse> {
    // ПАДАЕМ, а не возвращаем выдуманные слова.
    //
    // Раньше отсюда возвращалось "Stub transcription text" с таймингами
    // 0…2.0 с. Эти слова идут в субтитры, то есть на готовом видео появилось
    // бы "STUB TRANSCRIPTION TEXT" — и никто выше по стеку не смог бы отличить
    // это от настоящей расшифровки.
    //
    // Настоящей транскрипции в проекте НЕТ вообще: grep по speech-to-text и
    // api.elevenlabs.io даёт только синтез речи и работу с голосами. Это не
    // «забыли подключить», а незакрытая интеграция.
    throw new Error(
      `transcribeAudioFromUrl: транскрипция не реализована (заглушка src/services/elevenLabs.ts). URL: ${audioUrl}`
    )
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
    jobId,
  })

  // Return stub URL
  // ПАДАЕМ, а не возвращаем выдуманный URL.
  //
  // Раньше здесь отдавался `https://stub.elevenlabs.com/audio/<ts>.mp3` —
  // домен, которого не существует. Пайплайн render-riddle принимал это за
  // успех и шёл дальше: Hedra получала «речь» с несуществующего адреса, а
  // отказ всплывал позже и без причины.
  //
  // Настоящий синтез в проекте ЕСТЬ — src/core/elevenlabs/createAudioFileFromText.ts,
  // он ходит в api.elevenlabs.io/v1/text-to-speech/{voice_id}. Проводка сюда —
  // отдельная работа: у него другая сигнатура и он отдаёт файл, а не URL.
  // До тех пор молчаливая подделка хуже честного отказа.
  throw new Error(
    'generateSpeech: используется заглушка src/services/elevenLabs.ts. ' +
      'Настоящий синтез — src/core/elevenlabs/createAudioFileFromText.ts, он сюда не подключён.'
  )
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
    model,
  })

  // ПАДАЕМ. Это та самая функция, которую зовёт шаг 'generate-transcription'
  // в renderRiddle (steps.ts:1089). Её слова идут прямо в субтитры готового
  // ролика — молчаливая подделка означала бы "STUB TRANSCRIPTION FROM BUFFER"
  // поверх видео, неотличимое выше по стеку от настоящей расшифровки.
  throw new Error(
    'transcribeAudio: транскрипция не реализована (заглушка src/services/elevenLabs.ts). ' +
      'В проекте нет ни одной интеграции speech-to-text — это незакрытая работа, а не забытая проводка.'
  )
}
