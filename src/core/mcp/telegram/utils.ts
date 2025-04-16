/**
 * Утилиты для работы с Telegram-ботом
 */

import fs from 'fs'
import path from 'path'

/**
 * Функция для получения последней записи из CG Log
 * @returns Текст последней записи или null, если записей нет
 */
export async function getLatestChangelogEntry(): Promise<string | null> {
  try {
    // Путь к файлу CG Log
    const cgLogPath = path.join(process.cwd(), 'cg-log.md')

    // Проверяем, существует ли файл
    const exists = await fs.promises
      .access(cgLogPath)
      .then(() => true)
      .catch(() => false)

    if (!exists) {
      console.error(`CG Log file does not exist at ${cgLogPath}`)
      return null
    }

    // Читаем содержимое файла
    const content = await fs.promises.readFile(cgLogPath, 'utf-8')

    // Разбиваем на записи (ищем заголовки ## и следующее за ними содержимое)
    const entries = content
      .split(/^## /m)
      .slice(1)
      .map(entry => `## ${entry.trim()}`)

    if (entries.length === 0) {
      return null
    }

    // Возвращаем последнюю запись
    return entries[entries.length - 1]
  } catch (error) {
    console.error('Error getting latest changelog entry:', error)
    return null
  }
}

/**
 * Функция для получения новых записей из CG Log с момента последней проверки
 * @param lastChecked Дата последней проверки
 * @returns Массив новых записей
 */
export async function getNewChangelogEntries(
  lastChecked: Date
): Promise<string[]> {
  try {
    // Путь к файлу CG Log
    const cgLogPath = path.join(process.cwd(), 'cg-log.md')

    // Проверяем, существует ли файл
    const exists = await fs.promises
      .access(cgLogPath)
      .then(() => true)
      .catch(() => false)

    if (!exists) {
      console.error(`CG Log file does not exist at ${cgLogPath}`)
      return []
    }

    // Получаем статистику файла
    const stats = await fs.promises.stat(cgLogPath)

    // Если файл не менялся с последней проверки, возвращаем пустой массив
    if (stats.mtime <= lastChecked) {
      return []
    }

    // Читаем содержимое файла
    const content = await fs.promises.readFile(cgLogPath, 'utf-8')

    // Разбиваем на записи
    const entries = content
      .split(/^## /m)
      .slice(1)
      .map(entry => `## ${entry.trim()}`)

    // Извлекаем даты из записей
    const entriesWithDates = entries.map(entry => {
      // Ищем строку с датой
      const dateMatch = entry.match(/\*\*Дата:\*\* (.*?)(?:\n|$)/)
      const dateString = dateMatch ? dateMatch[1] : null

      // Пытаемся преобразовать в дату
      let date = null
      if (dateString) {
        if (dateString.toLowerCase() === 'current date') {
          // Если "current date", используем время модификации файла
          date = stats.mtime
        } else {
          // Иначе пытаемся преобразовать строку в дату
          date = new Date(dateString)
          if (isNaN(date.getTime())) {
            date = null
          }
        }
      }

      return { entry, date }
    })

    // Фильтруем только новые записи (с датой после последней проверки или без даты)
    const newEntries = entriesWithDates
      .filter(({ date }) => date === null || date > lastChecked)
      .map(({ entry }) => entry)

    return newEntries
  } catch (error) {
    console.error('Error getting new changelog entries:', error)
    return []
  }
}
