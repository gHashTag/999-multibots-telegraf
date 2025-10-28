import { createWriteStream } from 'fs'
import { logger } from '@/utils/enhancedLogger'
import path from 'path'
import archiver from 'archiver'
import * as fs from 'fs/promises'
import { BufferType } from '../../interfaces'

export async function createImagesZip(images: BufferType): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp')
  const timestamp = Date.now()
  const zipPath = path.join(tmpDir, `training_images_${timestamp}.zip`)

  try {
    await fs.mkdir(tmpDir, { recursive: true })

    logger.debug(`Количество изображений для архивации: ${images.length}`)

    const output = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    archive.pipe(output)

    for (const image of images) {
      logger.debug(`Добавление изображения: ${image.filename}`)
      archive.append(image.buffer, { name: image.filename })
    }

    await archive.finalize()

    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        try {
          const stats = await fs.stat(zipPath)
          if (stats.size === 0) {
            logger.error('Архив пустой!')
            reject(new Error('Архив пустой'))
          } else {
            logger.debug(`Архив создан успешно, размер: ${stats.size} байт`)
            resolve(zipPath)
          }
        } catch (error) {
          logger.error('Ошибка при проверке архива:', error)
          reject(error)
        }
      })

      output.on('error', error => {
        logger.error('Ошибка при создании ZIP архива:', error)
        reject(error)
      })
    })
  } catch (error) {
    logger.error('Ошибка при создании ZIP архива:', error)
    throw error
  }
}
