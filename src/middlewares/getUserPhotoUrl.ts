import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { mirrorToOwnStorage } from '@/core/supabase/mirrorToStorage'
import { telegramFileApiFor } from '@/services/telegramApi'

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
        logger.warn(
          '[getUserPhotoUrl] Photo size exceeds limit, trying smaller',
          {
            userId,
            fileSize: photo.file_size,
            maxSize: MAX_FILE_SIZE,
            index: i,
          }
        )
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
        console.log(
          'No file_path in response for file_id:',
          selectedPhoto.file_id
        )
        return null
      }

      // ССЫЛКА СОДЕРЖИТ ТОКЕН БОТА — НАРУЖУ ЕЁ ОТДАВАТЬ НЕЛЬЗЯ.
      //
      // Адрес файла у Telegram имеет вид
      //   https://api.telegram.org/file/bot<ТОКЕН>/<путь>  telegram-api-root-ok  cyrillic-ok
      // и раньше он возвращался как есть, после чего попадал в
      // `users.photo_url`. Проверено на живой базе: **264 строки содержат
      // 14 разных токенов ботов**, и шесть из них на момент проверки были
      // ДЕЙСТВУЮЩИМИ. Токен даёт полное управление ботом.
      //
      // Вдобавок такая ссылка живёт около часа — то есть хранилась мёртвой
      // почти сразу после записи.
      //
      // Перекладываем файл к себе и отдаём СВОЙ адрес: он и без секрета, и
      // не протухает. Если переложить не удалось, mirrorToOwnStorage вернёт
      // исходную ссылку — тогда её нельзя сохранять, и вызывающий получает
      // null вместо адреса с токеном.
      const telegramUrl = `${telegramFileApiFor(ctx.telegram.token)}/${file.file_path}`
      const mirrored = await mirrorToOwnStorage(telegramUrl, userId, 'avatars')
      if (mirrored === telegramUrl) {
        logger.warn(
          '[getUserPhotoUrl] Не удалось переложить фото — адрес с токеном не отдаём',
          {
            userId,
          }
        )
        return null
      }
      return mirrored
    } catch (getFileError: any) {
      // Если ошибка "file is too big", пробуем меньший размер
      if (
        getFileError?.message?.includes('file is too big') ||
        getFileError?.response?.description?.includes('file is too big')
      ) {
        logger.warn(
          '[getUserPhotoUrl] File too big error, trying smaller sizes',
          {
            userId,
            error: getFileError.message,
          }
        )

        // Пробуем все размеры от маленького к большому
        for (let i = 0; i < photoSizes.length - 1; i++) {
          try {
            const smallerPhoto = photoSizes[i]
            const file = await ctx.telegram.getFile(smallerPhoto.file_id)

            if (file.file_path) {
              // Тот же запрет: адрес с токеном наружу не уходит.
              const telegramUrl = `${telegramFileApiFor(ctx.telegram.token)}/${file.file_path}`
              const photoUrl = await mirrorToOwnStorage(
                telegramUrl,
                userId,
                'avatars'
              )
              if (photoUrl === telegramUrl) {
                logger.warn(
                  '[getUserPhotoUrl] Не удалось переложить фото (меньший размер)',
                  { userId }
                )
                continue
              }
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
