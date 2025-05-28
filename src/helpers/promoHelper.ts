import { logger } from '@/utils/logger'
import { directPaymentProcessor } from '@/core/supabase/directPayment'
import { PaymentType } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/modes'
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { SubscriptionType } from '@/interfaces/subscription.interface'

/**
 * Configuration for promo star allocation
 */
export interface PromoConfig {
  /** Default subscription tier to grant stars for */
  defaultTier: SubscriptionType
  /** Custom star amount (overrides tier-based calculation) */
  customStars?: number
  /** Promo type identifier */
  promoType: string
}

/**
 * Default promo configuration - grants stars equivalent to NEUROPHOTO subscription
 */
export const DEFAULT_PROMO_CONFIG: PromoConfig = {
  defaultTier: SubscriptionType.NEUROPHOTO,
  promoType: 'welcome_bonus',
}

/**
 * Allocates promo stars to a user based on subscription tier equivalent
 * @param telegram_id - User's Telegram ID
 * @param config - Promo configuration
 * @param bot_name - Bot name for tracking
 * @returns Promise<boolean> - Success status
 */
export async function allocatePromoStars(
  telegram_id: string,
  config: PromoConfig = DEFAULT_PROMO_CONFIG,
  bot_name: string = 'MetaMuse_Manifest_bot'
): Promise<boolean> {
  try {
    // Determine star amount
    let starAmount: number

    if (config.customStars) {
      starAmount = config.customStars
    } else {
      // Find the subscription tier in payment plans
      const tierPlan = paymentOptionsPlans.find(
        plan => plan.subscription === config.defaultTier
      )

      if (!tierPlan) {
        logger.error(
          '❌ [PromoHelper] Subscription tier not found in payment plans',
          {
            telegram_id,
            tier: config.defaultTier,
            function: 'allocatePromoStars',
          }
        )
        return false
      }

      starAmount = parseInt(tierPlan.stars)
    }

    logger.info('🎁 [PromoHelper] Allocating promo stars', {
      telegram_id,
      starAmount,
      promoType: config.promoType,
      tier: config.defaultTier,
      function: 'allocatePromoStars',
    })

    // Use direct payment processor to add promo stars
    const result = await directPaymentProcessor({
      telegram_id,
      amount: starAmount,
      type: PaymentType.MONEY_INCOME,
      description: `🎁 Promo bonus: ${starAmount} stars`,
      bot_name,
      service_type: ModeEnum.StartScene,
      inv_id: `promo-${config.promoType}-${Date.now()}`,
      metadata: {
        is_promo: true,
        promo_type: config.promoType,
        subscription_tier_equivalent: config.defaultTier,
        stars_granted: starAmount,
        allocation_timestamp: new Date().toISOString(),
        category: 'BONUS',
      },
    })

    if (result.success) {
      logger.info('✅ [PromoHelper] Promo stars allocated successfully', {
        telegram_id,
        starAmount,
        paymentId: result.payment_id,
        operationId: result.operation_id,
        balanceChange: result.balanceChange,
        function: 'allocatePromoStars',
      })
      return true
    } else {
      logger.error('❌ [PromoHelper] Failed to allocate promo stars', {
        telegram_id,
        error: result.error,
        operationId: result.operation_id,
        function: 'allocatePromoStars',
      })
      return false
    }
  } catch (error) {
    logger.error('❌ [PromoHelper] Exception during promo star allocation', {
      telegram_id,
      error: error instanceof Error ? error.message : String(error),
      function: 'allocatePromoStars',
    })
    return false
  }
}

/**
 * Checks if a user has already received promo stars of a specific type
 * @param telegram_id - User's Telegram ID
 * @param promoType - Type of promo to check
 * @returns Promise<boolean> - True if user already received this promo
 */
export async function hasReceivedPromo(
  telegram_id: string,
  promoType: string
): Promise<boolean> {
  try {
    const { supabase } = await import('@/core/supabase')

    const { data, error } = await supabase
      .from('payments_v2')
      .select('id')
      .eq('telegram_id', telegram_id)
      .eq('type', PaymentType.MONEY_INCOME)
      .eq('category', 'BONUS')
      .contains('metadata', { is_promo: true, promo_type: promoType })
      .limit(1)

    if (error) {
      logger.error('❌ [PromoHelper] Error checking promo history', {
        telegram_id,
        promoType,
        error: error.message,
        function: 'hasReceivedPromo',
      })
      return false // Assume not received on error to be safe
    }

    const hasReceived = data && data.length > 0

    logger.info('🔍 [PromoHelper] Promo check result', {
      telegram_id,
      promoType,
      hasReceived,
      function: 'hasReceivedPromo',
    })

    return hasReceived
  } catch (error) {
    logger.error('❌ [PromoHelper] Exception during promo check', {
      telegram_id,
      promoType,
      error: error instanceof Error ? error.message : String(error),
      function: 'hasReceivedPromo',
    })
    return false // Assume not received on error to be safe
  }
}

/**
 * Processes promo link for new or existing users
 * @param telegram_id - User's Telegram ID
 * @param promoParameter - Optional parameter from promo link
 * @param bot_name - Bot name for tracking
 * @returns Promise<{ success: boolean; message: string; alreadyReceived?: boolean }>
 */
export async function processPromoLink(
  telegram_id: string,
  promoParameter: string = '',
  bot_name: string = 'MetaMuse_Manifest_bot'
): Promise<{ success: boolean; message: string; alreadyReceived?: boolean }> {
  try {
    // Determine promo configuration based on parameter
    let promoConfig: PromoConfig = DEFAULT_PROMO_CONFIG

    // You can extend this logic to handle different promo types based on parameter
    if (promoParameter) {
      // Example: handle different promo codes
      switch (promoParameter.toLowerCase()) {
        case 'video':
          promoConfig = {
            defaultTier: SubscriptionType.NEUROVIDEO,
            promoType: 'video_promo',
          }
          break
        case 'photo':
          promoConfig = {
            defaultTier: SubscriptionType.NEUROPHOTO,
            promoType: 'photo_promo',
          }
          break
        default:
          promoConfig.promoType = `custom_${promoParameter}`
          break
      }
    }

    // Check if user already received this type of promo
    const alreadyReceived = await hasReceivedPromo(
      telegram_id,
      promoConfig.promoType
    )

    if (alreadyReceived) {
      logger.info('ℹ️ [PromoHelper] User already received this promo', {
        telegram_id,
        promoType: promoConfig.promoType,
        function: 'processPromoLink',
      })
      return {
        success: false,
        message: 'You have already received this promotional bonus!',
        alreadyReceived: true,
      }
    }

    // Allocate promo stars
    const success = await allocatePromoStars(telegram_id, promoConfig, bot_name)

    if (success) {
      const tierPlan = paymentOptionsPlans.find(
        plan => plan.subscription === promoConfig.defaultTier
      )
      const starAmount =
        promoConfig.customStars || (tierPlan ? parseInt(tierPlan.stars) : 0)

      return {
        success: true,
        message: `🎁 Welcome bonus received! You got ${starAmount} free stars!`,
      }
    } else {
      return {
        success: false,
        message: 'Failed to process promotional bonus. Please try again later.',
      }
    }
  } catch (error) {
    logger.error('❌ [PromoHelper] Exception during promo processing', {
      telegram_id,
      promoParameter,
      error: error instanceof Error ? error.message : String(error),
      function: 'processPromoLink',
    })
    return {
      success: false,
      message: 'An error occurred while processing your promotional bonus.',
    }
  }
}
