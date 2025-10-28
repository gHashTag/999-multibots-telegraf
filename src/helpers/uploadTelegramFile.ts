import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'
import axios from 'axios'

/**
 * 🕉️ Загружает файл из Telegram в Supabase Storage и возвращает публичный URL
 *
 * @param telegramUrl - URL файла из Telegram API
 * @param bucket - название bucket в Supabase Storage
 * @param fileName - имя файла для сохранения
 * @param contentType - MIME тип файла
 * @returns публичный URL файла в Supabase Storage
 */
export async function uploadTelegramFileToSupabase(
  telegramUrl: string,
  bucket: string,
  fileName: string,
  contentType: string
): Promise<string> {
  try {
    logger.debug(
      '🔗 [uploadTelegramFile] Downloading from Telegram:',
      telegramUrl.substring(0, 100) + '...'
    )

    // Скачиваем файл из Telegram
    const response = await axios.get(telegramUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 секунд для больших файлов
      maxRedirects: 5,
      validateStatus: status => status === 200,
    })

    if (!response.data) {
      throw new Error('Empty response data from Telegram')
    }

    const buffer = Buffer.from(response.data)
    logger.debug(
      '📊 [uploadTelegramFile] Downloaded file size:',
      buffer.length,
      'bytes'
    )

    // Загружаем в Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, buffer, {
        contentType,
        upsert: true, // Перезаписываем если файл уже существует
      })

    if (error) {
      logger.error('❌ [uploadTelegramFile] Supabase upload error:', error)
      throw new Error(`Failed to upload to Supabase: ${error.message}`)
    }

    // Получаем публичный URL
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName)

    logger.debug(
      '✅ [uploadTelegramFile] File uploaded successfully:',
      publicUrlData.publicUrl
    )
    return publicUrlData.publicUrl
  } catch (error) {
    logger.error('💥 [uploadTelegramFile] Upload failed:', error)
    throw new Error(
      `Failed to upload file from Telegram: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}

/**
 * Генерирует уникальное имя файла для LipSync
 */
export function generateLipSyncFileName(
  telegramId: string,
  type: 'image' | 'audio',
  extension: string
): string {
  const timestamp = Date.now()
  return `lipsync/${telegramId}/${type}_${timestamp}.${extension}`
}
