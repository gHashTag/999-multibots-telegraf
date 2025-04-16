import axios, { AxiosResponse } from 'axios'
import FormData from 'form-data'
import { isDev, SECRET_API_KEY, ELESTIO_URL, LOCAL_SERVER_URL } from '@/config'
import fs from 'fs'
import path from 'path'
import { ensureDirectoryExistence } from '@/helpers'
import { TelegramId } from '@/interfaces/telegram.interface'
import { generateLipSync as PlanBGenerateLipSync } from './plan_b/generateLipSync'

interface LipSyncResponse {
  message: string
  resultUrl?: string
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
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

// TODO: добавить тесты (unit/integration) и строгую типизацию после ручной проверки
export async function generateLipSync(
  videoUrl: string,
  audioUrl: string,
  telegram_id: TelegramId,
  botName: string,
  is_ru: boolean = true
): Promise<any> { // временно any для ручной проверки
  try {
    // Вызов Direct-версии (Plan B)
    return await PlanBGenerateLipSync(
      telegram_id.toString(),
      videoUrl,
      audioUrl,
      is_ru
    )
  } catch (error) {
    throw error
  }
}
