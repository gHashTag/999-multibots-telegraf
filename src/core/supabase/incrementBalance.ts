import { supabase } from '@/core/supabase'

export const incrementBalance = async ({
  telegram_id,
  amount,
}: {
  telegram_id: string
  amount: number
}) => {
  const { data, error } = await supabase
    .from('users')
    .select('balance')
    .eq('telegram_id', telegram_id)
    .single()

  if (error || !data) {
    throw new Error('Не удалось получить текущий баланс')
  }

  console.log('data.balance', data.balance)

  const newBalance = data.balance + amount
  console.log('newBalance', newBalance)

  const { error: updateError } = await supabase
    .from('users')
    .update({ balance: newBalance })
    .eq('telegram_id', telegram_id.toString())

  if (updateError) {
    throw new Error('Не удалось обновить баланс')
  }
}
