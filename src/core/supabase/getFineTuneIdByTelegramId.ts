import { supabase } from '@/core/supabase'

export async function getFineTuneIdByTelegramId(telegramId: string) {
  try {
    console.log('Запрос FineTune ID для telegramId:', telegramId)

    const { data, error } = await supabase
      .from('model_trainings')
      .select('finetune_id')
      .eq('telegram_id', telegramId.toString())
      .eq('status', 'COMPLETED')
      .eq('api', 'bfl')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      console.error('Ошибка при выполнении запроса:', error)
      return null
    }

    if (!data) {
      console.log('Записи не найдены для telegramId:', telegramId)
      return null
    }

    console.log('Найден FineTune ID:', data.finetune_id)
    return data.finetune_id
  } catch (error) {
    console.error('Ошибка при получении FineTune ID:', error)
    return null
  }
}
