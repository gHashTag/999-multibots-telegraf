import { TelegramId } from '@/types/telegram.interface'
import { supabase } from '.'

export async function isLimitAi(telegram_id: TelegramId): Promise<boolean> {
  const dailyLimit = 3
  const today = new Date().toISOString().split('T')[0]

  // Получаем user_id по telegram_id из таблицы users
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('user_id')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (userError) {
    console.error('isLimitAi: Ошибка при получении user_id:', userError)
    return false
  }

  const user_id = userData?.user_id

  // Получаем последнюю запись для пользователя
  const { data: limitData, error: limitError } = await supabase
    .from('ai_requests')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (limitError && limitError.code !== 'PGRST116') {
    console.error('Ошибка при получении данных о лимите:', limitError)
    return false
  }

  if (!limitData || limitData.created_at.split('T')[0] !== today) {
    // Создаем новую запись на сегодня
    const { error: insertError } = await supabase
      .from('ai_requests')
      .insert({ user_id, count: 1, created_at: new Date().toISOString() })

    if (insertError) {
      console.error('Ошибка при создании новой записи:', insertError)
      return false
    }

    return false
  } else if (limitData.count < dailyLimit) {
    // Обновляем существующую запись
    const { error: updateError } = await supabase
      .from('ai_requests')
      .update({ count: limitData.count + 1 })
      .eq('id', limitData.id)

    if (updateError) {
      console.error('Ошибка при обновлении записи:', updateError)
      return false
    }

    return false
  }

  return true
}
