import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'
import FormData from 'form-data'

async function downloadVoiceMessage(fileUrl: string, downloadPath: string): Promise<void> {
  const writer = fs.createWriteStream(downloadPath)
  const response = await axios({
    url: fileUrl,
    method: 'GET',
    responseType: 'stream',
  })

  response.data.pipe(writer)

  return new Promise<void>((resolve, reject) => {
    writer.on('finish', () => resolve())
    writer.on('error', (error) => reject(error))
  })
}

export async function createVoiceElevenLabs({
  fileUrl,
  username,
}: {
  fileUrl: string
  username: string
}): Promise<string | null> {
  const uniqueFileName = `${uuidv4()}.oga`
  const downloadPath = path.join(os.tmpdir(), uniqueFileName)

  try {
    // Скачиваем файл
    await downloadVoiceMessage(fileUrl, downloadPath)
    console.log('📥 Файл голоса скачан:', {
      description: 'Voice file downloaded',
      path: downloadPath,
      size: fs.statSync(downloadPath).size,
    })

    const url = 'https://api.elevenlabs.io/v1/voices/add'

    // Используем FormData из npm вместо глобального FormData
    const form = new FormData()
    form.append('name', username)
    form.append('description', 'Voice created from Telegram voice message')

    // Правильное добавление файла в FormData
    form.append('files', fs.createReadStream(downloadPath))
    form.append('labels', JSON.stringify({ accent: 'neutral' }))

    console.log('📤 Отправка запроса в ElevenLabs:', {
      description: 'Sending request to ElevenLabs',
      url,
      username,
    })

    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        'xi-api-key': process.env.ELEVENLABS_API_KEY as string,
      },
    })

    if (response.status === 200) {
      const result = response.data as { voice_id: string }
      console.log('✅ Голос успешно создан:', {
        description: 'Voice successfully created',
        voiceId: result.voice_id,
      })
      return result.voice_id
    } else {
      console.error('❌ Ошибка от API:', {
        description: 'API Error',
        status: response.status,
        statusText: response.statusText,
      })
      return null
    }
  } catch (error) {
    console.error('🔥 Ошибка при создании голоса:', {
      description: 'Error creating voice',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Получаем больше информации из ответа API при ошибке
    if (axios.isAxiosError(error) && error.response) {
      console.error('📊 Детали ошибки API:', {
        description: 'API error details',
        status: error.response.status,
        data: error.response.data,
      })
    }

    return null
  } finally {
    // Проверяем существование файла перед удалением
    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath)
      console.log('🗑️ Временный файл удален', {
        description: 'Temporary file deleted',
        path: downloadPath,
      })
    }
  }
}
