import { MyWizardContext } from '@/interfaces'
import { supabase } from '.'
import { isRussian } from '@/helpers/language'

export const checkPaymentStatus = async (
  ctx: MyWizardContext,
  subscription: string
): Promise<boolean> => {
  // Проверяем, что ctx и ctx.from определены
  if (!ctx || !ctx.from || !ctx.from.id) {
    console.error('Ошибка: ctx или ctx.from или ctx.from.id не определены')
    return false
  }

  try {
    // Получаем последнюю запись оплаты для пользователя
    const { data: paymentData, error } = await supabase
      .from('payments')
      .select('payment_date')
      .eq('user_id', ctx.from.id.toString())
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
    const isRu = isRussian(ctx)
    // Если прошло больше 30 дней, отправляем уведомление и возвращаем false
    if (differenceInDays > 30) {
      await ctx.reply(
        isRu
          ? '🤑 Ваша подписка истекла. Пожалуйста, обновите подписку, чтобы продолжить использование сервиса.'
          : '🤑Your subscription has expired. Please update your subscription to continue using the service.'
      )

      return false
    }

    // Проверяем, есть ли у пользователя полный доступ
    const fullAccessSubscriptions = [
      'neurophoto',
      'neurobase',
      'neuromeeting',
      'neuroblogger',
      'neurotester',
    ]
    const hasFullAccess = fullAccessSubscriptions.includes(subscription)

    if (hasFullAccess) {
      return true
    }
  } catch (error) {
    console.error('Ошибка при проверке статуса оплаты:', error)
    return false
  }
}
