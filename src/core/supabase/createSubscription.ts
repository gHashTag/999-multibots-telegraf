import { supabase } from '@/core/supabase/client'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { TelegramId } from '@/types/common'
import { normalizeId } from '@/utils/normalizeId'
import { logger } from '@/utils/logger'

export interface CreateSubscriptionParams {
  telegram_id: TelegramId
  type: SubscriptionType
  start_date?: Date
  end_date?: Date
  is_active?: boolean
  metadata?: Record<string, any>
}

export interface CreateSubscriptionResult {
  success: boolean
  data?: any
  error?: string
}

/**
 * Creates a new subscription for a user
 * @param params Parameters for creating a subscription
 * @returns Result of the subscription creation
 */
export const createSubscription = async (
  params: CreateSubscriptionParams
): Promise<CreateSubscriptionResult> => {
  try {
    const normalizedTelegramId = normalizeId(params.telegram_id)

    logger.info('Creating subscription', {
      telegram_id: normalizedTelegramId,
      type: params.type,
    })

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', normalizedTelegramId)
      .single()

    if (!existingUser) {
      logger.error('User not found', { telegram_id: normalizedTelegramId })
      return {
        success: false,
        error: 'User not found',
      }
    }

    // Create subscription
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        telegram_id: normalizedTelegramId,
        type: params.type,
        start_date: params.start_date || new Date(),
        end_date: params.end_date,
        is_active: params.is_active ?? true,
        metadata: params.metadata,
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating subscription', {
        error,
        params,
      })
      return {
        success: false,
        error: error.message,
      }
    }

    logger.info('Subscription created successfully', {
      telegram_id: normalizedTelegramId,
      type: params.type,
      subscription_id: data.id,
    })

    return {
      success: true,
      data,
    }
  } catch (error) {
    logger.error('Unexpected error creating subscription', {
      error,
      params,
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
