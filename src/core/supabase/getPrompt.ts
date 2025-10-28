import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export const getPrompt = async (prompt_id: string) => {
  const { data, error } = await supabase
    .from('prompts_history')
    .select('*')
    .eq('prompt_id', prompt_id)
    .single()
  logger.debug(data, 'data')
  if (error || !data) {
    logger.error('Ошибка при получении промпта по prompt_id:', error)
    return null
  }

  return data
}
