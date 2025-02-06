import { supabase } from '.'
import { Subscription } from '../../interfaces/supabase.interface'

type Payment = {
  user_id: string
  OutSum: string
  InvId: string
  currency: 'RUB' | 'USD' | 'EUR' | 'STARS'
  stars: number
  email: string
  status: 'COMPLETED' | 'PENDING' | 'FAILED'
  payment_method: 'Robokassa' | 'YooMoney' | 'Telegram' | 'Stripe' | 'Other'
  subscription: Subscription
}

export const setPayments = async ({
  user_id,
  OutSum,
  InvId,
  currency,
  stars,
  email,
  status,
  payment_method,
  subscription,
}: Payment) => {
  try {
    const { error } = await supabase.from('payments').insert({
      user_id,
      amount: parseFloat(OutSum),
      inv_id: InvId,
      currency,
      status,
      payment_method,
      description: `Purchase and sale:: ${stars}`,
      stars,
      email,
      subscription,
    })
    if (error) {
      console.error('Ошибка создания платежа:', error)
      throw error
    }
  } catch (error) {
    console.error('Ошибка создания платежа:', error)
    throw error
  }
}
