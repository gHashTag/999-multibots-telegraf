import { supabaseAdmin } from '@/core/supabase'

export const getUserModel = async (
  telegram_id: string
): Promise<string | null> => {
  // telegram_id is NOT unique (~19 users have 2-3 rows); `.single()` errored for
  // them, so they always got the default model. Take the latest row (mirror
  // getUserByTelegramId). Same default-on-absence contract.
  const { data: rows, error } = await supabaseAdmin
    .from('users')
    .select('model')
    .eq('telegram_id', telegram_id)
    .order('updated_at', { ascending: false })
    .limit(1)
  const data = rows?.[0] ?? null

  if (error || !data) {
    return 'deepseek-chat'
  }

  return data?.model || 'deepseek-chat'
}
