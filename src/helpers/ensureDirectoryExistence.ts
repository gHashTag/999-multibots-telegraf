import fs from 'fs'
import { logger } from '@/utils/enhancedLogger'

export async function ensureDirectoryExistence(filePath: string) {
  logger.debug(`Ensuring directory exists: ${filePath}`) // Лог для проверки пути
  try {
    await fs.promises.mkdir(filePath, { recursive: true })
    logger.debug(`Directory created: ${filePath}`) // Лог для подтверждения создания
  } catch (error) {
    logger.error(`Error creating directory: ${error}`)
    throw error
  }
}
