import { supabase } from '@/core/supabase'

export const getUserModel = async (telegram_id: string): Promise<string> => {
  const { data, error } = await supabase
    .from('users')
    .select('model')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error) {
    console.error('Error getting user model:', error)
    return 'gpt-4o'
  }

  return data?.model || 'gpt-4o'
}
