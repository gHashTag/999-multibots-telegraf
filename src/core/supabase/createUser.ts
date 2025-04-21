import { CreateUserData, MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

const SUBSCRIBE_CHANNEL_ID = '@neuro_blogger_pulse'

export const createUser = async (userData: CreateUserData, ctx: MyContext) => {
  const { telegram_id, username, inviter } = userData
  const finalUsername = username || telegram_id.toString()

  logger.info({
    message: 'Попытка создания/обновления пользователя (upsert)',
    telegramId: telegram_id,
    username: finalUsername,
    inviter,
    function: 'createUser',
  })

  const { data, error } = await supabase
    .from('users')
    .upsert(userData, {})
    .select()

  if (error) {
    logger.error({
      message: 'Ошибка при создании/обновлении пользователя (upsert)',
      telegramId: telegram_id,
      username: finalUsername,
      error: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      function: 'createUser',
    })
    if (error.code !== '23505') {
      throw error
    }
    logger.info({
      message:
        'Пользователь уже существует, upsert вызвал ошибку конфликта (23505)',
      telegramId: telegram_id,
      username: finalUsername,
      function: 'createUser',
    })
    if (!data) {
      const { data: existingUserData, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id)
        .single()
      if (fetchError) {
        logger.error({
          message:
            'Ошибка при получении данных существующего пользователя после конфликта upsert',
          telegramId: telegram_id,
          error: fetchError.message,
          function: 'createUser',
        })
        throw fetchError
      }
      return existingUserData
    }
  } else if (data && data.length > 0) {
    logger.info({
      message: 'Пользователь успешно создан/обновлен (upsert)',
      telegramId: telegram_id,
      username: finalUsername,
      returnedData: data[0],
      function: 'createUser',
    })
  } else {
    logger.warn({
      message: 'Upsert пользователя прошел без ошибки, но не вернул данные',
      telegramId: telegram_id,
      username: finalUsername,
      function: 'createUser',
    })
  }

  return data ? data[0] : null
}
