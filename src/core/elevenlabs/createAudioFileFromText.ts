import path from 'path'
import os from 'os'
import { createWriteStream } from 'fs'
import { elevenlabs } from '.'

export const createAudioFileFromText = async ({
  text,
  voice_id,
}: {
  text: string
  voice_id: string
}): Promise<string> => {
  // Логируем входные данные
  console.log('Attempting to create audio with:', {
    voice_id,
    textLength: text.length,
    apiKeyPresent: !!process.env.ELEVENLABS_API_KEY,
    apiKeyPrefix: process.env.ELEVENLABS_API_KEY?.substring(0, 5),
  })

  // Проверяем наличие API ключа
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY отсутствует')
  }

  try {
    // Логируем попытку генерации
    console.log('Generating audio stream...')

    const audioStream = await elevenlabs.generate({
      voice: voice_id,
      model_id: 'eleven_turbo_v2_5',
      text,
    })

    // Логируем успешную генерацию
    console.log('Audio stream generated successfully')

    const outputPath = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
    const writeStream = createWriteStream(outputPath)

    return await new Promise<string>((resolve, reject) => {
      audioStream.pipe(writeStream)

      writeStream.on('finish', () => {
        console.log('Audio file written successfully to:', outputPath)
        resolve(outputPath)
      })

      writeStream.on('error', error => {
        console.error('Error writing audio file:', error)
        reject(error)
      })
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Error in createAudioFileFromText:', {
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack,
    })
    throw error
  }
}
