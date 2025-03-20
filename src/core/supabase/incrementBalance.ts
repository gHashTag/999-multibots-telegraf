import { supabase } from '@/core/supabase'

export const incrementBalance = async ({
  telegram_id,
  amount,
}: {
  telegram_id: string
  amount: number
}) => {
  try {
    console.log('CASE: incrementBalance')
    const { data, error } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', telegram_id)
      .single()

    if (error || !data) {
      throw new Error('Не удалось получить текущий баланс')
    }

    console.log('data', data)

    const newBalance = data.balance + amount
    console.log('newBalance', newBalance)

    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('telegram_id', telegram_id.toString())

    if (updateError) {
      throw new Error('Не удалось обновить баланс')
    }
  } catch (error) {
    console.error('Error incrementing balance:', error)
    throw error
  }
}
