/**
 * Database Connection Pool Monitor
 *
 * Provides monitoring and optimization for Supabase database connections,
 * detecting issues and providing automatic recovery mechanisms.
 */

import { logger } from './logger'
import { supabase } from '@/core/supabase'

export interface DatabasePoolMetrics {
  timestamp: string
  connections: {
    active: number
    idle: number
    total: number
    maxConnections: number
  }
  performance: {
    averageResponseTime: number
    slowQueries: number
    failedQueries: number
    totalQueries: number
  }
  health: {
    status: 'healthy' | 'degraded' | 'critical'
    lastError?: string
    consecutiveFailures: number
  }
}

export interface QueryMetrics {
  queryId: string
  operation: string
  duration: number
  success: boolean
  error?: string
  timestamp: string
}

class DatabaseMonitor {
  private metrics: DatabasePoolMetrics
  private queryHistory: QueryMetrics[] = []
  private consecutiveFailures = 0
  private readonly maxHistorySize = 100
  private readonly slowQueryThreshold = 1000 // ms

  constructor() {
    this.metrics = {
      timestamp: new Date().toISOString(),
      connections: {
        active: 0,
        idle: 0,
        total: 0,
        maxConnections: 10 // Default Supabase pool size
      },
      performance: {
        averageResponseTime: 0,
        slowQueries: 0,
        failedQueries: 0,
        totalQueries: 0
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0
      }
    }
  }

  /**
   * Monitors a database query and records metrics
   */
  async monitorQuery<T>(
    operation: string,
    queryFunction: () => Promise<T>
  ): Promise<T> {
    const queryId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const startTime = Date.now()

    try {
      logger.debug('[DatabaseMonitor] Starting query', {
        queryId,
        operation,
        timestamp: new Date().toISOString()
      })

      const result = await queryFunction()
      const duration = Date.now() - startTime

      // Record successful query
      this.recordQuery({
        queryId,
        operation,
        duration,
        success: true,
        timestamp: new Date().toISOString()
      })

      this.consecutiveFailures = 0
      this.updateHealthStatus()

      if (duration > this.slowQueryThreshold) {
        logger.warn('[DatabaseMonitor] Slow query detected', {
          queryId,
          operation,
          duration,
          threshold: this.slowQueryThreshold
        })
      }

      return result

    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Record failed query
      this.recordQuery({
        queryId,
        operation,
        duration,
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      })

      this.consecutiveFailures++
      this.updateHealthStatus()

      logger.error('[DatabaseMonitor] Query failed', {
        queryId,
        operation,
        duration,
        error: errorMessage,
        consecutiveFailures: this.consecutiveFailures
      })

      throw error
    }
  }

  /**
   * Records query metrics and maintains history
   */
  private recordQuery(queryMetrics: QueryMetrics): void {
    this.queryHistory.push(queryMetrics)

    // Maintain history size limit
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory = this.queryHistory.slice(-this.maxHistorySize)
    }

