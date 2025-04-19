// import { ModeEnum } from '@/scenes'
import { supabase } from '.'
// import { SubscriptionType } from '@/interfaces/subscription.interface'
// Импортируем функцию из утилит
import { determineSubscriptionType } from '@/utils/service.utils'

type PaymentParams = {
  telegram_id: string
  OutSum: string
  InvId: string
  currency: 'RUB' | 'USD' | 'EUR' | 'STARS' | 'XTR'
  stars: number
  status: 'COMPLETED' | 'PENDING' | 'FAILED'
  payment_method: 'Robokassa' | 'YooMoney' | 'Telegram' | 'Stripe' | 'Other'
  bot_name: string
  language: string
}

// УДАЛЯЕМ локальную функцию
/*
const determineSubscriptionType = (
  amount: number,
  currency: string
): 'neurophoto' | 'neurobase' | 'stars' | null => { ... }
*/

export const setPayments = async ({
  telegram_id,
  OutSum,
  InvId,
  currency,
  stars,
  status,
  payment_method,
  bot_name,
  language,
}: PaymentParams) => {
  try {
    const amount = parseFloat(OutSum)

    // Используем импортированную функцию
    const calculatedSubscriptionType =
      status === 'COMPLETED'
        ? determineSubscriptionType(amount, currency)
        : null

    const paymentType = 'money_income'

    const { error } = await supabase.from('payments_v2').insert({
      telegram_id,
      amount,
      inv_id: InvId,
      currency,
      status,
      payment_method,
      description: `Purchase and sale:: ${stars}`,
      stars,
      bot_name,
      type: paymentType,
      language,
      subscription_type: calculatedSubscriptionType,
    })
    if (error) {
      console.error('Ошибка создания платежа в setPayments:', error)
      throw error
    }
  } catch (error) {
    console.error('Ошибка в функции setPayments:', error)
    throw error
  }
}
