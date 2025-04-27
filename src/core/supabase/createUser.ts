import { type CreateUserData, type MyContext } from '@/interfaces'
import type { User } from '@/interfaces/user.interface'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserData } from './getUserData'

/**
 * Находит или создает пользователя.
 * Возвращает [true, user], если пользователь был только что создан.
 * Возвращает [false, user], если пользователь уже существовал.
 * @param userData Данные для создания/поиска.
 * @param ctx Контекст Telegraf.
 * @returns Промис, разрешающийся в кортеж [wasCreated: boolean, user: User | null].
 */
export const createUser = async (
  userData: CreateUserData,
  ctx: MyContext // ctx пока не используется, но оставлен для будущей совместимости
): Promise<[boolean, User | null]> => {
  const {
    telegram_id,
    username,
    inviter,
    first_name,
    last_name,
    language_code,
  } = userData // Добавляем остальные поля
  const finalUsername = username || telegram_id.toString()

  logger.info({
    message: 'Попытка найти или создать пользователя',
    telegramId: telegram_id,
    username: finalUsername,
    function: 'createUser',
  })

  try {
    // 1. Check if user exists
    logger.info('🔍 Поиск существующего пользователя...', {
      function: 'createUser',
      telegramId: userData.telegram_id,
    })
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', userData.telegram_id)
      .maybeSingle()

    if (findError) {
      logger.error('❌ Ошибка при поиске пользователя (outer catch):', {
        function: 'createUser',
        telegramId: userData.telegram_id,
        error: findError,
        code: (findError as any).code,
        details: (findError as any).details,
        hint: (findError as any).hint,
      })
      return [false, null]
    }

    // 2. User exists - check for updates
    if (existingUser) {
      logger.info(
        '✅ Пользователь найден. Проверка на необходимость обновления.',
        {
          function: 'createUser',
          telegramId: userData.telegram_id,
          existingUserId: existingUser.id,
        }
      )
      const updates: Partial<User> = {}
      if (userData.username && existingUser.username !== userData.username) {
        updates.username = userData.username
      }
      if (
        userData.language_code &&
        existingUser.language_code !== userData.language_code
      ) {
        updates.language_code = userData.language_code
      }
      // Add other fields to check and update if needed

      if (Object.keys(updates).length > 0) {
        logger.info('🔄 Обновление данных пользователя...', {
          function: 'createUser',
          telegramId: userData.telegram_id,
          userId: existingUser.id,
          updates,
        })
        const { error: updateError } = await supabase
          .from('users')
          .update(updates)
          .eq('telegram_id', userData.telegram_id)
        // .select() // Removed select as we return existingUser or updated user data below

        if (updateError) {
          logger.error(
            '❌ Ошибка при обновлении данных пользователя (outer catch):',
            {
              function: 'createUser',
              telegramId: userData.telegram_id,
              userId: existingUser.id,
              updates,
              error: updateError,
              code: (updateError as any).code,
              details: (updateError as any).details,
              hint: (updateError as any).hint,
            }
          )
          // Return the original user data even if update fails
          return [false, existingUser]
        }
        logger.info('✅ Данные пользователя успешно обновлены.', {
          function: 'createUser',
          telegramId: userData.telegram_id,
          userId: existingUser.id,
        })
        // Return the updated user data
        return [false, { ...existingUser, ...updates }]
      } else {
        logger.info(' zmiany не требуются.', {
          //Typo needs fixing here
          function: 'createUser',
          telegramId: userData.telegram_id,
          userId: existingUser.id,
        })
        return [false, existingUser]
      }
    }

    // 3. User does not exist - create new user
    logger.info('✨ Пользователь не найден. Создание нового пользователя...', {
      function: 'createUser',
      telegramId: userData.telegram_id,
      userData,
    })
    try {
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert(userData)
        .select('*')
        .single()

      if (newUser) {
        logger.info('✅ Новый пользователь успешно создан.', {
          function: 'createUser',
          telegramId: userData.telegram_id,
          userId: newUser.id,
        })
        return [true, newUser]
      } else {
        // Handle case where insert succeeded but returned no data (should not happen with .single())
        logger.error(
          '🤷 Вставка пользователя прошла без ошибок, но данные не возвращены.',
          { function: 'createUser', telegramId: userData.telegram_id }
        )
        throw new Error('User insert succeeded but returned no data') // Throw error
      }
    } catch (insertCatchError: any) {
      // Log the error caught during insert
      logger.error(
        '❌ Ошибка при создании нового пользователя (insertCatchError):',
        {
          function: 'createUser',
          telegramId: userData.telegram_id,
          error: insertCatchError.message,
          code: insertCatchError.code,
          details: insertCatchError.details,
          hint: insertCatchError.hint,
        }
      )

      // Handle race condition (duplicate key error code 23505) HERE
      if (insertCatchError.code === '23505') {
        logger.warn(
          '🚦 Конфликт при создании пользователя (23505), пытаемся найти существующего (insertCatchError):',
          {
            function: 'createUser',
            telegramId: userData.telegram_id,
          }
        )
        // Re-attempt to find the user who likely just got created
        try {
          const { data: raceUser, error: raceError } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', userData.telegram_id)
            .single() // Use single here, expecting one user

          if (raceError) {
            logger.error(
              '❌ Ошибка при повторном поиске пользователя после конфликта 23505 (race condition re-find):',
              {
                function: 'createUser',
                telegramId: userData.telegram_id,
                error: raceError,
                code: (raceError as any).code,
                details: (raceError as any).details,
                hint: (raceError as any).hint,
              }
            )
            throw raceError // Re-throw the raceError to be caught by the outer block
          }
          if (raceUser) {
            logger.info('✅ Пользователь найден после конфликта 23505.', {
              function: 'createUser',
              telegramId: userData.telegram_id,
            })
            return [false, raceUser] // Return found user
          } else {
            // Should theoretically not happen if 23505 occurred, but handle defensively
            logger.error(
              '🤷 Пользователь не найден после конфликта 23505, хотя должен был быть создан.',
              { function: 'createUser', telegramId: userData.telegram_id }
            )
            throw new Error('User not found after 23505 conflict') // Throw a new error
          }
        } catch (reFindError) {
          // Catch errors during the re-find itself
          logger.error(
            '❌ Неожиданная ошибка при повторном поиске пользователя после 23505 (re-find catch):',
            {
              function: 'createUser',
              telegramId: userData.telegram_id,
              error:
                reFindError instanceof Error
                  ? reFindError.message
                  : String(reFindError),
            }
          )
          throw reFindError // Re-throw to outer catch
        }
      } else {
        // If it wasn't a 23505 error, re-throw the original insert error
        throw insertCatchError
      }
    }
  } catch (error) {
    // This is the OUTER catch block
    logger.error('❌ Ошибка в функции createUser (outer catch):', {
      function: 'createUser',
      telegramId: userData?.telegram_id,
      error: error instanceof Error ? error.message : String(error), // Log the message from the re-thrown error
      error_details: error,
    })
    return [false, null]
  }
}
