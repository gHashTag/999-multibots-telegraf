import { supabaseAdmin } from '@/core/supabase'

export const getUserModel = async (
  telegram_id: string
): Promise<string | null> => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('model')
    .eq('telegram_id', telegram_id)
    .single()

  if (error || !data) {
    return 'deepseek-chat'
  }

  return data?.model || 'deepseek-chat'
}
