import { Payment } from '@/types/payments.interface'
import { supabase } from '.'
import { TelegramId } from '@/types/telegram.interface'

export async function sendPaymentInfo(
  user_id: TelegramId,
  level: string
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments_v2')
    .insert([{ user_id, level }])
    .single()

  if (error) {
    console.error('Error sending payment info:', error)
    throw new Error(`Failed to send payment info: ${error.message}`)
  }

  if (!data) {
    throw new Error('No data returned after inserting payment info.')
  }

  console.log('Payment info sent successfully:', data)
  return data as Payment[]
}
