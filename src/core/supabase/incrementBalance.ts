import { supabase } from '@/core/supabase'

export const incrementBalance = async ({
  telegram_id,
  amount,
}: {
  telegram_id: string
  amount: number
}) => {
  try {
    console.log('CASE: incrementBalance', telegram_id, amount)
    const { data, error } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', telegram_id)
      .single()

    if (error) {
      console.error('Error fetching balance:', error)
      throw new Error('Не удалось получить текущий баланс')
    }

    if (!data) {
      console.error('No user found with telegram_id:', telegram_id)
      throw new Error('Пользователь не найден')
    }

    const newBalance = data.balance + amount
    console.log('New balance:', newBalance)

    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('telegram_id', telegram_id)

    if (updateError) {
      console.error('Error updating balance:', updateError)
      throw new Error('Не удалось обновить баланс')
    }
  } catch (error) {
    console.error('Error incrementing balance:', error)
    throw error
  }
}
