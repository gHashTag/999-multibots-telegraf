import { supabase } from '.'
import { logger } from '@/utils/logger'

/**
 * Проверяет наличие обычной подписки по telegram_id
 * @param telegramId ID пользователя в Telegram
 * @returns true если у пользователя есть активная подписка, иначе false
 */
// export const checkSubscriptionByTelegramId = async (
//   telegramId: number
// ): Promise<boolean> => {
//   const { data, error } = await supabase
//     .from('payments_v2')
//     .select('id')
//     .eq('telegram_id', telegramId)
//     .eq('type', 'subscription_purchase') // Проверяем тип подписки
//     .eq('status', 'COMPLETED') // Только успешно завершенные платежи
//     .limit(1)
//     .maybeSingle()
//
//   if (error) {
//     logger.error('Ошибка при проверке подписки пользователя:', error)
//     return false
//   }
//
//   return !!data // Возвращаем true, если найдена хотя бы одна запись
// }

interface ActiveSubscriptionResult {
  isActive: boolean
  type: 'neurophoto' | 'neurobase' | null
  startDate: string | null // Добавим дату начала для информации
}

const SUBSCRIPTION_DURATION_DAYS = 30 // Длительность подписки в днях

/**
 * Проверяет наличие и активность подписки 'neurophoto' или 'neurobase' по telegram_id,
 * ища последний УСПЕШНЫЙ платеж с соответствующим ТИПОМ ПОДПИСКИ в payments_v2
 * и проверяя срок действия (30 дней).
 * @param telegramId ID пользователя в Telegram
 * @returns Объект ActiveSubscriptionResult
 */
export const checkActivePaymentSubscription = async (
  telegramId: number | string
): Promise<ActiveSubscriptionResult> => {
  const telegramIdStr = telegramId.toString()

  try {
    // Ищем последний успешный платеж с типом подписки
    const { data, error } = await supabase
      .from('payments_v2')
      .select('payment_date, subscription_type') // Выбираем дату и тип
      .eq('telegram_id', telegramIdStr)
      // .eq('type', 'money_income') // Можно убрать, если subscription_type заполнен только для них
      .eq('status', 'COMPLETED')
      .in('subscription_type', ['neurophoto', 'neurobase']) // Ищем конкретные типы
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.error('Ошибка при поиске платежа за подписку по типу:', {
        error,
        telegramId: telegramIdStr,
      })
      return { isActive: false, type: null, startDate: null }
    }

    // Если платеж не найден
    if (!data || !data.subscription_type) {
      logger.info('Платежи за подписку (neurophoto/neurobase) не найдены', {
        telegramId: telegramIdStr,
      })
      return { isActive: false, type: null, startDate: null }
    }

    // Определяем тип подписки
    const subscriptionType = data.subscription_type as
      | 'neurophoto'
      | 'neurobase'
    const paymentDate = new Date(data.payment_date)
    const now = new Date()

    // Рассчитываем дату окончания подписки
    const expirationDate = new Date(paymentDate)
    expirationDate.setDate(paymentDate.getDate() + SUBSCRIPTION_DURATION_DAYS)

    // Проверяем, активна ли подписка
    const isActive = now < expirationDate

    logger.info('Результат проверки подписки по типу:', {
      telegramId: telegramIdStr,
      isActive,
      type: subscriptionType,
      paymentDate: data.payment_date,
      expirationDate: expirationDate.toISOString(),
    })

    return {
      isActive,
      type: subscriptionType,
      startDate: data.payment_date,
    }
  } catch (error) {
    logger.error('Непредвиденная ошибка при проверке подписки по типу:', {
      error,
      telegramId: telegramIdStr,
    })
    return { isActive: false, type: null, startDate: null }
  }
}

/**
 * Проверяет наличие подписки 'stars' по telegram_id
 * Ищем успешно завершенные платежи с money_income и currency='STARS' или другие признаки "платной" подписки
 * @param telegramId ID пользователя в Telegram
 * @returns true если у пользователя есть подписка 'stars', иначе false
 */
// export const hasStarsSubscription = async (
//   telegramId: number | string
// ): Promise<boolean> => {
//   // Преобразуем telegramId в строку для совместимости с базой данных
//   const telegramIdStr = telegramId.toString()
//
//   try {
//     // Ищем платежи пользователя с type='money_income', status='COMPLETED', и currency='STARS'
//     // или с большой суммой и currency='RUB' (что говорит о покупке премиум подписки)
//     const { data, error } = await supabase
//       .from('payments_v2')
//       .select('id, amount, currency')
//       .eq('telegram_id', telegramIdStr)
//       .eq('type', 'money_income')
//       .eq('status', 'COMPLETED')
//       .or('currency.eq.STARS,amount.gte.100') // Или это STARS валюта, или сумма ≥ 100 (признак премиум)
//       .order('payment_date', { ascending: false })
//       .limit(1)
//       .maybeSingle()
//
//     if (error) {
//       logger.error('Ошибка при проверке подписки stars:', {
//         error,
//         telegramId: telegramIdStr,
//       })
//       return false
//     }
//
//     // Если нашли хотя бы одну запись, возвращаем true
//     return !!data
//   } catch (error) {
//     logger.error('Непредвиденная ошибка при проверке подписки stars:', {
//       error,
//       telegramId: telegramIdStr,
//     })
//     return false
//   }
// }
