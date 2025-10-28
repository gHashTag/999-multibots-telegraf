import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export const getGeneratedImages = async (telegram_id: number) => {
  const { data, error } = await supabase
    .from('users')
    .select('count, limit')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error || !data) {
    logger.debug('Ошибка при получении count для telegram_id:', error)
    return { count: 0, limit: 2 }
  }

  return { count: Number(data.count), limit: Number(data.limit) }
}
