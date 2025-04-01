import { supabase } from '.'

interface Payment {
  id: string
  amount: number
  date: string
}

export async function getPaymentsInfoByTelegramId(
  telegram_id: string
): Promise<Payment[]> {
  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payments')
    .select('*')
    .eq('telegram_id', telegram_id)

  if (paymentsError || !paymentsData) {
    console.error('Error fetching payments info:', paymentsError)
    return []
  }

  return paymentsData
}
