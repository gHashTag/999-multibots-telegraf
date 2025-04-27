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
    console.warn('ELEVENLABS_API_KEY отсутствует, будет использован mock')
  }

  try {
    // Логируем попытку генерации
    console.log('Generating audio stream...')

    // Используем метод generateVoiceSpeech согласно новому интерфейсу
    const audioBuffer = await elevenlabs.generateVoiceSpeech(voice_id, text)

    // Логируем успешную генерацию
    console.log(
      'Audio generated successfully, size:',
      audioBuffer instanceof ArrayBuffer ? audioBuffer.byteLength : 'unknown'
    )

    const outputPath = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)
    const writeStream = createWriteStream(outputPath)

    return await new Promise<string>((resolve, reject) => {
      // Преобразуем ArrayBuffer в Buffer и записываем
      const buffer = Buffer.from(audioBuffer)
      writeStream.write(buffer, error => {
        if (error) {
          console.error('Error writing audio buffer to file:', error)
          reject(error)
          return
        }

        writeStream.end(() => {
          console.log('Audio file written successfully to:', outputPath)
          resolve(outputPath)
        })
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
    // Выбрасываем обработанную ошибку с более информативным сообщением
    throw new Error(
      `Failed to generate audio: ${error.message || 'Unknown error'}`
    )
  }
}
