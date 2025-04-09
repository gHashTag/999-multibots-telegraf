import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { downloadFile } from '@/helpers/downloadFile'
import { TelegramId } from '@/types/telegram.interface'
const mkdir = promisify(fs.mkdir)
const writeFile = promisify(fs.writeFile)

/**
 * Сохраняет файл на сервере и возвращает локальный путь.
 * @param telegram_id - ID пользователя в Telegram.
 * @param fileUrl - URL файла для скачивания.
 * @param category - Категория файла (например, 'neuro-photo-v2').
 * @param extension - Расширение файла (например, '.jpeg').
 * @returns Локальный путь к сохраненному файлу.
 */
export async function saveFileLocally(
  telegram_id: TelegramId,
  fileUrl: string,
  category: string,
  extension: string
): Promise<string> {
  const fileLocalPath = path.join(
    __dirname,
    '../uploads',
    telegram_id.toString(),
    category,
    `${new Date().toISOString()}${extension}`
  )

  console.log('Saving file to:', fileLocalPath)

  // Создаем директорию, если она не существует
  await mkdir(path.dirname(fileLocalPath), { recursive: true })

  // Скачиваем файл
  const fileBuffer = await downloadFile(fileUrl)

  // Сохраняем файл на сервере
  await writeFile(fileLocalPath, new Uint8Array(fileBuffer))

  return fileLocalPath
}
