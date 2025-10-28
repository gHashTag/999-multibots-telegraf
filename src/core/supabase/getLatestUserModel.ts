import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'
import { ModelTraining } from '@/interfaces'

export async function getLatestUserModel(
  telegram_id: number,
  api: string
): Promise<ModelTraining | null> {
  try {
    const { data, error } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('status', 'SUCCESS')
      .eq('api', api)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    logger.debug(data, 'getLatestUserModel')
    if (error) {
      logger.error('Error getting user model:', error)
      return null
    }

    return data as ModelTraining
  } catch (error) {
    logger.error('Error getting user model:', error)
    return null
  }
}
