import { supabase } from '@/core/supabase'

export const getGeneratedImages = async (telegram_id: number) => {
  const { data, error } = await supabase
    .from('users')
    .select('count, limit')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error || !data) {
    console.log('Ошибка при получении count для telegram_id:', error)
    return { count: 0, limit: 2 }
  }

  return { count: Number(data.count), limit: Number(data.limit) }
}
