import { supabase } from './supabaseClient'
import { ServiceStats, ServiceStatsUpdate } from '../../types/service.types'
import { logger } from '../logger'

/**
 * Get statistics for a specific service type
 */
export async function getServiceStats(
  serviceType: string
): Promise<ServiceStats | null> {
  try {
    const { data, error } = await supabase.rpc('get_service_stats', {
      p_service_type: serviceType,
    })

    if (error) {
      logger.error('Error getting service stats:', { error, serviceType })
      return null
    }

    return data as ServiceStats
  } catch (error) {
    logger.error('Exception getting service stats:', { error, serviceType })
    return null
  }
}

/**
 * Update statistics for a service
 */
export async function updateServiceStats(
  stats: ServiceStatsUpdate
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('update_service_stats', {
      p_service_type: stats.service_type,
      p_success: stats.success,
      p_response_time: stats.response_time,
    })

    if (error) {
      logger.error('Error updating service stats:', { error, stats })
      return false
    }

    return true
  } catch (error) {
    logger.error('Exception updating service stats:', { error, stats })
    return false
  }
}

/**
 * Get statistics for all services
 */
export async function getAllServicesStats(): Promise<
  Record<string, ServiceStats>
> {
  try {
    const { data, error } = await supabase
      .from('service_usage_stats')
      .select('*')

    if (error) {
      logger.error('Error getting all service stats:', error)
      return {}
    }

    return data.reduce(
      (acc, stat) => {
        acc[stat.service_type] = stat
        return acc
      },
      {} as Record<string, ServiceStats>
    )
  } catch (error) {
    logger.error('Exception getting all service stats:', error)
    return {}
  }
}
