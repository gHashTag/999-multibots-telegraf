import { supabase } from '@/core/supabase'

export async function updateUserLevel(telegram_id: string, newLevel: number) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ level: newLevel })
      .eq('telegram_id', telegram_id)

    if (error) {
      console.error('Ошибка обновления уровня пользователя:', error)
    } else {
      console.log('Уровень пользователя обновлен:', data)
    }
  } catch (e) {
    console.log(e)
  }
}
