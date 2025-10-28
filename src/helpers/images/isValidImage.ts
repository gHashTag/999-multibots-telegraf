export async function isValidImage(buffer: Buffer): Promise<boolean> {
import { logger } from '@/utils/enhancedLogger'
  try {
    // Проверяем первые байты файла на соответствие сигнатурам изображений
    const header = buffer.slice(0, 4)
    logger.debug('Image header:', header)

    // Проверка на JPEG
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return true
    }

    // Проверка на PNG
    if (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    ) {
      return true
    }

    return false
  } catch (error) {
    logger.error('Error in isValidImage:', error)
    return false
  }
}
