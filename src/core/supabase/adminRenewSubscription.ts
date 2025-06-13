import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { PaymentStatus } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { ServiceType } from '@/interfaces/serviceTypes'
import { directPaymentProcessor } from './directPayment'

interface AdminRenewSubscriptionParams {
  telegram_id: string
  subscription_type: SubscriptionType
  duration_days: number
  bot_name: string
  reason?: string
}

/**
 * Административное продление подписки пользователя
 * @param params Параметры продления подписки
 * @returns Результат операции
 */
export async function adminRenewSubscription(
  params: AdminRenewSubscriptionParams
): Promise<{ success: boolean; error?: string }> {
  const { telegram_id, subscription_type, duration_days, bot_name, reason } =
    params

  try {
    // Создаем запись о продлении подписки
    const metadata = {
      is_admin_renewal: true,
      reason: reason || 'Administrative renewal',
      duration_days,
      renewal_timestamp: new Date().toISOString(),
      category: 'ADMIN_RENEWAL',
    }

    const result = await directPaymentProcessor({
      telegram_id,
      amount: 0, // Административное продление бесплатное
      type: 'MONEY_INCOME',
      description: `Administrative subscription renewal: ${subscription_type}`,
      bot_name,
      service_type: ServiceType.AdminSubscriptionRenewal,
      inv_id: `admin-renewal-${subscription_type}-${Date.now()}`,
      metadata,
      subscription_type,
    })

    if (result.success) {
      logger.info(
        '✅ [AdminRenewSubscription] Subscription renewed successfully',
        {
          telegram_id,
          subscription_type,
          duration_days,
          reason,
          payment_id: result.payment_id,
        }
      )
      return { success: true }
    } else {
      logger.error('❌ [AdminRenewSubscription] Failed to renew subscription', {
        telegram_id,
        subscription_type,
        duration_days,
        reason,
        error: result.error,
      })
      return { success: false, error: result.error }
    }
  } catch (error) {
    logger.error(
      '❌ [AdminRenewSubscription] Exception in adminRenewSubscription',
      {
        telegram_id,
        subscription_type,
        duration_days,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    )
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
