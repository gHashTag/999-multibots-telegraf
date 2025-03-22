import { supabase } from '.'

export async function isOwner(
  userId: number,
  botName: string
): Promise<boolean> {
  try {
    console.log('CASE botName', botName)
    const { data, error } = await supabase
      .from('avatars')
      .select('telegram_id')
      .eq('bot_name', botName)
      .single() // Получаем только одну запись

    if (error) {
      console.error('Ошибка при проверке владельца:', error)
      return false // Если произошла ошибка, возвращаем false
    }

    // Проверяем, совпадает ли telegram_id с userId
    return data && data.telegram_id === userId
  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error)
    return false // Если произошла ошибка, возвращаем false
  }
}
