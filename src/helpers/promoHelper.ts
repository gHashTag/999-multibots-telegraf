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
 * Activates promo subscription for a user by:
 * 1. First allocating bonus stars to user balance
 * 2. Then activating subscription by spending those stars
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

    logger.info('🎁 [PromoHelper] Starting promo subscription activation', {
      telegram_id,
      subscription_tier: subscriptionTier,
      promo_type: promoType,
      star_amount: starAmount,
    })

    // STEP 1: Allocate bonus stars to user balance
    const bonusMetadata = {
      is_promo: true,
      promo_type: promoType,
      subscription_tier_equivalent: subscriptionTier,
      stars_granted: starAmount,
      allocation_timestamp: new Date().toISOString(),
      category: 'BONUS',
    }

    const bonusResult = await directPaymentProcessor({
      telegram_id,
      amount: starAmount,
      type: PaymentType.MONEY_INCOME,
      description: `🎁 Promo bonus: ${starAmount} stars (${subscriptionTier})`,
      bot_name,
      service_type: ModeEnum.StartScene,
      inv_id: `promo-bonus-${subscriptionTier}-${Date.now()}`,
      metadata: bonusMetadata,
    })

    if (!bonusResult.success) {
      logger.error('❌ [PromoHelper] Failed to allocate bonus stars', {
        telegram_id,
        subscription_tier: subscriptionTier,
        promo_type: promoType,
        error: bonusResult.error,
      })
      return false
    }

    logger.info('✅ [PromoHelper] Bonus stars allocated successfully', {
      telegram_id,
      subscription_tier: subscriptionTier,
      promo_type: promoType,
      star_amount: starAmount,
      bonus_payment_id: bonusResult.payment_id,
    })

    // STEP 2: Activate subscription by spending the bonus stars
    const subscriptionMetadata = {
      is_promo_subscription: true,
      is_auto_activation: true,
      promo_type: promoType,
      subscription_type: subscriptionTier,
      promo_activation: true,
      activation_timestamp: new Date().toISOString(),
      category: 'REAL', // Subscription activation is REAL transaction
    }

    const subscriptionResult = await directPaymentProcessor({
      telegram_id,
      amount: starAmount,
      type: PaymentType.MONEY_OUTCOME,
      description: `🎯 Auto-activated subscription: ${subscriptionTier} (from promo)`,
      bot_name,
      service_type: ModeEnum.StartScene,
      inv_id: `promo-sub-${subscriptionTier}-${Date.now()}`,
      metadata: subscriptionMetadata,
      subscription_type: subscriptionTier, // This creates the subscription
    })

    if (subscriptionResult.success) {
      logger.info(
        '✅ [PromoHelper] Promo subscription activated successfully',
        {
          telegram_id,
          subscription_tier: subscriptionTier,
          promo_type: promoType,
          star_amount: starAmount,
          bonus_payment_id: bonusResult.payment_id,
          subscription_payment_id: subscriptionResult.payment_id,
        }
      )
      return true
    } else {
      logger.error('❌ [PromoHelper] Failed to activate subscription', {
        telegram_id,
        subscription_tier: subscriptionTier,
        promo_type: promoType,
        error: subscriptionResult.error,
      })
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
 * Checks if a user has already received promo subscription of a specific type
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

    // Check for free promo subscriptions (BONUS category with subscription)
    const { data: promoSubs, error: subsError } = await supabase
      .from('payments_v2')
      .select('id')
      .eq('telegram_id', telegram_id)
      .eq('category', 'BONUS')
      .contains('metadata', {
        is_promo_subscription: true,
        promo_activation: true,
        promo_type: promoType,
      })
      .not('subscription_type', 'is', null)
      .limit(1)

    if (subsError) {
      logger.error(
        '❌ [PromoHelper] Error checking promo subscription history',
        {
          telegram_id,
          promoType,
          error: subsError.message,
        }
      )
      return false
    }

    const hasReceived = promoSubs && promoSubs.length > 0

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
 * Processes promo link for a user
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

    // Check if user already has an active subscription
    const { getUserDetailsSubscription } = await import(
      '@/core/supabase/getUserDetailsSubscription'
    )
    const userDetails = await getUserDetailsSubscription(telegram_id)

    if (userDetails.isSubscriptionActive) {
      logger.info(
        '🔄 [PromoHelper] User already has active subscription, skipping promo',
        {
          telegram_id,
          currentSubscription: userDetails.subscriptionType,
          requestedPromo: config.subscriptionTier,
        }
      )
      return false
    }

    // Activate free promo subscription
    const success = await activatePromoSubscription(
      telegram_id,
      config.subscriptionTier,
      config.promoType,
      bot_name
    )

    if (success) {
      logger.info('✅ [PromoHelper] Promo processed successfully', {
        telegram_id,
        promo_type: config.promoType,
        subscription_tier: config.subscriptionTier,
      })
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
