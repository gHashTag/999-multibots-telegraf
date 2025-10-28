import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export const incrementLimit = async ({
  telegram_id,
  amount,
}: {
  telegram_id: number
  amount: number
}) => {
  const { data, error } = await supabase
    .from('users')
    .select('limit')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error && error.code === 'PGRST116') {
    const { error: insertError } = await supabase
      .from('users')
      .insert({ telegram_id: telegram_id.toString(), limit: amount })

    if (insertError) {
      logger.error('Ошибка при добавлении нового telegram_id:', insertError)
      return false
    }
  } else if (data) {
    const newLimit = data.limit + amount
    const { error: updateError } = await supabase
      .from('users')
      .update({ limit: newLimit })
      .eq('telegram_id', telegram_id.toString())

    if (updateError) {
      logger.error('Ошибка при обновлении limit для telegram_id:', updateError)
      return false
    }
  } else {
    logger.error('Ошибка при проверке существования telegram_id:', error)
    return false
  }

  return true
}
