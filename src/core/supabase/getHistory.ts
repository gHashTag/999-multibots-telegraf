import { supabase } from '@/core/supabase'

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
    console.error('Error fetching lifehacks history:', error)
    return []
  }

  console.log(data)
  return data
}
