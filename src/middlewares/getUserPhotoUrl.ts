import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

// Telegram Bot API limit for getFile
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

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

    // Получаем все размеры первого фото (от маленького к большому)
    const photoSizes = userPhotos.photos[0]

    // Ищем подходящий размер (начинаем с самого большого, но не превышающего лимит)
    // photoSizes отсортированы от маленького к большому
    let selectedPhoto = null

    // Пробуем от большего к меньшему
    for (let i = photoSizes.length - 1; i >= 0; i--) {
      const photo = photoSizes[i]

      // file_size может отсутствовать в метаданных, проверяем если есть
      if (photo.file_size && photo.file_size > MAX_FILE_SIZE) {
        logger.warn('[getUserPhotoUrl] Photo size exceeds limit, trying smaller', {
          userId,
          fileSize: photo.file_size,
          maxSize: MAX_FILE_SIZE,
          index: i,
        })
        continue
      }

      // Выбираем этот размер
      selectedPhoto = photo
      break
    }

    // Если все фото слишком большие, берём самое маленькое
    if (!selectedPhoto) {
      selectedPhoto = photoSizes[0]
      logger.warn('[getUserPhotoUrl] All photos exceed limit, using smallest', {
        userId,
        smallestSize: selectedPhoto.file_size,
      })
    }

    // Пробуем получить файл с обработкой ошибки размера
    try {
      const file = await ctx.telegram.getFile(selectedPhoto.file_id)

      if (!file.file_path) {
        console.log('No file_path in response for file_id:', selectedPhoto.file_id)
        return null
      }

      // Формируем URL фотографии с правильным токеном
      const photoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`
      console.log('Generated photo URL for user', userId, ':', photoUrl.substring(0, 100) + '...')

      return photoUrl
    } catch (getFileError: any) {
      // Если ошибка "file is too big", пробуем меньший размер
      if (getFileError?.message?.includes('file is too big') || getFileError?.response?.description?.includes('file is too big')) {
        logger.warn('[getUserPhotoUrl] File too big error, trying smaller sizes', {
          userId,
          error: getFileError.message,
        })

        // Пробуем все размеры от маленького к большому
        for (let i = 0; i < photoSizes.length - 1; i++) {
          try {
            const smallerPhoto = photoSizes[i]
            const file = await ctx.telegram.getFile(smallerPhoto.file_id)

            if (file.file_path) {
              const photoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`
              logger.info('[getUserPhotoUrl] Successfully got smaller photo', {
                userId,
                index: i,
              })
              return photoUrl
            }
          } catch (smallerError) {
            // Продолжаем пробовать меньшие размеры
            continue
          }
        }

        // Все попытки не удались
        logger.error('[getUserPhotoUrl] All photo sizes failed', { userId })
        return null
      }

      // Другая ошибка - пробрасываем
      throw getFileError
    }
  } catch (error: any) {
    // Не пробрасываем ошибку - возвращаем null для graceful degradation
    logger.error('[getUserPhotoUrl] Error getting user profile photo', {
      userId,
      error: error?.message || 'Unknown error',
    })
    return null
  }
}
