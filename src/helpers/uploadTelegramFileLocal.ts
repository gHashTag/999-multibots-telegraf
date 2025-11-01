import axios from 'axios'
import { logger } from '@/utils/enhancedLogger'
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
    logger.debug(
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

    // ✅ ИСПРАВЛЕНО: Используем локальный сервер для всех окружений
    // Не используем SERVER_API_URL чтобы избежать зависимости от внешнего сервера
    const API_URL =
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000' // Локальный development
        : 'https://three-head-dragon.shop' // Только наш домен в production

    logger.debug(
      '🌐 [uploadLocal] Using public URL for Replicate access:',
      API_URL
    )
    logger.debug('🔧 [uploadLocal] Environment mode:', process.env.NODE_ENV)

    const publicUrl = `${API_URL}/temp/${uniqueFileName}`

    logger.debug('✅ [uploadLocal] File saved locally:', {
      localPath: filePath,
      publicUrl: publicUrl,
      size: response.data.length,
    })

    // Планируем удаление файла через 2 часа (достаточно для LipSync)
    setTimeout(async () => {
      try {
        await fs.unlink(filePath)
        logger.debug('🗑️ [uploadLocal] Temporary file cleaned up:', filePath)
      } catch (error) {
        logger.error('⚠️ [uploadLocal] Failed to cleanup file:', error)
      }
    }, 2 * 60 * 60 * 1000) // 2 часа в миллисекундах

    return publicUrl
  } catch (error) {
    logger.error('💥 [uploadLocal] Failed to save file locally:', error)
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
    logger.debug('📁 [uploadLocal] Created directory:', dirPath)
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
