import { MyContext } from '@/interfaces'
import { logger } from '@/utils/enhancedLogger'

export async function getUserPhotoUrl(
  ctx: MyContext,
  userId: number
): Promise<string | null> {
  try {
    // Получаем массив фотографий профиля
    const userPhotos = await ctx.telegram.getUserProfilePhotos(userId)

    // Проверяем есть ли фотографии
    if (userPhotos.total_count === 0) {
      logger.debug('No photos found')
      return null
    }

    // Получаем файл самого большого размера фото
    const photoSizes = userPhotos.photos[0]
    const largestPhoto = photoSizes[photoSizes.length - 1]

    const file = await ctx.telegram.getFile(largestPhoto.file_id)

    if (!file.file_path) {
      logger.debug('No file_path in response')
      return null
    }

    // Формируем URL фотографии
    const photoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`
    logger.debug('Generated photo URL:', photoUrl)

    return photoUrl
  } catch (error) {
    logger.error('Error getting user profile photo:', error)
    throw error
  }
}
