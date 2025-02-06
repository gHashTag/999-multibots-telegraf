import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'

async function downloadVoiceMessage(fileUrl: string, downloadPath: string) {
  const writer = fs.createWriteStream(downloadPath)
  const response = await axios({
    url: fileUrl,
    method: 'GET',
    responseType: 'stream',
  })

  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
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

    const url = 'https://api.elevenlabs.io/v1/voices/add'
    const form = new FormData()
    form.append('name', username)
    form.append('description', 'Voice created from Telegram voice message')
    form.append('files', fs.createReadStream(downloadPath) as unknown as Blob)
    form.append('labels', JSON.stringify({ accent: 'neutral' }))

    const response = await axios.post(url, form, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'xi-api-key': process.env.ELEVENLABS_API_KEY as string,
      },
    })

    if (response.status === 200) {
      const result = response.data as { voice_id: string }
      console.log('Voice created:', result)
      return result.voice_id
    } else {
      console.error(`Error: ${response.status} ${response.statusText}`)
      return null
    }
  } catch (error) {
    console.error('Error creating voice:', error)
    return null
  } finally {
    // Удаляем файл после использования
    fs.unlinkSync(downloadPath)
  }
}
