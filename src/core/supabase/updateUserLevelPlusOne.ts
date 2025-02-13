import { supabase } from '@/core/supabase'

export async function updateUserLevelPlusOne(
  telegram_id: string,
  level: number
) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ level: level + 1 })
      .eq('telegram_id', telegram_id)

    if (error) {
      console.error('Ошибка обновления уровня пользователя:', error)
    } else {
      console.log('Уровень пользователя обновлен:', data)
    }
  } catch (e) {
    console.log('updateUserLevel', e)
  }
}
