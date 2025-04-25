import AdmZip from 'adm-zip'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { BufferType } from '@/interfaces/telegram-bot.interface'

/**
 * Создает ZIP-архив из буферов изображений
 *
 * @param {BufferType} images - Массив объектов с буферами изображений и именами файлов
 * @returns {Buffer} - Буфер с данными ZIP-архива
 */
export const createImagesZip = (images: BufferType): Buffer => {
  try {
    // Создаем новый ZIP-архив
    const zip = new AdmZip()

    // Добавляем каждое изображение в архив
    for (const item of images) {
      zip.addFile(item.filename, item.buffer)
    }

    // Генерируем уникальное имя для метаданных
    const metadataId = uuidv4()

    // Создаем метаданные (можно расширить при необходимости)
    const metadata = {
      id: metadataId,
      createdAt: new Date().toISOString(),
      imageCount: images.length,
      filenames: images.map((img) => img.filename),
    }

    // Добавляем метаданные в архив
    zip.addFile(
      'metadata.json',
      Buffer.from(JSON.stringify(metadata, null, 2))
    )

    // Возвращаем буфер с ZIP-архивом
    return zip.toBuffer()
  } catch (error) {
    logger.error('❌ Ошибка при создании ZIP-архива:', {
      description: 'Error creating ZIP archive',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
    })
    throw new Error('Failed to create images ZIP archive')
  }
}
