import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export const setAspectRatio = async (
  telegram_id: number,
  aspect_ratio: string
) => {
  logger.debug(telegram_id, aspect_ratio, 'setAspectRatio')
  const { error } = await supabase
    .from('users')
    .update({ aspect_ratio: aspect_ratio })
    .eq('telegram_id', telegram_id.toString())

  if (error) {
    logger.error('Ошибка при установке aspect_ratio для telegram_id:', error)
    return false
  }
  return true
}
