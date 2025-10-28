import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export const getHistory = async (
  brand: string,
  command: string,
  type: string
) => {
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
    .eq('brand', brand)
    .eq('command', command)
    .eq('type', type)

  if (error) {
    logger.error('Error fetching lifehacks history:', error)
    return []
  }

  logger.debug(data)
  return data
}
