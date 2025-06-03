import path from 'path'
import os from 'os'
import fs, { createWriteStream } from 'fs'
import { elevenlabs } from '.'

// Import supabase to clear invalid voice IDs
import { supabase } from '@/core/supabase'

// Custom error class for voice not found
export class VoiceNotFoundError extends Error {
  constructor(voiceId: string) {
    super(
      `Voice ID '${voiceId}' not found. The voice may have been deleted or doesn't exist.`
    )
    this.name = 'VoiceNotFoundError'
  }
}

export const createAudioFileFromText = async ({
  text,
  voice_id,
  telegram_id,
}: {
  text: string
  voice_id: string
  telegram_id?: string
}): Promise<string> => {
  // Логируем входные данные
  console.log('[TTS_BOT] Attempting to create audio with:', {
    voice_id,
    textLength: text.length,
    apiKeyPresent: !!process.env.ELEVENLABS_API_KEY,
    apiKeyPrefix: process.env.ELEVENLABS_API_KEY?.substring(0, 5),
  })

  // Проверяем наличие API ключа
  if (!process.env.ELEVENLABS_API_KEY) {
    console.warn(
      '[TTS_BOT] ELEVENLABS_API_KEY отсутствует, будет использован mock'
    )
  }

  try {
    // Логируем попытку генерации
    console.log('Generating audio stream using new method...')

    const requestPayload = {
      voice: voice_id,
      text: text,
      model_id: 'eleven_turbo_v2_5',
    }
    console.log(
      '[TTS_BOT] Request Payload to elevenlabs.generate:',
      requestPayload
    )

    // Используем метод .generate() и ожидаем Node.js ReadableStream
    const audioStream = await elevenlabs.generate(requestPayload)

    console.log(
      '[TTS_BOT] Received audioStream object from elevenlabs.generate. Type:',
      typeof audioStream
    )
    // console.log(audioStream); // Для детального изучения структуры, если понадобится

    const outputPath = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)

    return new Promise<string>((resolve, reject) => {
      ;(async () => {
        try {
          const chunks: Buffer[] = []
          // @ts-ignore (Если audioStream не типизирован как AsyncIterable<Uint8Array | Buffer>)
          for await (const chunk of audioStream) {
            chunks.push(
              Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
            )
          }
          console.log(`[TTS_BOT] Collected ${chunks.length} chunks.`)
          const completeBuffer = Buffer.concat(chunks)
          console.log(
            '[TTS_BOT] Audio stream concatenated. Total size:',
            completeBuffer.length
          )

          fs.writeFile(outputPath, completeBuffer, err => {
            if (err) {
              console.error('[TTS_BOT] Error writing audio file manually:', err)
              reject(err)
            } else {
              console.log(
                '[TTS_BOT] Audio file written successfully manually to:',
                outputPath
              )
              resolve(outputPath)
            }
          })
        } catch (streamError) {
          console.error('[TTS_BOT] Error processing audio stream:', streamError)
          reject(streamError)
        }
      })()
    })
  } catch (error: any) {
    console.error(
      '[TTS_BOT] Error in createAudioFileFromText (manual stream processing):',
      {
        message: error.message,
        statusCode: error.statusCode,
        stack: error.stack,
      }
    )

    // Check if it's a 404 error specifically for voice not found
    if (error.statusCode === 404 || error.status === 404) {
      console.error(
        `[TTS_BOT] Voice ID ${voice_id} not found (404). Voice may have been deleted.`
      )

      // Clear the invalid voice ID from database if telegram_id is provided
      if (telegram_id) {
        try {
          await supabase
            .from('users')
            .update({ voice_id_elevenlabs: null })
            .eq('telegram_id', telegram_id)
          console.log(
            `[TTS_BOT] Cleared invalid voice ID ${voice_id} for user ${telegram_id}`
          )
        } catch (dbError) {
          console.error(
            '[TTS_BOT] Error clearing invalid voice ID from database:',
            dbError
          )
        }
      }

      throw new VoiceNotFoundError(voice_id)
    }

    throw new Error(
      `[TTS_BOT] Failed to generate audio (manual stream processing): ${error.message || 'Unknown error'}`
    )
  }
}
