import { supabase } from '@/core/supabase/client'
import { logger } from '@/utils/logger'
import {
  Subscription,
  SubscriptionType,
  SubscriptionCreateParams,
  SubscriptionUpdateParams,
  SubscriptionOperationResult,
  SubscriptionValidationResult,
  SubscriptionRenewalParams,
  SUBSCRIPTION_ERROR_MESSAGES,
  SUBSCRIPTION_SUCCESS_MESSAGES,
  SUBSCRIPTION_DEFAULTS,
} from '@/interfaces/subscription.interface'

export const validateSubscription = async (
  params: SubscriptionCreateParams
): Promise<SubscriptionValidationResult> => {
  const errors: string[] = []

  if (!Object.values(SubscriptionType).includes(params.type)) {
    errors.push(SUBSCRIPTION_ERROR_MESSAGES.INVALID_TYPE)
  }

  if (
    params.duration_days < SUBSCRIPTION_DEFAULTS.MIN_DURATION_DAYS ||
    params.duration_days > SUBSCRIPTION_DEFAULTS.MAX_DURATION_DAYS
  ) {
    errors.push(SUBSCRIPTION_ERROR_MESSAGES.INVALID_DURATION)
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export const createSubscription = async (
  params: SubscriptionCreateParams
): Promise<SubscriptionOperationResult> => {
  try {
    logger.info('Creating subscription', { params })

    const validation = await validateSubscription(params)
    if (!validation.isValid) {
      return {
        success: false,
        message: SUBSCRIPTION_ERROR_MESSAGES.VALIDATION_FAILED,
        error: validation.errors.join(', '),
      }
    }

    const start_date = new Date()
    const end_date = new Date(
      start_date.getTime() + params.duration_days * 24 * 60 * 60 * 1000
    )

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .insert({
        telegram_id: params.telegram_id,
        type: params.type,
        start_date,
        end_date,
        is_active: true,
        metadata: params.metadata || {},
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating subscription', { error })
      return {
        success: false,
        message: error.message,
        error: error.message,
      }
    }

    logger.info('Subscription created successfully', { subscription })
    return {
      success: true,
      message: SUBSCRIPTION_SUCCESS_MESSAGES.CREATED,
      subscription,
    }
  } catch (error) {
    logger.error('Unexpected error creating subscription', { error })
    return {
      success: false,
      message: 'Unexpected error creating subscription',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const updateSubscription = async (
  id: string,
  params: SubscriptionUpdateParams
): Promise<SubscriptionOperationResult> => {
  try {
    logger.info('Updating subscription', { id, params })

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .update(params)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Error updating subscription', { error })
      return {
        success: false,
        message: error.message,
        error: error.message,
      }
    }

    logger.info('Subscription updated successfully', { subscription })
    return {
      success: true,
      message: SUBSCRIPTION_SUCCESS_MESSAGES.UPDATED,
      subscription,
    }
  } catch (error) {
    logger.error('Unexpected error updating subscription', { error })
    return {
      success: false,
      message: 'Unexpected error updating subscription',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const renewSubscription = async (
  params: SubscriptionRenewalParams
): Promise<SubscriptionOperationResult> => {
  try {
    logger.info('Renewing subscription', { params })

    const { data: existingSubscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select()
      .eq('telegram_id', params.telegram_id)
      .eq('type', params.type)
      .single()

    if (fetchError) {
      logger.error('Error fetching subscription for renewal', {
        error: fetchError,
      })
      return {
        success: false,
        message: SUBSCRIPTION_ERROR_MESSAGES.NOT_FOUND,
        error: fetchError.message,
      }
    }

    const currentEndDate = new Date(existingSubscription.end_date)
    const newEndDate = new Date(
      currentEndDate.getTime() + params.extend_days * 24 * 60 * 60 * 1000
    )

    const { data: subscription, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        end_date: newEndDate,
        is_active: true,
      })
      .eq('id', existingSubscription.id)
      .select()
      .single()

    if (updateError) {
      logger.error('Error renewing subscription', { error: updateError })
      return {
        success: false,
        message: SUBSCRIPTION_ERROR_MESSAGES.RENEWAL_FAILED,
        error: updateError.message,
      }
    }

    logger.info('Subscription renewed successfully', { subscription })
    return {
      success: true,
      message: SUBSCRIPTION_SUCCESS_MESSAGES.RENEWED,
      subscription,
    }
  } catch (error) {
    logger.error('Unexpected error renewing subscription', { error })
    return {
      success: false,
      message: 'Unexpected error renewing subscription',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const getActiveSubscription = async (
  telegram_id: string,
  type: SubscriptionType
): Promise<Subscription | null> => {
  try {
    logger.info('Getting active subscription', { telegram_id, type })

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select()
      .eq('telegram_id', telegram_id)
      .eq('type', type)
      .eq('is_active', true)
      .gt('end_date', new Date().toISOString())
      .single()

    if (error) {
      logger.error('Error getting active subscription', { error })
      return null
    }

    return subscription
  } catch (error) {
    logger.error('Unexpected error getting active subscription', { error })
    return null
  }
}

export const checkSubscriptionStatus = async (
  telegram_id: string,
  type: SubscriptionType
): Promise<boolean> => {
  const subscription = await getActiveSubscription(telegram_id, type)
  return subscription !== null
}
