import { PaymentType } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

/**
 * Configuration for different promo types
 */
export interface PromoConfig {
  subscriptionTier: SubscriptionType
  promoType: string
}

/**
 * Default promo configurations
 */
const PROMO_CONFIGS: Record<string, PromoConfig> = {
  neurovideo: {
    subscriptionTier: SubscriptionType.NEUROVIDEO,
    promoType: 'neurovideo_promo',
  },
  neurophoto: {
    subscriptionTier: SubscriptionType.NEUROPHOTO,
    promoType: 'neurophoto_promo',
  },
}

/**
 * Gets promo configuration by type
 * @param promoType - Type of promo
 * @returns PromoConfig or null if not found
 */
export function getPromoConfig(promoType: string): PromoConfig | null {
  return PROMO_CONFIGS[promoType] || null
}

/**
 * Gives bonus stars to user AND activates promo subscription
 * @param telegram_id - User's Telegram ID
 * @param subscriptionTier - Subscription tier to activate
 * @param promoType - Type of promo
 * @param bot_name - Bot name for tracking
 * @returns Promise<boolean> - Success status
 */
async function activatePromoSubscription(
  telegram_id: string,
  subscriptionTier: SubscriptionType,
  promoType: string,
  bot_name: string
): Promise<boolean> {
  try {
    const { directPaymentProcessor } = await import(
      '@/core/supabase/directPayment'
    )

    // Calculate star amounts based on subscription tier
    let starAmount = 476 // Default NEUROPHOTO amount
    if (subscriptionTier === SubscriptionType.NEUROVIDEO) {
      starAmount = 1303
    } else if (subscriptionTier === SubscriptionType.NEUROPHOTO) {
      starAmount = 476
    }

    logger.info(
      '🎁 [PromoHelper] Giving bonus stars and activating subscription',
      {
        telegram_id,
        subscription_tier: subscriptionTier,
        promo_type: promoType,
        star_amount: starAmount,
      }
    )

    // Give bonus stars AND activate subscription in one transaction
    const bonusMetadata = {
      is_promo: true,
      promo_type: promoType,
      subscription_tier_equivalent: subscriptionTier,
      stars_granted: starAmount,
      allocation_timestamp: new Date().toISOString(),
      category: 'BONUS',
      promo_bonus_and_subscription: true, // Mark this as both bonus and subscription activation
    }

    const bonusResult = await directPaymentProcessor({
      telegram_id,
      amount: starAmount,
      type: PaymentType.MONEY_INCOME,
      description: `🎁 Promo: ${starAmount} stars + ${subscriptionTier} subscription`,
      bot_name,
      service_type: ModeEnum.StartScene,
      inv_id: `promo-bonus-${subscriptionTier}-${Date.now()}`,
      metadata: bonusMetadata,
      subscription_type: subscriptionTier, // This activates the subscription
    })

    if (bonusResult.success) {
      logger.info(
        '✅ [PromoHelper] Bonus stars given and subscription activated',
        {
          telegram_id,
          subscription_tier: subscriptionTier,
          promo_type: promoType,
          star_amount: starAmount,
          bonus_payment_id: bonusResult.payment_id,
        }
      )
      return true
    } else {
      logger.error(
        '❌ [PromoHelper] Failed to give bonus stars and activate subscription',
        {
          telegram_id,
          subscription_tier: subscriptionTier,
          promo_type: promoType,
          error: bonusResult.error,
        }
      )
      return false
    }
  } catch (error) {
    logger.error('❌ [PromoHelper] Exception in activatePromoSubscription', {
      telegram_id,
      subscription_tier: subscriptionTier,
      promo_type: promoType,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return false
  }
}

/**
 * Checks if a user has already received promo bonus and subscription of a specific type
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

    // Check for promo bonus+subscription payments (BONUS category with subscription)
    const { data: promoBonuses, error: bonusError } = await supabase
      .from('payments_v2')
      .select('id')
      .eq('telegram_id', telegram_id)
      .eq('category', 'BONUS')
      .eq('type', 'MONEY_INCOME')
      .contains('metadata', {
        is_promo: true,
        promo_type: promoType,
        promo_bonus_and_subscription: true,
      })
      .not('subscription_type', 'is', null)
      .limit(1)

    if (bonusError) {
      logger.error('❌ [PromoHelper] Error checking promo history', {
        telegram_id,
        promoType,
        error: bonusError.message,
      })
      return false
    }

    const hasReceived = promoBonuses && promoBonuses.length > 0

    logger.info('🔍 [PromoHelper] Promo check result', {
      telegram_id,
      promoType,
      hasReceived,
    })

    return hasReceived
  } catch (error) {
    logger.error('❌ [PromoHelper] Exception during promo check', {
      telegram_id,
      promoType,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return false // Assume not received on error to be safe
  }
}

/**
 * Processes promo link for a user - gives bonus stars and activates subscription
 * @param telegram_id - User's Telegram ID
 * @param promoType - Type of promo (neurovideo, neurophoto)
 * @param bot_name - Bot name for tracking
 * @returns Promise<boolean> - Success status
 */
export async function processPromoLink(
  telegram_id: string,
  promoType: string,
  bot_name: string = 'MetaMuse_Manifest_bot'
): Promise<boolean> {
  try {
    logger.info('🎁 [PromoHelper] Processing promo link', {
      telegram_id,
      promo_type: promoType,
      bot_name,
    })

    // Get promo configuration
    const config = getPromoConfig(promoType)
    if (!config) {
      logger.error('❌ [PromoHelper] Unknown promo type', {
        telegram_id,
        promo_type: promoType,
      })
      return false
    }

    // Check if user already received this promo
    const alreadyReceived = await hasReceivedPromo(
      telegram_id,
      config.promoType
    )
    if (alreadyReceived) {
      logger.info('🚫 [PromoHelper] User already received this promo', {
        telegram_id,
        promo_type: config.promoType,
      })
      return false
    }

    // Give bonus stars and activate subscription
    const success = await activatePromoSubscription(
      telegram_id,
      config.subscriptionTier,
      config.promoType,
      bot_name
    )

    if (success) {
      logger.info(
        '✅ [PromoHelper] Promo subscription activated successfully',
        {
          telegram_id,
          promo_type: config.promoType,
          subscription_tier: config.subscriptionTier,
        }
      )
    }

    return success
  } catch (error) {
    logger.error('❌ [PromoHelper] Error processing promo link', {
      telegram_id,
      promo_type: promoType,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return false
  }
}
