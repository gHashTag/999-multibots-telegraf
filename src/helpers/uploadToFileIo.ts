import axios from 'axios'
import FormData from 'form-data'

/**
 * 🕉️ Загружает файл из Telegram в pomf.lain.la (бесплатный хостинг)
 * Файлы хранятся постоянно (до 1GB размер), идеально для LipSync
 *
 * @param telegramUrl - URL файла из Telegram API
 * @param fileName - имя файла (опционально, для логирования)
 * @returns публичный URL файла в pomf.lain.la
 */
export async function uploadTelegramFileToFileIo(
  telegramUrl: string,
  fileName?: string
): Promise<string> {
  try {
    console.log(
      '🔗 [uploadToFileIo] Downloading from Telegram:',
      telegramUrl.substring(0, 100) + '...'
    )

    // Скачиваем файл из Telegram
    const response = await axios.get(telegramUrl, {
      responseType: 'stream', // Используем stream для больших файлов
      timeout: 30000, // 30 секунд
      maxRedirects: 5,
      validateStatus: status => status === 200,
    })

    if (!response.data) {
      throw new Error('Empty response data from Telegram')
    }

    console.log(
      '📊 [uploadToFileIo] File downloaded, uploading to pomf.lain.la...'
    )

    // Создаем FormData для загрузки в pomf.lain.la
    const formData = new FormData()
    formData.append('files[]', response.data, fileName || 'lipsync_file')

    // Загружаем в pomf.lain.la (постоянное хранение до 1GB)
    const uploadResponse = await axios.post(
      'https://pomf.lain.la/upload.php',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 60000, // 60 секунд для загрузки
      }
    )

    console.log(
      '📥 [uploadToFileIo] pomf.lain.la response:',
      uploadResponse.data
    )

    if (!uploadResponse.data?.success || !uploadResponse.data?.files?.[0]) {
      throw new Error(
        `Pomf.lain.la upload failed: ${uploadResponse.data?.errorcode || 'Unknown error'}`
      )
    }

    const publicUrl = uploadResponse.data.files[0].url
    console.log('✅ [uploadToFileIo] File uploaded successfully:', {
      url: publicUrl,
      name: uploadResponse.data.files[0].name,
      size: uploadResponse.data.files[0].size,
    })

    return publicUrl
  } catch (error) {
    console.error('💥 [uploadToFileIo] Upload failed:', error)

    // Если pomf.lain.la недоступен, пробуем 0x0.st как fallback
    if (error instanceof Error && error.message.includes('Pomf.lain.la')) {
      console.log('🔄 [uploadToFileIo] Trying fallback: 0x0.st...')
      return uploadTelegramFileToZeroSt(telegramUrl, fileName)
    }

    throw new Error(
      `Failed to upload file to temporary storage: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}

/**
 * 🛡️ Fallback: загрузка в 0x0.st
 */
async function uploadTelegramFileToZeroSt(
  telegramUrl: string,
  fileName?: string
): Promise<string> {
  try {
    console.log('🔄 [0x0.st] Downloading from Telegram...')

    // Скачиваем файл из Telegram
    const response = await axios.get(telegramUrl, {
      responseType: 'stream',
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: status => status === 200,
    })

    console.log('📊 [0x0.st] File downloaded, uploading to 0x0.st...')

    // Создаем FormData для загрузки
    const formData = new FormData()
    formData.append('file', response.data, fileName || 'lipsync_file')

    // Загружаем в 0x0.st
    const uploadResponse = await axios.post('https://0x0.st', formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 60000,
    })

    const publicUrl = uploadResponse.data.trim()

    if (!publicUrl || !publicUrl.startsWith('http')) {
      throw new Error(`Invalid response from 0x0.st: ${publicUrl}`)
    }

    console.log('✅ [0x0.st] Fallback upload successful:', publicUrl)
    return publicUrl
  } catch (error) {
    console.error('💥 [0x0.st] Fallback upload failed:', error)
    throw new Error(
      `Both pomf.lain.la and 0x0.st failed: ${
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
 * 🏷️ Генерирует имя файла для LipSync
 */
export function generateTempFileName(
  telegramId: string,
  type: 'image' | 'audio',
  url: string
): string {
  const extension = getFileExtensionFromUrl(url)
  const timestamp = Date.now()
  return `lipsync_${type}_${telegramId}_${timestamp}.${extension}`
}
