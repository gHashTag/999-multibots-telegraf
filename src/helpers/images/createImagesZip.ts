import { createWriteStream } from 'fs'
import path from 'path'
import archiver from 'archiver'
import * as fs from 'fs/promises'
import { BufferType } from '../../interfaces'
import { logger } from '@/utils/logger'

export async function createImagesZip(images: BufferType): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp')
  const timestamp = Date.now()
  const zipPath = path.join(tmpDir, `training_images_${timestamp}.zip`)

  try {
    await fs.mkdir(tmpDir, { recursive: true })

    logger.info({
      message: '📦 Подготовка к архивации изображений',
      description: 'Preparing to archive images',
      count: images.length,
    })

    const output = createWriteStream(zipPath)
    const archive: archiver.Archiver = archiver('zip', { zlib: { level: 9 } })

    archive.pipe(output)

    for (const image of images) {
      logger.info({
        message: '➕ Добавление изображения в архив',
        description: 'Adding image to archive',
        filename: image.filename,
      })
      archive.append(image.buffer, { name: image.filename })
    }

    await archive.finalize()

    return new Promise<string>((resolve, reject) => {
      output.on('close', async () => {
        try {
          const stats = await fs.stat(zipPath)
          if (stats.size === 0) {
            logger.error({
              message: '❌ Архив пустой',
              description: 'Archive is empty',
              path: zipPath,
            })
            reject(new Error('Archive is empty'))
          } else {
            logger.info({
              message: '✅ Архив успешно создан',
              description: 'Archive created successfully',
              size: stats.size,
              path: zipPath,
            })
            resolve(zipPath)
          }
        } catch (error) {
          logger.error({
            message: '❌ Ошибка при проверке архива',
            description: 'Error checking archive',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          reject(error)
        }
      })

      output.on('error', error => {
        logger.error({
          message: '❌ Ошибка при создании ZIP архива',
          description: 'Error creating ZIP archive',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        reject(error)
      })
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при создании ZIP архива',
      description: 'Error creating ZIP archive',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}
