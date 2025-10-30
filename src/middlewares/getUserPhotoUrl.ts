import { MyContext } from '@/interfaces'

export async function getUserPhotoUrl(
  ctx: MyContext,
  userId: number
): Promise<string | null> {
  try {
    // Проверяем наличие токена бота
    if (!ctx.telegram?.token) {
      console.error('Bot token is not available in context')
      return null
    }

    // Получаем массив фотографий профиля
    const userPhotos = await ctx.telegram.getUserProfilePhotos(userId)

    // Проверяем есть ли фотографии
    if (userPhotos.total_count === 0) {
      console.log('No photos found for user:', userId)
      return null
    }

    // Получаем файл самого большого размера фото
    const photoSizes = userPhotos.photos[0]
    const largestPhoto = photoSizes[photoSizes.length - 1]

    const file = await ctx.telegram.getFile(largestPhoto.file_id)

    if (!file.file_path) {
      console.log('No file_path in response for file_id:', largestPhoto.file_id)
      return null
    }

    // Формируем URL фотографии с правильным токеном
    const photoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`
    console.log('Generated photo URL for user', userId, ':', photoUrl.substring(0, 100) + '...')

    return photoUrl
  } catch (error) {
    console.error('Error getting user profile photo for user', userId, ':', error)
    throw error
  }
}
