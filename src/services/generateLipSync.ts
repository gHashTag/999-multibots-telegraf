import axios from 'axios'
import type { AxiosResponse } from 'axios'
import FormData from 'form-data'
import {
  isDev,
  SECRET_API_KEY,
  API_SERVER_URL,
  LOCAL_SERVER_URL,
} from '@/config'
import fs from 'fs'
import path from 'path'
import { ensureDirectoryExistence } from '@/helpers'
import { sendBalanceMessage } from '@/price/helpers'
import { logger } from '@/utils/logger'

interface LipSyncResponse {
  message: string
  resultUrl?: string
}

export async function downloadFile(
  url: string,
  outputPath: string
): Promise<void> {
  const response = await axios.get(url, { responseType: 'stream' })
  const writer = fs.createWriteStream(outputPath)

  return new Promise((resolve, reject) => {
    response.data.pipe(writer)
    let error: Error | null = null
    writer.on('error', err => {
      error = err
      writer.close()
      reject(err)
    })
    writer.on('close', () => {
      if (!error) {
        resolve()
      }
    })
  })
}

export async function generateLipSync(
  videoUrl: string,
  audioUrl: string,
  telegram_id: string,
  botName: string
): Promise<LipSyncResponse> {
  try {
    const videoPath = path.join(__dirname, '../../tmp', 'temp_video.mp4')
    const audioPath = path.join(__dirname, '../../tmp', 'temp_audio.mp3')
    console.log('videoPath', videoPath)
    console.log('audioPath', audioPath)
    await ensureDirectoryExistence(path.dirname(videoPath))
    await ensureDirectoryExistence(path.dirname(audioPath))
    // Скачиваем видео и аудио файлы
    await downloadFile(videoUrl, videoPath)
    await downloadFile(audioUrl, audioPath)

    console.log('LipSync request data:', { videoUrl, audioUrl, telegram_id })
    const url = `${
      isDev ? LOCAL_SERVER_URL : API_SERVER_URL
    }/generate/create-lip-sync`

    // Создаем FormData для передачи URL видео и аудио
    const formData = new FormData()
    formData.append('type', 'lip-sync')
    formData.append('telegram_id', telegram_id)
    formData.append('is_ru', 'true')
    formData.append('bot_name', botName)
    formData.append('video', fs.createReadStream(videoPath))
    formData.append('audio', fs.createReadStream(audioPath))

    console.log('formData', formData)
    const response: AxiosResponse<LipSyncResponse> = await axios.post(
      url,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-secret-key': SECRET_API_KEY,
          ...formData.getHeaders(),
        },
      }
    )

    console.log('LipSync response:', response.data)
    return response.data as LipSyncResponse
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message)
      throw new Error('Error occurred while generating lip sync')
    }
    console.error('Unexpected error:', error)
    throw error
  }
}
