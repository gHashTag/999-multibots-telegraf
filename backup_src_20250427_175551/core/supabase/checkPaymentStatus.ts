import { MyWizardContext, Subscription } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { isDev } from '@/config'

/**
 * Проверяет статус платежа по его идентификатору.
 * @param invId Идентификатор счета (InvId).
 * @returns Объект с информацией о платеже или null, если платеж не найден или произошла ошибка.
 */
export const checkPaymentStatus = async (
  invId: string
): Promise<{
  status: string
  amount: number
  currency: string
  type: string
  [key: string]: any // Для других полей, если они есть
} | null> => {
  try {
    const { data, error } = await supabase
      // .from('payments') // TODO: изменить на payments_history -> МЕНЯЕМ НА payments_v2
      .from('payments_v2') // Новая таблица
      .select('status, amount, currency, type') // Выбираем нужные поля
      .eq('inv_id', invId)
      .maybeSingle()

    if (error || !data) {
      console.error('Ошибка при получении данных о платеже:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Ошибка при проверке статуса платежа:', error)
    return null
  }
}
