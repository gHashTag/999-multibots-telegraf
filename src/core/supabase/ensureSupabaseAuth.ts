import { supabase } from '.'

export async function ensureSupabaseAuth(): Promise<void> {
  try {
    // Проверяем подключение простым запросом
    const { error } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true })
      .limit(1)

    if (error) throw error
  } catch (error) {
    console.error('Supabase connection error:', error)
    throw new Error('Не удалось подключиться к Supabase')
  }
}
