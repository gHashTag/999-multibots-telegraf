import { MyWizardContext, Subscription } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { isDev } from '@/config'

/**
 * Проверяет статус платежа по его идентификатору.
 * @param invId Идентификатор счета (InvId).
 * @returns Объект с информацией о платеже или null, если платеж не найден или произошла ошибка.
 *
 * WHAT THIS IS NOT, because the name has already misled two readings of the
 * December 2025 outage. This reads OUR OWN payments_v2 row. It is not a
 * reconciliation against the payment provider, and wiring it into a watchdog
 * would not have caught that outage: asked about a stuck payment it answers
 * PENDING, which is exactly what the table already said. A checker that reads
 * the table holding the defect cannot see the defect.
 *
 * Answering "did this person actually pay" needs an INDEPENDENT channel --
 * Robokassa's OpStateExt, called with the merchant credentials. That tool now
 * exists: scripts/robokassa-reconcile.cjs, or `tri сверка`. It reads both
 * sides and writes to neither, and it refuses to run without
 * ROBOKASSA_PASSWORD_2 rather than reporting an empty list.
 *
 * Nothing calls this today (only the barrel re-exports it). Left in place
 * rather than deleted: the shape is a reasonable base for the real thing.
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
