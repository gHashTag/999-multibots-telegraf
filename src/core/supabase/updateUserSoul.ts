import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

export const updateUserSoul = async (
  telegram_id: string,
  company: string,
  position: string,
  designation: string
) => {
  logger.info('[updateUserSoul] Attempting to update soul', {
    telegram_id,
    company,
    position,
    designation,
  })
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ company, position, designation })
      .eq('telegram_id', telegram_id.toString())
      .select()

    if (error) {
      logger.error('[updateUserSoul] Supabase update error', {
        telegram_id,
        error,
      })
      throw new Error(`Ошибка при обновлении пользователя: ${error.message}`)
    } else {
      logger.info('[updateUserSoul] Supabase update successful', {
        telegram_id,
        updatedData: data,
      })
    }
    return { data, error }
  } catch (error) {
    logger.error('[updateUserSoul] Caught error', {
      telegram_id,
      error: error instanceof Error ? error.message : String(error),
    })
    return { data: null, error }
  }
}
