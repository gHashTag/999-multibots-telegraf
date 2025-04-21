import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
// import { determineSubscriptionType } from '@/price/constants' // Исправлен путь импорта
// import { PaymentProcessParams } from '@/interfaces/payments.interface' // Убран импорт, используется локальный тип

type PaymentParams = {
  telegram_id: string
  OutSum: string
  InvId: string
  currency: string
  stars: number
  status: string
  payment_method: string
  bot_name: string
  language: string
  subscription: string | null // <-- СНОВА ДОБАВЛЯЕМ ЭТО ПОЛЕ
}

/**
 * Функция для записи информации о платеже в базу данных
 * Принимает объект с параметрами платежа
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
  subscription,
}: PaymentParams) => {
  try {
    const amount = parseFloat(OutSum)

    // Определяем тип подписки с помощью импортированной функции
    // const subscription_type = determineSubscriptionType(amount, currency) // Пока оставим закомментированным, т.к. передаем явно

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
      subscription_type: subscription,
    })
    if (error) {
      logger.error({ message: 'Error inserting payment', error })
      throw error
    }
  } catch (error) {
    console.error('Ошибка в функции setPayments:', error)
    logger.error({ message: 'Error in setPayments function', error })
  }
}
