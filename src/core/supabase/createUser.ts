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
  userData: CreateUserData
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
      message: 'Ошибка при поиске пользователя в users',
      telegramId: telegram_id,
      error: findError.message,
      function: 'createUser',
    })
    return [false, null] // Не удалось найти, возвращаем ошибку
  }

  if (existingUser) {
    logger.info({
      message: 'Пользователь найден в users',
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

  // === НАЧАЛО УЛУЧШЕННОЙ ЛОГИКИ ===
  // Пользователь НЕ найден в 'users'. Проверим, есть ли он в 'payments_v2'.
  logger.info({
    message: `Пользователь ${telegram_id} не найден в 'users'. Проверяем 'payments_v2' для признаков прошлой активности...`,
    telegramId: telegram_id,
    function: 'createUser_checkPaymentsV2',
  })

  const { data: paymentRecords, error: paymentError } = await supabase
    .from('payments_v2')
    .select('telegram_id') // Достаточно проверить наличие по telegram_id
    .eq('telegram_id', telegram_id)
    .limit(1) // Нам нужна хотя бы одна запись для подтверждения

  if (paymentError) {
    logger.warn({
      // Используем warn, так как это не блокирующая ошибка для создания нового
      message: `Ошибка при проверке 'payments_v2' для ${telegram_id}. Продолжаем как для нового пользователя.`,
      error: paymentError.message,
      function: 'createUser_checkPaymentsV2',
    })
    // Ошибка при доступе к payments_v2, продолжаем с обычной логикой создания нового пользователя
  } else if (paymentRecords && paymentRecords.length > 0) {
    // Пользователь найден в 'payments_v2'! Это означает, что он существовал ранее.
    // Создаем его в 'users' как "восстановленного".
    logger.info({
      message: `Обнаружены записи в 'payments_v2' для ${telegram_id}. Пользователь существовал ранее. Создаем запись в 'users'.`,
      telegramId: telegram_id,
      function: 'createUser_recoverFromPaymentsV2',
    })
    // Переходим к логике создания нового пользователя НИЖЕ, но с этим знанием.
  } else {
    // Записей в 'payments_v2' не найдено. Это действительно новый пользователь.
    logger.info({
      message: `Записей в 'payments_v2' для ${telegram_id} не найдено. Это новый пользователь.`,
      telegramId: telegram_id,
      function: 'createUser_checkPaymentsV2',
    })
  }
  // === КОНЕЦ УЛУЧШЕННОЙ ЛОГИКИ ===

  // 2. Пользователь не найден в 'users' (или не требовал "восстановления" специфического UUID),
  //    пытаемся создать нового в 'users'.
  //    Если он был в payments_v2, это просто означает, что мы создаем для него запись в users,
  //    используя предоставленные userData.
  logger.info({
    message: `Попытка создания новой записи в 'users' для ${telegram_id}`,
    telegramId: telegram_id,
    username: finalUsername,
    inviter,
    function: 'createUser_insertNew',
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

      if (raceUser) {
        // Найден по telegram_id при повторном поиске
        logger.info({
          message:
            'Пользователь найден по telegram_id при повторном поиске после конфликта 23505',
          telegramId: telegram_id,
          userId: raceUser.id,
          function: 'createUser',
        })
        return [false, raceUser] // Пользователь уже существовал (создан другим процессом)
      } else if (raceFindError && raceFindError.code !== 'PGRST116') {
        // PGRST116 - no rows returned
        // Другая ошибка при поиске по telegram_id
        logger.error({
          message:
            'Неожиданная ошибка при повторном поиске по telegram_id после конфликта 23505',
          telegramId: telegram_id,
          error: raceFindError.message,
          function: 'createUser',
        })
        return [false, null]
      }

      // Если не найден по telegram_id (raceFindError.code === 'PGRST116' или !raceUser),
      // пробуем найти по username, так как конфликт мог быть по нему
      logger.warn({
        message:
          'Пользователь не найден по telegram_id после конфликта 23505, пытаемся найти по username.',
        telegramId: telegram_id,
        username: finalUsername,
        function: 'createUser',
      })

      const { data: userByUsername, error: usernameFindError } = await supabase
        .from('users')
        .select('*')
        .eq('username', finalUsername)
        .single()

      if (userByUsername) {
        // Пользователь найден по username! Это наш случай. Обновим его telegram_id.
        logger.info({
          message:
            'Пользователь найден по username после конфликта 23505. Обновляем telegram_id.',
          currentTelegramId: userByUsername.telegram_id,
          newTelegramId: telegram_id,
          userId: userByUsername.id,
          function: 'createUser',
        })
        const { error: updateError } = await supabase
          .from('users')
          .update({ telegram_id: telegram_id, ...userData }) // Обновляем и другие данные на всякий случай
          .eq('id', userByUsername.id)
          .select('*')
          .single()

        if (updateError) {
          logger.error({
            message:
              'Ошибка при обновлении telegram_id для пользователя, найденного по username после конфликта.',
            userId: userByUsername.id,
            error: updateError.message,
            function: 'createUser',
          })
          return [false, userByUsername] // Возвращаем пользователя как есть, хоть и не смогли обновить
        }
        logger.info({
          message:
            'Telegram_id успешно обновлен для пользователя, найденного по username.',
          userId: userByUsername.id,
          function: 'createUser',
        })
        // supabase.update(...).single() возвращает обновленный объект в data
        const { data: updatedUserAfterConflict } = await supabase
          .from('users')
          .select('*')
          .eq('id', userByUsername.id)
          .single()
        return [false, updatedUserAfterConflict || userByUsername]
      } else {
        // Если не найден ни по telegram_id, ни по username после конфликта - это проблема
        logger.error({
          message:
            'Критическая ошибка: Пользователь не найден ни по telegram_id, ни по username после конфликта 23505.',
          telegramId: telegram_id,
          username: finalUsername,
          error: usernameFindError?.message,
          function: 'createUser',
        })
        return [false, null]
      }
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

  // 3. Пользователь успешно создан в 'users'
  if (newUser) {
    logger.info({
      message: 'Пользователь успешно создан в users',
      telegramId: telegram_id,
      userId: newUser.id,
      function: 'createUser',
    })
    return [true, newUser] // Пользователь был только что создан
  }

  // На всякий случай, если что-то пошло не так и newUser null без ошибки
  logger.error({
    message: `Неожиданное состояние: newUser is null, но createError также null для ${telegram_id}`,
    function: 'createUser',
  })
  return [false, null]
}
