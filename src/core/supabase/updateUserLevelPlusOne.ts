import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export async function updateUserLevelPlusOne(
  telegram_id: string,
  level: number
) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ level: level + 1 })
      .eq('telegram_id', telegram_id)

    if (error) {
      logger.error('Ошибка обновления уровня пользователя:', error)
    } else {
      logger.debug('Уровень пользователя обновлен:', data)
    }
  } catch (e) {
    logger.debug('updateUserLevel', e)
  }
}
