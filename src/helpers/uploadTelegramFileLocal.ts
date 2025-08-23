import axios from 'axios'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

/**
 * 🕉️ Локальное решение для временного хостинга файлов из Telegram
 * Скачивает файлы из Telegram и сохраняет их локально для доступа по HTTP
 *
 * @param telegramUrl - URL файла из Telegram API
 * @param fileName - имя файла (опционально)
 * @returns публичный URL файла на локальном сервере
 */
export async function uploadTelegramFileLocal(
  telegramUrl: string,
  fileName?: string
): Promise<string> {
  try {
    console.log(
      '🔗 [uploadLocal] Downloading from Telegram:',
      telegramUrl.substring(0, 100) + '...'
    )

    // Скачиваем файл из Telegram
    const response = await axios.get(telegramUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: status => status === 200,
    })

    if (!response.data) {
      throw new Error('Empty response data from Telegram')
    }

    // Создаем уникальное имя файла
    const timestamp = Date.now()
    const hash = crypto.randomBytes(8).toString('hex')
    const extension = getFileExtensionFromUrl(telegramUrl)
    const uniqueFileName = `${timestamp}_${hash}.${extension}`

    // Путь для сохранения в директорию public/temp
    const tempDir = path.join(process.cwd(), 'public', 'temp')
    await ensureDirectoryExists(tempDir)

    const filePath = path.join(tempDir, uniqueFileName)

    // Сохраняем файл локально
    await fs.writeFile(filePath, response.data)

    // Получаем публичный URL для Replicate API
    // В development используем ngrok туннель, в production - внешний сервер
    const API_URL =
      process.env.NODE_ENV === 'development'
        ? 'https://44ed576f17a7.ngrok.app' // Ngrok туннель для локального development
        : process.env.API_SERVER_URL ||
          'https://ai-server-u14194.vm.elestio.app'

    console.log(
      '🌐 [uploadLocal] Using public URL for Replicate access:',
      API_URL
    )
    console.log('🔧 [uploadLocal] Environment mode:', process.env.NODE_ENV)

    const publicUrl = `${API_URL}/temp/${uniqueFileName}`

    console.log('✅ [uploadLocal] File saved locally:', {
      localPath: filePath,
      publicUrl: publicUrl,
      size: response.data.length,
    })

    // Планируем удаление файла через 2 часа (достаточно для LipSync)
    setTimeout(async () => {
      try {
        await fs.unlink(filePath)
        console.log('🗑️ [uploadLocal] Temporary file cleaned up:', filePath)
      } catch (error) {
        console.error('⚠️ [uploadLocal] Failed to cleanup file:', error)
      }
    }, 2 * 60 * 60 * 1000) // 2 часа в миллисекундах

    return publicUrl
  } catch (error) {
    console.error('💥 [uploadLocal] Failed to save file locally:', error)
    throw new Error(
      `Failed to upload file locally: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}

/**
 * 🎯 Определяет расширение файла из URL
 */
function getFileExtensionFromUrl(url: string): string {
  try {
    const urlPath = new URL(url).pathname
    const extension = urlPath.split('.').pop()
    return extension || 'bin'
  } catch {
    return 'bin'
  }
}

/**
 * 📁 Создает директорию если она не существует
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath)
  } catch {
    await fs.mkdir(dirPath, { recursive: true })
    console.log('📁 [uploadLocal] Created directory:', dirPath)
  }
}

/**
 * 🏷️ Генерирует имя файла для LipSync
 */
export function generateLocalFileName(
  telegramId: string,
  type: 'image' | 'audio' | 'video',
  url: string
): string {
  const extension = getFileExtensionFromUrl(url)
  const timestamp = Date.now()
  const hash = crypto.randomBytes(4).toString('hex')
  return `lipsync_${type}_${telegramId}_${timestamp}_${hash}.${extension}`
}
