import axios, { isAxiosError } from 'axios'
import { assertSafePathSegment } from '@/utils/pathSegment'
import { assertPublicRedirect } from '@/utils/sanitize'
import * as fs from 'fs/promises'
import path from 'path'
import { promisify } from 'util'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB - максимальный размер для Telegram

/**
 * Downloads a file from a URL and saves it to a local path.
 * @param url The URL of the file to download.
 * @param localPath The local path to save the file to.
 * @returns A promise that resolves when the file is downloaded.
 */
export async function downloadFile(
  url: string,
  localPath: string
): Promise<void> {
  try {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw new Error(`Invalid URL received: ${url}`)
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5,
      // SSRF: re-check each redirect hop against the private/metadata blocklist
      beforeRedirect: assertPublicRedirect,
      validateStatus: status => status === 200,
    })

    if (!response.data) {
      throw new Error('Empty response data')
    }

    const buffer = Buffer.from(response.data)

    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(
        `File size (${buffer.length} bytes) exceeds Telegram limit of ${MAX_FILE_SIZE} bytes`
      )
    }

    // Приводим к типу Uint8Array, совместимому с ArrayBufferView
    const u8 = new Uint8Array(buffer)
    await fs.writeFile(localPath, u8)
  } catch (error) {
    console.error(`Error downloading file from ${url} to ${localPath}:`, error)
    if (isAxiosError(error)) {
      console.error('Axios error details:', {
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
        },
      })
    }
    throw new Error(
      `Failed to download file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}

/**
 * Extracts the file extension from a URL.
 * @param url The URL to extract the extension from.
 * @returns The file extension or null if not found.
 */
export const getFileExtension = (url: string): string | null => {
  if (!url) return null
  try {
    const parsedUrl = new URL(url)
    const pathname = parsedUrl.pathname
    // Handle cases like /path/to/file.ext?query=string
    const lastPart = pathname.split('/').pop() || ''
    if (lastPart.includes('.')) {
      return lastPart.split('.').pop() || null
    }
    return null
  } catch (error) {
    // Fallback for non-standard URLs or simple strings
    const extensionMatch = url.match(/\.([0-9a-z]+)(?:[?#]|$)/i)
    return extensionMatch ? extensionMatch[1] : null
  }
}

/**
 * Ensures that a directory exists, creating it if necessary.
 * @param filePath The path to the directory.
 */
export async function ensureDirectoryExistence(filePath: string) {
  console.log(`Ensuring directory exists: ${filePath}`) // Лог для проверки пути
  try {
    await fs.mkdir(filePath, { recursive: true })
    console.log(`Directory created: ${filePath}`) // Лог для подтверждения создания
  } catch (error) {
    console.error(`Error creating directory: ${error}`)
    throw error
  }
}

/**
 * Saves a file from a URL to a local directory, creating subdirectories for user and category.
 * @param telegram_id - ID пользователя в Telegram.
 * @param fileUrl - URL файла для скачивания.
 * @param category - Категория файла (например, 'neuro-photo-v2').
 * @param extension - Расширение файла (например, '.jpeg').
 * @returns The local path to the saved file.
 */
export async function saveFileLocally(
  telegram_id: string,
  fileUrl: string,
  category: string,
  extension: string
): Promise<string> {
  assertSafePathSegment(telegram_id, 'telegram_id')
  const fileLocalPath = path.join(
    __dirname,
    '../uploads',
    telegram_id.toString(),
    category,
    `${new Date().toISOString()}${extension}`
  )

  console.log('Saving file to:', fileLocalPath)

  // Создаем директорию, если она не существует
  await ensureDirectoryExistence(path.dirname(fileLocalPath))

  // Скачиваем и сохраняем файл напрямую
  await downloadFile(fileUrl, fileLocalPath)

  return fileLocalPath
}

/**
 * Deletes a file from the local filesystem.
 * @param filePath The path to the file to delete.
 */
export async function deleteFile(filePath: string) {
  try {
    console.log('filePath', filePath)
    await fs.unlink(filePath)
    console.log(`File ${filePath} deleted successfully`)
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error)
  }
}
