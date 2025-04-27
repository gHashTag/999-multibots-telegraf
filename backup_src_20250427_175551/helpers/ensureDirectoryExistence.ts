import fs from 'fs'

export async function ensureDirectoryExistence(filePath: string) {
  console.log(`Ensuring directory exists: ${filePath}`) // Лог для проверки пути
  try {
    await fs.promises.mkdir(filePath, { recursive: true })
    console.log(`Directory created: ${filePath}`) // Лог для подтверждения создания
  } catch (error) {
    console.error(`Error creating directory: ${error}`)
    throw error
  }
}
