import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { supabase } from '.'
import { isRussian } from '@/helpers/language'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { isDev } from '@/config'

export const checkPaymentStatus = async (
  ctx: MyContext,
  subscription: SubscriptionType
): Promise<boolean> => {
  // Проверяем, что ctx и ctx.from определены
  if (!ctx || !ctx.from || !ctx.from.id) {
    console.error('Ошибка: ctx или ctx.from или ctx.from.id не определены')
    return false
  }

  // Если подписка "нейротестер", пропускаем проверку оплаты
  if (subscription === SubscriptionType.NEUROTESTER) {
    console.log(
      'Пользователь с подпиской "нейротестер", пропускаем проверку оплаты'
    )
    return true
  }

  try {
    // Получаем последнюю запись оплаты для пользователя
    const { data: paymentData, error } = await supabase
      .from('payments_v2')
      .select('payment_date')
      .eq('telegram_id', ctx.from.id.toString())
      .order('payment_date', { ascending: false })
      .limit(1)
      .single()
    console.log('paymentData', paymentData)

    if (error || !paymentData) {
      console.error('Ошибка при получении данных о последней оплате:', error)
      return false
    }

    const lastPaymentDate = new Date(paymentData.payment_date)
    const currentDate = new Date()
    const differenceInDays =
      (currentDate.getTime() - lastPaymentDate.getTime()) / (1000 * 3600 * 24)
    console.log('differenceInDays', differenceInDays)

    // Проверяем срок действия подписки
    if (differenceInDays > 30) {
      const isFullAccess = checkFullAccess(subscription)
      if (isFullAccess) {
        const isRu = isRussian(ctx)
        if (!isDev) {
          await ctx.reply(
            isRu
              ? '🤑 Ваша подписка истекла. Пожалуйста, обновите подписку, чтобы продолжить использование сервиса.'
              : '🤑Your subscription has expired. Please update your subscription to continue using the service.'
          )
        }
        return false
      }
    }

    return true
  } catch (error) {
    console.error('Ошибка при проверке статуса оплаты:', error)
    return false
  }
}
