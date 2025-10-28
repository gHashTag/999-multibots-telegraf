import * as fs from 'fs'
import { logger } from '@/utils/enhancedLogger'

export async function deleteFile(filePath: string) {
  try {
    logger.debug('filePath', filePath)
    await fs.promises.unlink(filePath)
    logger.debug(`File ${filePath} deleted successfully`)
  } catch (error) {
    logger.error(`Error deleting file ${filePath}:`, error)
  }
}
