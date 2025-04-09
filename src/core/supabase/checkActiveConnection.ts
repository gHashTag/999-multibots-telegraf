import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

export async function checkActiveConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('users').select('id').limit(1)

    if (error) {
      logger.error('Error checking Supabase connection:', error)
      return false
    }

    return true
  } catch (error) {
    logger.error('Error checking Supabase connection:', error)
    return false
  }
}
