import { PaymentType } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { logger } from '@/utils/logger'

/**
 * Configuration for different promo types
 */
export interface PromoConfig {
  stars: number
  subscriptionTier: SubscriptionType
}

/**
 * Default promo configurations
 */
const PROMO_CONFIGS: Record<string, PromoConfig> = {
  neurovideo_promo: {
    stars: 1303,
    subscriptionTier: SubscriptionType.NEUROVIDEO,
  },
  neurophoto_promo: {
    stars: 476,
    subscriptionTier: SubscriptionType.NEUROPHOTO,
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
 * Allocates promo stars to a user
 * @param telegram_id - User's Telegram ID
 * @param stars - Number of stars to allocate
 * @param subscriptionTier - Subscription tier equivalent
 * @param promoType - Type of promo
 * @param bot_name - Bot name for tracking
 * @returns Promise<boolean> - Success status
 */
async function allocatePromoStars(
  telegram_id: string,
  stars: number,
  subscriptionTier: SubscriptionType,
  promoType: string,
  bot_name: string
): Promise<boolean> {
  try {
    const { directPaymentProcessor } = await import(
      '@/core/supabase/directPayment'
    )

    const metadata = {
      is_promo: true,
      promo_type: promoType,
      subscription_tier_equivalent: subscriptionTier,
      stars_granted: stars,
      allocation_timestamp: new Date().toISOString(),
      category: 'BONUS',
      direct_payment: true,
    }

    const result = await directPaymentProcessor(
      telegram_id,
      stars,
      PaymentType.MONEY_INCOME,
      `🎁 Promo bonus: ${stars} stars`,
      metadata,
      bot_name,
      `promo-${promoType}-${Date.now()}`
    )

    if (result.success) {
      logger.info('✅ [PromoHelper] Promo stars allocated successfully', {
        telegram_id,
        stars,
        promo_type: promoType,
        subscription_tier: subscriptionTier,
      })
      return true
    } else {
      logger.error('❌ [PromoHelper] Failed to allocate promo stars', {
        telegram_id,
        stars,
        promo_type: promoType,
        error: result.error,
      })
      return false
    }
  } catch (error) {
    logger.error('❌ [PromoHelper] Exception in allocatePromoStars', {
      telegram_id,
      stars,
      promo_type: promoType,
      error: error instanceof Error ? error.message : 'Unknown error',
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

    // Check for promo stars (BONUS category)
    const { data: promoStars, error: starsError } = await supabase
      .from('payments_v2')
      .select('id')
      .eq('telegram_id', telegram_id)
      .eq('type', PaymentType.MONEY_INCOME)
      .eq('category', 'BONUS')
      .contains('metadata', { is_promo: true, promo_type: promoType })
      .limit(1)

    if (starsError) {
      logger.error('❌ [PromoHelper] Error checking promo history', {
        telegram_id,
        promoType,
        error: starsError.message,
      })
      return false
    }

    const hasReceived = promoStars && promoStars.length > 0

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
 * @param promoType - Type of promo (default: 'neurovideo_promo')
 * @param bot_name - Bot name for tracking
 * @returns Promise<boolean> - Success status
 */
export async function processPromoLink(
  telegram_id: string,
  promoType: string = 'neurovideo_promo',
  bot_name: string = 'MetaMuse_Manifest_bot'
): Promise<boolean> {
  try {
    logger.info('🎁 [PromoHelper] Processing promo link', {
      telegram_id,
      promo_type: promoType,
      bot_name,
    })

    // Check if user already received this promo
    const alreadyReceived = await hasReceivedPromo(telegram_id, promoType)
    if (alreadyReceived) {
      logger.info('🚫 [PromoHelper] User already received this promo', {
        telegram_id,
        promo_type: promoType,
      })
      return false
    }

    // Get promo configuration
    const config = getPromoConfig(promoType)
    if (!config) {
      logger.error('❌ [PromoHelper] Unknown promo type', {
        telegram_id,
        promo_type: promoType,
      })
      return false
    }

    // Allocate promo stars
    const success = await allocatePromoStars(
      telegram_id,
      config.stars,
      config.subscriptionTier,
      promoType,
      bot_name
    )

    if (success) {
      logger.info('✅ [PromoHelper] Promo processed successfully', {
        telegram_id,
        promo_type: promoType,
        stars_granted: config.stars,
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
