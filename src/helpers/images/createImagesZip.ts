import { createWriteStream } from 'fs'
import path from 'path'
import archiver from 'archiver'
import * as fs from 'fs/promises'
import { BufferType } from '../../interfaces'
import { API_URL } from '@/config'

export async function createImagesZip(images: BufferType): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp')
  const timestamp = Date.now()
  const zipPath = path.join(tmpDir, `training_images_${timestamp}.zip`)

  try {
    await fs.mkdir(tmpDir, { recursive: true })

    console.log('🎯 Количество изображений для архивации:', images.length)

    const output = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    archive.pipe(output)

    for (const image of images) {
      console.log('📸 Добавление изображения:', image.filename)
      archive.append(image.buffer, { name: image.filename })
    }

    await archive.finalize()

    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        try {
          const stats = await fs.stat(zipPath)
          if (stats.size === 0) {
            console.error('❌ Архив пустой!')
            reject(new Error('Архив пустой'))
            return
          }

          console.log('📦 Архив создан успешно, размер:', stats.size, 'байт')
          console.log('🚀 Загружаю архив на сервер...')

          const formData = new FormData()
          const fileBuffer = await fs.readFile(zipPath)
          formData.append(
            'file',
            new Blob([fileBuffer], { type: 'application/zip' }),
            path.basename(zipPath)
          )

          const uploadUrl = `${API_URL}/uploads`
          console.log('🔗 URL загрузки:', uploadUrl)

          const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error('❌ Ошибка загрузки:', errorText)
            reject(
              new Error(
                `Ошибка загрузки: ${response.status} ${response.statusText}`
              )
            )
            return
          }

          console.log('✅ Архив успешно загружен на сервер')
          resolve(zipPath)
        } catch (error) {
          console.error('❌ Ошибка при обработке архива:', error)
          reject(error)
        }
      })

      output.on('error', error => {
        console.error('❌ Ошибка при создании ZIP архива:', error)
        reject(error)
      })
    })
  } catch (error) {
    console.error('❌ Ошибка при создании ZIP архива:', error)
    throw error
  }
}
