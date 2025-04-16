import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

export interface SubscriptionPlan {
  id: string
  name: string
  name_ru: string
  description_en: string
  description_ru: string
  short_desc_en: string
  short_desc_ru: string
  url?: string
}

/**
 * Получает планы подписок из базы данных
 */
export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  try {
    logger.info('🔍 Fetching subscription plans', {
      description: 'Getting subscription plans from database',
    })

    const { data: plans, error } = await supabase
      .from('plans')
      .select('*')
      .order('loka', { ascending: true })

    if (error) {
      throw error
    }

    logger.info('✅ Subscription plans fetched', {
      description: 'Successfully retrieved subscription plans',
      count: plans?.length || 0,
    })

    return plans || []
  } catch (error) {
    logger.error('❌ Error fetching subscription plans:', {
      description: 'Failed to get subscription plans',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return []
  }
}
