import * as fs from 'fs'
import { logger } from '@/utils/logger'

export async function deleteFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
      logger.info('Successfully deleted file', { filePath })
    } else {
      logger.info('File does not exist, nothing to delete', { filePath })
    }
  } catch (error) {
    logger.error('Error deleting file', { filePath, error })
  }
}
