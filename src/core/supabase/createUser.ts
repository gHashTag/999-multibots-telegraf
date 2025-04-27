import { CreateUserData, MyContext } from '@/interfaces'
import { User } from '@/interfaces/user.interface'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

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

  // 1. Попытка найти существующего пользователя
  const { data: existingUser, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .maybeSingle() // Используем maybeSingle, чтобы не было ошибки, если пользователь не найден

  if (findError) {
    logger.error({
      message: 'Ошибка при поиске пользователя',
      telegramId: telegram_id,
      error: findError.message,
      function: 'createUser',
    })
    return [false, null] // Не удалось найти, возвращаем ошибку
  }

  if (existingUser) {
    logger.info({
      message: 'Пользователь найден',
      telegramId: telegram_id,
      userId: existingUser.id,
      function: 'createUser',
    })
    // Опционально: можно добавить логику обновления данных пользователя, если они изменились
    // Например, если изменился username, first_name, last_name, language_code
    const updates: Partial<CreateUserData> = {}
    if (username && existingUser.username !== username)
      updates.username = username
    if (first_name && existingUser.first_name !== first_name)
      updates.first_name = first_name
    if (last_name && existingUser.last_name !== last_name)
      updates.last_name = last_name
    if (language_code && existingUser.language_code !== language_code)
      updates.language_code = language_code

    if (Object.keys(updates).length > 0) {
      logger.info({
        message:
          'Обнаружены изменения в данных пользователя, попытка обновления',
        telegramId: telegram_id,
        userId: existingUser.id,
        updates,
        function: 'createUser',
      })
      const { error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('telegram_id', telegram_id)

      if (updateError) {
        logger.error({
          message: 'Ошибка при обновлении данных существующего пользователя',
          telegramId: telegram_id,
          userId: existingUser.id,
          error: updateError.message,
          function: 'createUser',
        })
        // Не критично, возвращаем найденного пользователя
      } else {
        logger.info({
          message: 'Данные существующего пользователя успешно обновлены',
          telegramId: telegram_id,
          userId: existingUser.id,
          function: 'createUser',
        })
        // Обновим existingUser новыми данными для возврата
        Object.assign(existingUser, updates)
      }
    }

    return [false, existingUser] // Пользователь уже существовал
  }

  // 2. Пользователь не найден, пытаемся создать нового
  logger.info({
    message: 'Пользователь не найден, попытка создания нового',
    telegramId: telegram_id,
    username: finalUsername,
    inviter,
    function: 'createUser',
  })

  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert(userData) // Используем insert вместо upsert
    .select('*') // Запрашиваем все поля созданного пользователя
    .single() // Ожидаем одну запись

  if (createError) {
    // Обработка возможной гонки условий: если кто-то создал пользователя между find и insert
    if (createError.code === '23505') {
      // Код ошибки уникальности
      logger.warn({
        message:
          'Конфликт при создании (23505), пользователь мог быть создан параллельно. Повторный поиск.',
        telegramId: telegram_id,
        function: 'createUser',
      })
      // Повторно ищем пользователя
      const { data: raceUser, error: raceFindError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id)
        .single()

      if (raceFindError || !raceUser) {
        logger.error({
          message: 'Ошибка при повторном поиске после конфликта 23505',
          telegramId: telegram_id,
          error:
            raceFindError?.message || 'Пользователь не найден после конфликта',
          function: 'createUser',
        })
        return [false, null]
      }
      logger.info({
        message:
          'Пользователь найден при повторном поиске после конфликта 23505',
        telegramId: telegram_id,
        userId: raceUser.id,
        function: 'createUser',
      })
      return [false, raceUser] // Пользователь уже существовал (создан другим процессом)
    } else {
      // Другая ошибка при создании
      logger.error({
        message: 'Ошибка при создании нового пользователя',
        telegramId: telegram_id,
        error: createError.message,
        details: createError.details,
        hint: createError.hint,
        code: createError.code,
        function: 'createUser',
      })
      return [false, null] // Не удалось создать
    }
  }

  // 3. Пользователь успешно создан
  if (newUser) {
    logger.info({
      message: 'Пользователь успешно создан',
      telegramId: telegram_id,
      username: finalUsername,
      userId: newUser.id,
      function: 'createUser',
    })
    return [true, newUser] // Пользователь был создан
  } else {
    // Неожиданный случай: insert прошел без ошибки, но не вернул данные
    logger.error({
      message:
        'Insert пользователя прошел без ошибки, но не вернул данные. Критическая ошибка.',
      telegramId: telegram_id,
      function: 'createUser',
    })
    // В этой ситуации сложно определить статус, возвращаем ошибку
    return [false, null]
  }
}
