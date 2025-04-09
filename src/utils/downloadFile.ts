import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { logger } from './logger'

export async function downloadFile(url: string): Promise<string | null> {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000,
    })

    const uploadDir = path.join(process.cwd(), 'uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const fileName = `voice_${Date.now()}.ogg`
    const filePath = path.join(uploadDir, fileName)

    fs.writeFileSync(filePath, response.data)

    logger.info('✅ Файл скачан:', {
      description: 'File downloaded',
      url,
      filePath,
    })

    return filePath
  } catch (error) {
    logger.error('❌ Ошибка при скачивании файла:', {
      description: 'Error downloading file',
      error: error instanceof Error ? error.message : String(error),
      url,
    })
    return null
  }
}