    // Update performance metrics
    this.updatePerformanceMetrics()
  }

  /**
   * Updates aggregated performance metrics
   */
  private updatePerformanceMetrics(): void {
    const recentQueries = this.queryHistory.slice(-50) // Last 50 queries

    if (recentQueries.length === 0) return

    const totalDuration = recentQueries.reduce((sum, query) => sum + query.duration, 0)
    const successfulQueries = recentQueries.filter(q => q.success)
    const failedQueries = recentQueries.filter(q => !q.success)
    const slowQueries = recentQueries.filter(q => q.duration > this.slowQueryThreshold)

    this.metrics.performance = {
      averageResponseTime: Math.round(totalDuration / recentQueries.length),
      slowQueries: slowQueries.length,
      failedQueries: failedQueries.length,
      totalQueries: recentQueries.length
    }

    this.metrics.timestamp = new Date().toISOString()
  }

  /**
   * Updates overall health status
   */
  private updateHealthStatus(): void {
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy'

    // Critical conditions
    if (this.consecutiveFailures >= 5) {
      status = 'critical'
    }
    // Degraded conditions
    else if (
      this.consecutiveFailures >= 2 ||
      this.metrics.performance.averageResponseTime > 2000 ||
      (this.metrics.performance.totalQueries > 10 &&
       this.metrics.performance.failedQueries / this.metrics.performance.totalQueries > 0.1)
    ) {
      status = 'degraded'
    }

    this.metrics.health = {
      status,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.queryHistory
        .slice()
        .reverse()
        .find(q => !q.success)?.error
    }

    // Log status changes
    if (status !== 'healthy') {
      logger.warn('[DatabaseMonitor] Database health degraded', {
        status,
        consecutiveFailures: this.consecutiveFailures,
        avgResponseTime: this.metrics.performance.averageResponseTime,
        failureRate: this.metrics.performance.totalQueries > 0
          ? this.metrics.performance.failedQueries / this.metrics.performance.totalQueries
          : 0
      })
    }
  }

  /**
   * Performs a connection health check
   */
  async performHealthCheck(): Promise<DatabasePoolMetrics> {
    try {
      // Test basic connectivity
      await this.monitorQuery('health_check', async () => {
        const { data, error } = await supabase
          .from('users')
          .select('count(*)', { count: 'exact', head: true })

        if (error) throw error
        return data
      })

      return this.metrics

    } catch (error) {
      logger.error('[DatabaseMonitor] Health check failed', {
        error: error instanceof Error ? error.message : String(error)
      })

      return this.metrics
    }
  }

  /**
   * Gets current metrics
   */
  getMetrics(): DatabasePoolMetrics {
    return { ...this.metrics }
  }

  /**
   * Gets recent query history
   */
  getQueryHistory(limit: number = 20): QueryMetrics[] {
    return this.queryHistory.slice(-limit)
  }

  /**
   * Resets monitoring data
   */
  reset(): void {
    this.queryHistory = []
    this.consecutiveFailures = 0
    this.metrics.performance = {
      averageResponseTime: 0,
      slowQueries: 0,
      failedQueries: 0,
      totalQueries: 0
    }
    this.metrics.health = {
      status: 'healthy',
      consecutiveFailures: 0
    }
    this.metrics.timestamp = new Date().toISOString()

    logger.info('[DatabaseMonitor] Monitoring data reset')
  }

  /**
   * Gets performance recommendations
   */
  getRecommendations(): string[] {
    const recommendations: string[] = []

    if (this.metrics.health.status === 'critical') {
      recommendations.push('CRITICAL: Database connection failures detected. Check Supabase status immediately.')
    }

    if (this.metrics.performance.averageResponseTime > 2000) {
      recommendations.push('High average response time. Consider optimizing queries or checking network.')
    }

    if (this.metrics.performance.slowQueries > 5) {
      recommendations.push('Multiple slow queries detected. Review and optimize database queries.')
    }

    if (this.metrics.performance.totalQueries > 10) {
      const failureRate = this.metrics.performance.failedQueries / this.metrics.performance.totalQueries
      if (failureRate > 0.1) {
        recommendations.push(`High failure rate (${Math.round(failureRate * 100)}%). Investigate query issues.`)
      }
    }

    return recommendations
  }
}

// Global database monitor instance
export const databaseMonitor = new DatabaseMonitor()

// Convenience functions for common operations
export const monitoredSupabaseQuery = <T>(
  operation: string,
  queryFunction: () => Promise<T>
): Promise<T> => {
  return databaseMonitor.monitorQuery(operation, queryFunction)
}

/**
 * Enhanced Supabase wrapper with monitoring
 */
export const monitoredSupabase = {
  /**
   * Monitor a select query
   */
  async select<T = any>(
    table: string,
    query: any,
    operation: string = `select_${table}`
  ): Promise<T> {
    return monitoredSupabaseQuery(operation, async () => {
      const { data, error } = await supabase.from(table).select(query)
      if (error) throw error
      return data
    })
  },

  /**
   * Monitor an insert query
   */
  async insert<T = any>(
    table: string,
    data: any,
    operation: string = `insert_${table}`
  ): Promise<T> {
    return monitoredSupabaseQuery(operation, async () => {
      const { data: result, error } = await supabase.from(table).insert(data).select()
      if (error) throw error
      return result
    })
  },

  /**
   * Monitor an update query
   */
  async update<T = any>(
    table: string,
    data: any,
    condition: any,
    operation: string = `update_${table}`
  ): Promise<T> {
    return monitoredSupabaseQuery(operation, async () => {
      const { data: result, error } = await supabase.from(table).update(data).match(condition).select()
      if (error) throw error
      return result
    })
  },

  /**
   * Monitor a delete query
   */
  async delete<T = any>(
    table: string,
    condition: any,
    operation: string = `delete_${table}`
  ): Promise<T> {
    return monitoredSupabaseQuery(operation, async () => {
      const { data, error } = await supabase.from(table).delete().match(condition).select()
      if (error) throw error
      return data
    })
  }
}

/**
 * Start periodic database monitoring
 */
export function startDatabaseMonitoring(intervalMinutes: number = 5): NodeJS.Timeout {
  logger.info('[DatabaseMonitor] Starting periodic monitoring', { intervalMinutes })

  return setInterval(async () => {
    try {
      const metrics = await databaseMonitor.performHealthCheck()
      const recommendations = databaseMonitor.getRecommendations()

      logger.info('[DatabaseMonitor] Periodic check completed', {
        status: metrics.health.status,
        avgResponseTime: metrics.performance.averageResponseTime,
        totalQueries: metrics.performance.totalQueries,
        failedQueries: metrics.performance.failedQueries,
        consecutiveFailures: metrics.health.consecutiveFailures,
        recommendationsCount: recommendations.length
      })

      if (recommendations.length > 0) {
        logger.warn('[DatabaseMonitor] Performance recommendations available', {
          recommendations
        })
      }

    } catch (error) {
      logger.error('[DatabaseMonitor] Periodic monitoring failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }, intervalMinutes * 60 * 1000)
}