import { openai } from './'
import { createReadStream } from 'fs'
import { logger } from '@/utils/logger'

export async function convertVoiceToText(
  filePath: string
): Promise<string | null> {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: 'whisper-1',
      language: 'ru',
    })

    return transcription.text
  } catch (error) {
    logger.error('Error converting voice to text:', error)
    return null
  }
}
