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
    function: 'createUser_ENTRY',
    inputUserData: userData, // Логируем входные данные
  })

  // 1. Попытка найти существующего пользователя
  logger.debug({
    message: "Шаг 1: Попытка найти существующего пользователя в 'users'",
    telegramId: telegram_id,
    function: 'createUser_STEP1_find',
  })
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
      details: findError,
      function: 'createUser_STEP1_findError',
    })
    return [false, null] // Не удалось найти, возвращаем ошибку
  }

  logger.debug({
    message: 'Результат поиска существующего пользователя',
    telegramId: telegram_id,
    existingUser: existingUser
      ? {
          id: existingUser.id,
          username: existingUser.username,
          telegram_id: existingUser.telegram_id,
        }
      : null,
    function: 'createUser_STEP1_findResult',
  })

  if (existingUser) {
    logger.info({
      message: 'Пользователь найден в users',
      telegramId: telegram_id,
      userId: existingUser.id,
      function: 'createUser_STEP1_userFound',
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
        function: 'createUser_STEP1_attemptUpdate',
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
          details: updateError,
          function: 'createUser_STEP1_updateError',
        })
        // Не критично, возвращаем найденного пользователя
      } else {
        logger.info({
          message: 'Данные существующего пользователя успешно обновлены',
          telegramId: telegram_id,
          userId: existingUser.id,
          function: 'createUser_STEP1_updateSuccess',
        })
        // Обновим existingUser новыми данными для возврата
        Object.assign(existingUser, updates)
      }
    }
    logger.debug({
      message: 'Возвращаем существующего пользователя',
      telegramId: telegram_id,
      userId: existingUser.id,
      function: 'createUser_RETURN_existing',
    })
    return [false, existingUser] // Пользователь уже существовал
  }

  // === НАЧАЛО УЛУЧШЕННОЙ ЛОГИКИ ===
  // Пользователь НЕ найден в 'users'. Проверим, есть ли он в 'payments_v2'.
  logger.info({
    message: `Пользователь ${telegram_id} не найден в 'users'. Проверяем 'payments_v2' для признаков прошлой активности...`,
    telegramId: telegram_id,
    function: 'createUser_checkPaymentsV2_START',
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
      details: paymentError,
      function: 'createUser_checkPaymentsV2_Error',
    })
    // Ошибка при доступе к payments_v2, продолжаем с обычной логикой создания нового пользователя
  } else if (paymentRecords && paymentRecords.length > 0) {
    // Пользователь найден в 'payments_v2'! Это означает, что он существовал ранее.
    // Создаем его в 'users' как "восстановленного".
    logger.info({
      message: `Обнаружены записи в 'payments_v2' для ${telegram_id}. Пользователь существовал ранее. Создаем запись в 'users'.`,
      telegramId: telegram_id,
      paymentRecordsCount: paymentRecords.length,
      function: 'createUser_checkPaymentsV2_FoundAndRecover',
    })
    // Переходим к логике создания нового пользователя НИЖЕ, но с этим знанием.
  } else {
    // Записей в 'payments_v2' не найдено. Это действительно новый пользователь.
    logger.info({
      message: `Записей в 'payments_v2' для ${telegram_id} не найдено. Это новый пользователь.`,
      telegramId: telegram_id,
      function: 'createUser_checkPaymentsV2_NotFound',
    })
  }
  // === КОНЕЦ УЛУЧШЕННОЙ ЛОГИКИ ===

  // 2. Пользователь не найден в 'users' (или не требовал "восстановления" специфического UUID),
  //    пытаемся создать нового в 'users'.
  //    Если он был в payments_v2, это просто означает, что мы создаем для него запись в users,
  //    используя предоставленные userData.
  logger.info({
    message: `Шаг 2: Попытка создания новой записи в 'users' для ${telegram_id}`,
    telegramId: telegram_id,
    username: finalUsername,
    inviter,
    inputUserDataForInsert: userData,
    function: 'createUser_STEP2_insertNew_START',
  })

  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert(userData) // Используем insert вместо upsert
    .select('*') // Запрашиваем все поля созданного пользователя
    .single() // Ожидаем одну запись

  if (createError) {
    logger.error({
      message: "Ошибка при создании новой записи в 'users'",
      telegramId: telegram_id,
      error: createError.message,
      details: createError,
      function: 'createUser_STEP2_insertNew_Error',
    })
    // Обработка возможной гонки условий: если кто-то создал пользователя между find и insert
    if (createError.code === '23505') {
      // Код ошибки уникальности
      logger.warn({
        message:
          'Конфликт при создании (23505), пользователь мог быть создан параллельно. Повторный поиск.',
        telegramId: telegram_id,
        function: 'createUser_STEP2_handleRace_23505',
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
          function: 'createUser_STEP2_handleRace_foundByTgId',
        })
        logger.debug({
          message:
            'Возвращаем пользователя, найденного после гонки (по telegram_id)',
          telegramId: telegram_id,
          userId: raceUser.id,
          function: 'createUser_RETURN_race_tgId',
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
          details: raceFindError,
          function: 'createUser_STEP2_handleRace_tgIdSearchError',
        })
        logger.debug({
          message:
            'Возвращаем null из-за ошибки повторного поиска по telegram_id',
          telegramId: telegram_id,
          function: 'createUser_RETURN_race_tgIdError',
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
        function: 'createUser_STEP2_handleRace_tryUsername',
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
          function: 'createUser_STEP2_handleRace_foundByUsername',
        })
        const { data: updatedUserAfterRace, error: updateError } =
          await supabase
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
            details: updateError,
            function: 'createUser_STEP2_handleRace_usernameUpdateError',
          })
          logger.debug({
            message:
              'Возвращаем пользователя (userByUsername) после ошибки обновления telegram_id',
            telegramId: telegram_id,
            userId: userByUsername.id,
            function: 'createUser_RETURN_race_usernameUpdateError',
          })
          return [false, userByUsername] // Возвращаем пользователя как есть, хоть и не смогли обновить
        }
        logger.info({
          message:
            'Успешно обновлен telegram_id для пользователя, найденного по username.',
          userId: userByUsername.id,
          updatedUser: updatedUserAfterRace
            ? {
                id: updatedUserAfterRace.id,
                username: updatedUserAfterRace.username,
                telegram_id: updatedUserAfterRace.telegram_id,
              }
            : null,
          function: 'createUser_STEP2_handleRace_usernameUpdateSuccess',
        })
        logger.debug({
          message:
            'Возвращаем обновленного пользователя (updatedUserAfterRace)',
          telegramId: telegram_id,
          function: 'createUser_RETURN_race_usernameUpdateSuccess',
        })
        return [false, updatedUserAfterRace]
      } else if (usernameFindError && usernameFindError.code !== 'PGRST116') {
        logger.error({
          message:
            'Неожиданная ошибка при поиске по username после конфликта 23505 (и неудачи по telegram_id).',
          telegramId: telegram_id,
          username: finalUsername,
          error: usernameFindError.message,
          details: usernameFindError,
          function: 'createUser_STEP2_handleRace_usernameSearchError',
        })
        logger.debug({
          message: 'Возвращаем null из-за ошибки поиска по username',
          telegramId: telegram_id,
          function: 'createUser_RETURN_race_usernameSearchError',
        })
        return [false, null]
      } else {
        // Не найден ни по telegram_id, ни по username после конфликта 23505. Это странно.
        logger.error({
          message:
            'Критическая ошибка: Конфликт 23505, но пользователь не найден ни по telegram_id, ни по username. Это не должно происходить.',
          telegramId: telegram_id,
          username: finalUsername,
          function: 'createUser_STEP2_handleRace_CRITICAL_notFound',
        })
        logger.debug({
          message: 'Возвращаем null из-за критической ошибки после 23505',
          telegramId: telegram_id,
          function: 'createUser_RETURN_race_criticalError',
        })
        return [false, null] // Не смогли разрешить ситуацию
      }
    }
    // Если ошибка создания не 23505, это другая проблема
    logger.debug({
      message: 'Возвращаем null из-за неизвестной ошибки создания пользователя',
      telegramId: telegram_id,
      function: 'createUser_RETURN_otherCreateError',
    })
    return [false, null] // Не удалось создать
  }

  // Пользователь успешно создан
  logger.info({
    message: "Пользователь успешно создан в 'users'",
    telegramId: telegram_id,
    userId: newUser.id, // newUser здесь точно не null
    function: 'createUser_STEP2_insertNew_Success',
  })
  logger.debug({
    message: 'Возвращаем нового пользователя',
    telegramId: telegram_id,
    userId: newUser.id,
    wasCreated: true,
    function: 'createUser_RETURN_new',
  })
  return [true, newUser]
}
