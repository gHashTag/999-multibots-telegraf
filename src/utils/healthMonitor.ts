/**
 * Health Monitoring Utilities
 *
 * Provides comprehensive health monitoring for the bot farm,
 * including system metrics, database connectivity, and bot status.
 */

import { logger } from './logger'
import { supabase } from '@/core/supabase'

export interface HealthMetrics {
  timestamp: string
  system: {
    uptime: number
    memory: {
      used: number
      total: number
      percentage: number
    }
    cpu: {
      percentage: number
    }
    processes: {
      active: number
      total: number
    }
  }
  database: {
    isConnected: boolean
    responseTime: number
    lastError?: string
  }
  bots: {
    active: number
    total: number
    status: Array<{
      port: number
      isActive: boolean
      lastActivity?: string
    }>
  }
  errors: {
    critical: number
    warnings: number
    lastCritical?: string
  }
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'critical'
  metrics: HealthMetrics
  recommendations: string[]
}

/**
 * Performs comprehensive system health check
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now()
  const metrics: HealthMetrics = {
    timestamp: new Date().toISOString(),
    system: {
      uptime: process.uptime(),
      memory: getMemoryMetrics(),
      cpu: { percentage: 0 }, // Will be populated by system monitoring
      processes: { active: 0, total: 0 }
    },
    database: {
      isConnected: false,
      responseTime: 0
    },
    bots: {
      active: 0,
      total: 10,
      status: []
    },
    errors: {
      critical: 0,
      warnings: 0
    }
  }

  const recommendations: string[] = []

  try {
    // Check database connectivity
    const dbStartTime = Date.now()
    try {
      await supabase.from('users').select('count(*)', { count: 'exact', head: true })
      metrics.database.isConnected = true
      metrics.database.responseTime = Date.now() - dbStartTime

      if (metrics.database.responseTime > 1000) {
        recommendations.push('Database response time is high (>1s). Consider optimizing queries.')
      }
    } catch (dbError) {
      metrics.database.isConnected = false
      metrics.database.lastError = dbError instanceof Error ? dbError.message : String(dbError)
      recommendations.push('Database connection failed. Check Supabase status.')
    }

    // Check memory usage
    if (metrics.system.memory.percentage > 80) {
      recommendations.push('Memory usage is high (>80%). Consider restarting or investigating memory leaks.')
    }

    // Check system uptime
    if (metrics.system.uptime < 300) { // Less than 5 minutes
      recommendations.push('System recently restarted. Monitor for stability.')
    }

    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy'

    if (!metrics.database.isConnected || metrics.system.memory.percentage > 90) {
      status = 'critical'
    } else if (metrics.database.responseTime > 1000 || metrics.system.memory.percentage > 80) {
      status = 'degraded'
    }

    logger.info('[HealthMonitor] Health check completed', {
      status,
      responseTime: Date.now() - startTime,
      memoryUsage: metrics.system.memory.percentage,
      dbConnected: metrics.database.isConnected,
      dbResponseTime: metrics.database.responseTime
    })

    return { status, metrics, recommendations }

  } catch (error) {
    logger.error('[HealthMonitor] Health check failed', {
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    })

    return {
      status: 'critical',
      metrics,
      recommendations: ['Health check system failure. Immediate attention required.']
    }
  }
}

/**
 * Gets current memory usage metrics
 */
function getMemoryMetrics() {
  const memUsage = process.memoryUsage()
  const totalMemory = memUsage.heapTotal + memUsage.external + memUsage.arrayBuffers

  return {
    used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    total: Math.round(totalMemory / 1024 / 1024), // MB
    percentage: Math.round((memUsage.heapUsed / totalMemory) * 100)
  }
}

/**
 * Creates a health check endpoint response
 */
export async function createHealthEndpoint(): Promise<{
  timestamp: string
  status: string
  uptime: number
  database: boolean
  memory: string
  recommendations: string[]
}> {
  const healthCheck = await performHealthCheck()

  return {
    timestamp: healthCheck.metrics.timestamp,
    status: healthCheck.status,
    uptime: healthCheck.metrics.system.uptime,
    database: healthCheck.metrics.database.isConnected,
    memory: `${healthCheck.metrics.system.memory.percentage}%`,
    recommendations: healthCheck.recommendations
  }
}

/**
 * Logs health metrics for monitoring
 */
export async function logHealthMetrics(): Promise<void> {
  try {
    const healthCheck = await performHealthCheck()

    // Log metrics in a structured format for external monitoring
    logger.info('[HealthMetrics]', {
      status: healthCheck.status,
      timestamp: healthCheck.metrics.timestamp,
      memory_percentage: healthCheck.metrics.system.memory.percentage,
      memory_used_mb: healthCheck.metrics.system.memory.used,
      uptime_seconds: healthCheck.metrics.system.uptime,
      db_connected: healthCheck.metrics.database.isConnected,
      db_response_time_ms: healthCheck.metrics.database.responseTime,
      recommendations_count: healthCheck.recommendations.length
    })

    // Store critical issues in memory for other agents
    if (healthCheck.status === 'critical') {
      // This could be stored in claude-flow memory for other agents to see
      logger.error('[HealthCritical] System health is critical', {
        status: healthCheck.status,
        recommendations: healthCheck.recommendations
      })
    }

  } catch (error) {
    logger.error('[HealthMetrics] Failed to log health metrics', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Starts periodic health monitoring
 */
export function startHealthMonitoring(intervalMinutes: number = 5): NodeJS.Timeout {
  logger.info('[HealthMonitor] Starting periodic health monitoring', {
    intervalMinutes
  })

  return setInterval(async () => {
    await logHealthMetrics()
  }, intervalMinutes * 60 * 1000)
}

/**
 * Emergency health check for critical situations
 */
export async function emergencyHealthCheck(): Promise<boolean> {
  try {
    const healthCheck = await performHealthCheck()

    if (healthCheck.status === 'critical') {
      logger.error('[HealthEmergency] CRITICAL system health detected', {
        metrics: healthCheck.metrics,
        recommendations: healthCheck.recommendations
      })
      return false
    }

    return true
  } catch (error) {
    logger.error('[HealthEmergency] Emergency health check failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}