import { supabase } from '@/core/supabase'

export interface Payment {
  id: string
  amount: number
  date: string
}

export const getPaymentsInfoByTelegramId = async (
  telegramId: string
): Promise<Payment[]> => {
  const { data, error } = await supabase
    // .from('payments') // Старая таблица
    .from('payments_v2') // Новая таблица
    .select('id, amount, date')
    .eq('telegram_id', telegramId)
    .order('date', { ascending: false })

  if (error) {
    console.error(
      'Ошибка при получении информации о платежах пользователя:',
      error
    )
    return []
  }

  return data || []
}
