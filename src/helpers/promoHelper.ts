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
  /** Whether to auto-activate subscription if user has enough stars */
  autoActivateSubscription?: boolean
}

/**
 * Default promo configuration - grants stars equivalent to NEUROPHOTO subscription
 */
export const DEFAULT_PROMO_CONFIG: PromoConfig = {
  defaultTier: SubscriptionType.NEUROPHOTO,
  promoType: 'welcome_bonus',
  autoActivateSubscription: true, // Auto-activate subscription by default
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
      autoActivateSubscription: config.autoActivateSubscription,
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

    if (!result.success) {
      logger.error('❌ [PromoHelper] Failed to allocate promo stars', {
        telegram_id,
        error: result.error,
        function: 'allocatePromoStars',
      })
      return false
    }

    logger.info('✅ [PromoHelper] Promo stars allocated successfully', {
      telegram_id,
      starAmount,
      paymentId: result.payment_id,
      operationId: result.operation_id,
      balanceChange: result.balanceChange,
      function: 'allocatePromoStars',
    })

    // Auto-activate subscription if enabled and user has enough stars
    if (config.autoActivateSubscription) {
      await autoActivateSubscriptionIfEligible(
        telegram_id,
        config.defaultTier,
        bot_name
      )
    }

    return true
  } catch (error) {
    logger.error('❌ [PromoHelper] Error allocating promo stars', {
      telegram_id,
      error: error instanceof Error ? error.message : String(error),
      function: 'allocatePromoStars',
    })
    return false
  }
}

/**
 * Auto-activates subscription if user has enough stars for the tier
 * @param telegram_id - User's Telegram ID
 * @param tier - Subscription tier to activate
 * @param bot_name - Bot name for tracking
 */
async function autoActivateSubscriptionIfEligible(
  telegram_id: string,
  tier: SubscriptionType,
  bot_name: string
): Promise<void> {
  try {
    const { getUserBalance } = await import('@/core/supabase/getUserBalance')
    const { getUserDetailsSubscription } = await import(
      '@/core/supabase/getUserDetailsSubscription'
    )

    // Get current user details
    const userDetails = await getUserDetailsSubscription(telegram_id)

    // Skip if user already has an active subscription
    if (userDetails.isSubscriptionActive) {
      logger.info(
        '🔄 [PromoHelper] User already has active subscription, skipping auto-activation',
        {
          telegram_id,
          currentSubscription: userDetails.subscriptionType,
          function: 'autoActivateSubscriptionIfEligible',
        }
      )
      return
    }

    // Find the tier plan to get required stars
    const tierPlan = paymentOptionsPlans.find(
      plan => plan.subscription === tier
    )
    if (!tierPlan) {
      logger.error('❌ [PromoHelper] Tier plan not found for auto-activation', {
        telegram_id,
        tier,
        function: 'autoActivateSubscriptionIfEligible',
      })
      return
    }

    const requiredStars = parseInt(tierPlan.stars)
    const currentBalance = userDetails.stars

    // Check if user has enough stars
    if (currentBalance >= requiredStars) {
      logger.info(
        '🎯 [PromoHelper] User has enough stars, auto-activating subscription',
        {
          telegram_id,
          tier,
          requiredStars,
          currentBalance,
          function: 'autoActivateSubscriptionIfEligible',
        }
      )

      // Create subscription payment record
      const subscriptionResult = await directPaymentProcessor({
        telegram_id,
        amount: requiredStars,
        type: PaymentType.MONEY_OUTCOME,
        description: `🎁 Auto-activated subscription: ${tier}`,
        bot_name,
        service_type: ModeEnum.StartScene,
        inv_id: `auto-sub-${tier}-${Date.now()}`,
        metadata: {
          is_auto_activation: true,
          subscription_type: tier,
          promo_activation: true,
          activation_timestamp: new Date().toISOString(),
          category: 'REAL', // This is a real subscription activation
          subscription_type_field: tier, // Add subscription_type to metadata
        },
        // Add subscription_type directly to the payment record
        subscription_type: tier,
      })

      if (subscriptionResult.success) {
        logger.info(
          '✅ [PromoHelper] Subscription auto-activated successfully',
          {
            telegram_id,
            tier,
            paymentId: subscriptionResult.payment_id,
            operationId: subscriptionResult.operation_id,
            balanceChange: subscriptionResult.balanceChange,
            function: 'autoActivateSubscriptionIfEligible',
          }
        )
      } else {
        logger.error('❌ [PromoHelper] Failed to auto-activate subscription', {
          telegram_id,
          tier,
          error: subscriptionResult.error,
          function: 'autoActivateSubscriptionIfEligible',
        })
      }
    } else {
      logger.info(
        '💫 [PromoHelper] User does not have enough stars for auto-activation',
        {
          telegram_id,
          tier,
          requiredStars,
          currentBalance,
          deficit: requiredStars - currentBalance,
          function: 'autoActivateSubscriptionIfEligible',
        }
      )
    }
  } catch (error) {
    logger.error('❌ [PromoHelper] Error in auto-activation check', {
      telegram_id,
      tier,
      error: error instanceof Error ? error.message : String(error),
      function: 'autoActivateSubscriptionIfEligible',
    })
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
 * @param isRu - Language preference (default: true for Russian)
 * @returns Promise<{ success: boolean; message: string; alreadyReceived?: boolean }>
 */
export async function processPromoLink(
  telegram_id: string,
  promoParameter: string = '',
  bot_name: string = 'MetaMuse_Manifest_bot',
  isRu: boolean = true
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
        message: isRu
          ? 'Вы уже получили этот промо-бонус!'
          : 'You have already received this promotional bonus!',
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
        message: isRu
          ? `🎁 Приветственный бонус получен! Вы получили ${starAmount} бесплатных звезд!`
          : `🎁 Welcome bonus received! You got ${starAmount} free stars!`,
      }
    } else {
      return {
        success: false,
        message: isRu
          ? 'Не удалось обработать промо-бонус. Попробуйте позже.'
          : 'Failed to process promotional bonus. Please try again later.',
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
      message: isRu
        ? 'Произошла ошибка при обработке промо-бонуса.'
        : 'An error occurred while processing your promotional bonus.',
    }
  }
}
