import { MyWizardContext } from '@/interfaces'
import { supabase } from '.'
import { isRussian } from '@/helpers/language'

export const checkPaymentStatus = async (
  ctx: MyWizardContext
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
    console.log('differenceInDays', differenceInDays)

    if (differenceInDays < 30) {
      // differenceInDays > 30
      // Обновляем уровень подписки на 'stars'
      const { error: updateError } = await supabase
        .from('users')
        .update({ subscription: 'stars' })
        .eq('telegram_id', ctx.from.id.toString())

      if (updateError) {
        console.error('Ошибка при обновлении уровня подписки:', updateError)
      }

      return false
    }

    return true
  } catch (error) {
    console.error('Ошибка при проверке статуса оплаты:', error)
    return false
  }
}
