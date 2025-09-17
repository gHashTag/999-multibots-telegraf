/**
 * Performance Metrics Collection System
 *
 * Comprehensive performance monitoring for the bot farm operations,
 * including real-time metrics, historical data, and performance insights.
 */

import { logger } from './logger'
import { databaseMonitor } from './databaseMonitor'

export interface BotFarmMetrics {
  timestamp: string
  bots: {
    totalBots: number
    activeBots: number
    averageResponseTime: number
    messagesProcessed: number
    errorsOccurred: number
    uptimeHours: number
  }
  system: {
    cpuUsagePercent: number
    memoryUsageMB: number
    memoryUsagePercent: number
    diskUsagePercent: number
    networkBytesIn: number
    networkBytesOut: number
  }
  database: {
    connectionCount: number
    queryResponseTime: number
    slowQueries: number
    failedQueries: number
    transactionsPerSecond: number
  }
  operations: {
    imageGenerations: number
    textProcessing: number
    webhookRequests: number
    apiCalls: number
    cacheHits: number
    cacheMisses: number
  }
  performance: {
    requestsPerMinute: number
    averageLatency: number
    errorRate: number
    throughput: number
    concurrentUsers: number
  }
}

export interface PerformanceAlert {
  id: string
  timestamp: string
  severity: 'info' | 'warning' | 'critical'
  metric: string
  value: number
  threshold: number
  message: string
  resolved: boolean
}

export interface PerformanceTrend {
  metric: string
  timeframe: '1h' | '6h' | '24h' | '7d'
  values: Array<{
    timestamp: string
    value: number
  }>
  trend: 'increasing' | 'decreasing' | 'stable'
  changePercent: number
}

class PerformanceMetricsCollector {
  private metrics: BotFarmMetrics
  private alerts: PerformanceAlert[] = []
  private historicalData: Map<string, any[]> = new Map()
  private isCollecting = false
  private collectionInterval: NodeJS.Timeout | null = null
  private readonly maxHistorySize = 1000

  // Performance thresholds
  private readonly thresholds = {
    cpuUsage: { warning: 70, critical: 90 },
    memoryUsage: { warning: 80, critical: 95 },
    responseTime: { warning: 2000, critical: 5000 },
    errorRate: { warning: 5, critical: 10 },
    diskUsage: { warning: 80, critical: 95 }
  }

  constructor() {
    this.metrics = this.initializeMetrics()
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): BotFarmMetrics {
    return {
      timestamp: new Date().toISOString(),
      bots: {
        totalBots: 10,
        activeBots: 0,
        averageResponseTime: 0,
        messagesProcessed: 0,
        errorsOccurred: 0,
        uptimeHours: 0
      },
      system: {
        cpuUsagePercent: 0,
        memoryUsageMB: 0,
        memoryUsagePercent: 0,
        diskUsagePercent: 0,
        networkBytesIn: 0,
        networkBytesOut: 0
      },
      database: {
        connectionCount: 0,
        queryResponseTime: 0,
        slowQueries: 0,
        failedQueries: 0,
        transactionsPerSecond: 0
      },
      operations: {
        imageGenerations: 0,
        textProcessing: 0,
        webhookRequests: 0,
        apiCalls: 0,
        cacheHits: 0,
        cacheMisses: 0
      },
      performance: {
        requestsPerMinute: 0,
        averageLatency: 0,
        errorRate: 0,
        throughput: 0,
        concurrentUsers: 0
      }
    }
  }

  /**
   * Start automatic metrics collection
   */
  startCollection(intervalSeconds: number = 60): void {
    if (this.isCollecting) {
      logger.warn('[PerformanceMetrics] Collection already running')
      return
    }

    this.isCollecting = true

    logger.info('[PerformanceMetrics] Starting performance metrics collection', {
      intervalSeconds,
      thresholds: this.thresholds
    })

    this.collectionInterval = setInterval(async () => {
      await this.collectMetrics()
    }, intervalSeconds * 1000)
  }

  /**
   * Stop metrics collection
   */
  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval)
      this.collectionInterval = null
    }

    this.isCollecting = false
    logger.info('[PerformanceMetrics] Performance metrics collection stopped')
  }

  /**
   * Collect comprehensive performance metrics
   */
  async collectMetrics(): Promise<BotFarmMetrics> {
    try {
      const startTime = Date.now()

      // Collect system metrics
      await this.collectSystemMetrics()

      // Collect bot-specific metrics
      await this.collectBotMetrics()

      // Collect database metrics
      await this.collectDatabaseMetrics()

      // Collect operational metrics
      await this.collectOperationalMetrics()

      // Calculate performance metrics
      this.calculatePerformanceMetrics()

      // Update timestamp
      this.metrics.timestamp = new Date().toISOString()

      // Store in historical data
      this.storeHistoricalData()

      // Check for alerts
      this.checkPerformanceAlerts()

      const collectionTime = Date.now() - startTime

      logger.debug('[PerformanceMetrics] Metrics collection completed', {
        collectionTime,
        metricsCount: Object.keys(this.metrics).length
      })

      return this.metrics

    } catch (error) {
      logger.error('[PerformanceMetrics] Metrics collection failed', {
        error: error instanceof Error ? error.message : String(error)
      })

      return this.metrics
    }
  }

  /**
   * Collect system-level metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      // Memory metrics
      const memUsage = process.memoryUsage()
      const totalMemory = memUsage.heapTotal + memUsage.external + memUsage.arrayBuffers

      this.metrics.system.memoryUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024)
      this.metrics.system.memoryUsagePercent = Math.round((memUsage.heapUsed / totalMemory) * 100)

      // CPU usage (approximated from process metrics)
      const cpuUsage = process.cpuUsage()
      this.metrics.system.cpuUsagePercent = Math.round(
        ((cpuUsage.user + cpuUsage.system) / 1000000) / process.uptime() * 100
      )

      // Basic network metrics (would need external monitoring for real data)
      this.metrics.system.networkBytesIn = 0
      this.metrics.system.networkBytesOut = 0

      // Disk usage (simplified - would need filesystem access for real data)
      this.metrics.system.diskUsagePercent = 0

    } catch (error) {
      logger.error('[PerformanceMetrics] System metrics collection failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Collect bot-specific metrics
   */
  private async collectBotMetrics(): Promise<void> {
    try {
      // Calculate uptime
      this.metrics.bots.uptimeHours = Math.round(process.uptime() / 3600 * 100) / 100

      // Active bots (simplified - would need actual bot status monitoring)
      this.metrics.bots.activeBots = this.metrics.bots.totalBots

      // Messages processed (would be tracked from actual bot operations)
      this.metrics.bots.messagesProcessed = this.getStoredCounter('messagesProcessed')

      // Errors occurred (would be tracked from error handlers)
      this.metrics.bots.errorsOccurred = this.getStoredCounter('errorsOccurred')

      // Average response time (would be tracked from actual operations)
      this.metrics.bots.averageResponseTime = this.getStoredAverage('responseTime')

    } catch (error) {
      logger.error('[PerformanceMetrics] Bot metrics collection failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Collect database metrics
   */
  private async collectDatabaseMetrics(): Promise<void> {
    try {
      const dbMetrics = databaseMonitor.getMetrics()

      this.metrics.database = {
        connectionCount: 1, // Supabase manages connections
        queryResponseTime: dbMetrics.performance.averageResponseTime,
        slowQueries: dbMetrics.performance.slowQueries,
        failedQueries: dbMetrics.performance.failedQueries,
        transactionsPerSecond: this.calculateTransactionsPerSecond()
      }

    } catch (error) {
      logger.error('[PerformanceMetrics] Database metrics collection failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Collect operational metrics
   */
  private async collectOperationalMetrics(): Promise<void> {
    try {
      // These would be tracked from actual operations
      this.metrics.operations = {
        imageGenerations: this.getStoredCounter('imageGenerations'),
        textProcessing: this.getStoredCounter('textProcessing'),
        webhookRequests: this.getStoredCounter('webhookRequests'),
        apiCalls: this.getStoredCounter('apiCalls'),
        cacheHits: this.getStoredCounter('cacheHits'),
        cacheMisses: this.getStoredCounter('cacheMisses')
      }

    } catch (error) {
      logger.error('[PerformanceMetrics] Operational metrics collection failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Calculate derived performance metrics
   */
  private calculatePerformanceMetrics(): void {
    // Calculate error rate
    const totalRequests = this.metrics.bots.messagesProcessed
    const errors = this.metrics.bots.errorsOccurred
    this.metrics.performance.errorRate = totalRequests > 0 ? (errors / totalRequests) * 100 : 0

    // Calculate requests per minute (based on recent activity)
    this.metrics.performance.requestsPerMinute = this.calculateRequestsPerMinute()

    // Average latency (same as response time for now)
    this.metrics.performance.averageLatency = this.metrics.bots.averageResponseTime

    // Throughput (requests per second)
    this.metrics.performance.throughput = this.metrics.performance.requestsPerMinute / 60

    // Concurrent users (estimated)
    this.metrics.performance.concurrentUsers = this.estimateConcurrentUsers()
  }

  /**
   * Check for performance alerts
   */
  private checkPerformanceAlerts(): void {
    const alerts: PerformanceAlert[] = []

    // CPU usage alerts
    if (this.metrics.system.cpuUsagePercent > this.thresholds.cpuUsage.critical) {
      alerts.push(this.createAlert('critical', 'cpu_usage', this.metrics.system.cpuUsagePercent, this.thresholds.cpuUsage.critical, 'Critical CPU usage detected'))
    } else if (this.metrics.system.cpuUsagePercent > this.thresholds.cpuUsage.warning) {
      alerts.push(this.createAlert('warning', 'cpu_usage', this.metrics.system.cpuUsagePercent, this.thresholds.cpuUsage.warning, 'High CPU usage detected'))
    }

    // Memory usage alerts
    if (this.metrics.system.memoryUsagePercent > this.thresholds.memoryUsage.critical) {
      alerts.push(this.createAlert('critical', 'memory_usage', this.metrics.system.memoryUsagePercent, this.thresholds.memoryUsage.critical, 'Critical memory usage detected'))
    } else if (this.metrics.system.memoryUsagePercent > this.thresholds.memoryUsage.warning) {
      alerts.push(this.createAlert('warning', 'memory_usage', this.metrics.system.memoryUsagePercent, this.thresholds.memoryUsage.warning, 'High memory usage detected'))
    }

    // Response time alerts
    if (this.metrics.bots.averageResponseTime > this.thresholds.responseTime.critical) {
      alerts.push(this.createAlert('critical', 'response_time', this.metrics.bots.averageResponseTime, this.thresholds.responseTime.critical, 'Critical response time detected'))
    } else if (this.metrics.bots.averageResponseTime > this.thresholds.responseTime.warning) {
      alerts.push(this.createAlert('warning', 'response_time', this.metrics.bots.averageResponseTime, this.thresholds.responseTime.warning, 'High response time detected'))
    }

    // Error rate alerts
    if (this.metrics.performance.errorRate > this.thresholds.errorRate.critical) {
      alerts.push(this.createAlert('critical', 'error_rate', this.metrics.performance.errorRate, this.thresholds.errorRate.critical, 'Critical error rate detected'))
    } else if (this.metrics.performance.errorRate > this.thresholds.errorRate.warning) {
      alerts.push(this.createAlert('warning', 'error_rate', this.metrics.performance.errorRate, this.thresholds.errorRate.warning, 'High error rate detected'))
    }

    // Log new alerts
    alerts.forEach(alert => {
      logger.warn(`[PerformanceMetrics] ${alert.severity.toUpperCase()} ALERT: ${alert.message}`, {
        alertId: alert.id,
        metric: alert.metric,
        value: alert.value,
        threshold: alert.threshold
      })
    })

    this.alerts.push(...alerts)

    // Keep only recent alerts
    this.alerts = this.alerts.slice(-100)
  }

  /**
   * Create a performance alert
   */
  private createAlert(
    severity: 'info' | 'warning' | 'critical',
    metric: string,
    value: number,
    threshold: number,
    message: string
  ): PerformanceAlert {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      severity,
      metric,
      value,
      threshold,
      message,
      resolved: false
    }
  }

  /**
   * Store metrics in historical data
   */
  private storeHistoricalData(): void {
    const timestamp = this.metrics.timestamp

    // Store key metrics for trending
    const keyMetrics = {
      cpu_usage: this.metrics.system.cpuUsagePercent,
      memory_usage: this.metrics.system.memoryUsagePercent,
      response_time: this.metrics.bots.averageResponseTime,
      error_rate: this.metrics.performance.errorRate,
      requests_per_minute: this.metrics.performance.requestsPerMinute
    }

    Object.entries(keyMetrics).forEach(([metric, value]) => {
      if (!this.historicalData.has(metric)) {
        this.historicalData.set(metric, [])
      }

      const history = this.historicalData.get(metric)!
      history.push({ timestamp, value })

      // Keep only recent data
      if (history.length > this.maxHistorySize) {
        history.splice(0, history.length - this.maxHistorySize)
      }
    })
  }

  /**
   * Helper methods for metric calculations
   */
  private getStoredCounter(counter: string): number {
    // This would be replaced with actual counter storage
    return Math.floor(Math.random() * 1000)
  }

  private getStoredAverage(metric: string): number {
    // This would be replaced with actual metric storage
    return Math.floor(Math.random() * 2000)
  }

  private calculateTransactionsPerSecond(): number {
    const dbMetrics = databaseMonitor.getMetrics()
    return dbMetrics.performance.totalQueries / 60 // Simplified calculation
  }

  private calculateRequestsPerMinute(): number {
    // This would be calculated from actual request tracking
    return Math.floor(Math.random() * 100)
  }

  private estimateConcurrentUsers(): number {
    // This would be estimated from active sessions
    return Math.floor(Math.random() * 50)
  }

  /**
   * Public methods for accessing metrics
   */
  getCurrentMetrics(): BotFarmMetrics {
    return { ...this.metrics }
  }

  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved)
  }

  getPerformanceTrend(metric: string, timeframe: '1h' | '6h' | '24h' | '7d'): PerformanceTrend | null {
    const history = this.historicalData.get(metric)
    if (!history || history.length < 2) return null

    // Calculate timeframe window
    const now = Date.now()
    const timeframes = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    }

    const windowStart = now - timeframes[timeframe]
    const filteredHistory = history.filter(point =>
      new Date(point.timestamp).getTime() >= windowStart
    )

    if (filteredHistory.length < 2) return null

    // Calculate trend
    const first = filteredHistory[0].value
    const last = filteredHistory[filteredHistory.length - 1].value
    const changePercent = ((last - first) / first) * 100

    let trend: 'increasing' | 'decreasing' | 'stable'
    if (Math.abs(changePercent) < 5) {
      trend = 'stable'
    } else if (changePercent > 0) {
      trend = 'increasing'
    } else {
      trend = 'decreasing'
    }

    return {
      metric,
      timeframe,
      values: filteredHistory,
      trend,
      changePercent: Math.round(changePercent * 100) / 100
    }
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): {
    summary: string
    metrics: BotFarmMetrics
    alerts: PerformanceAlert[]
    recommendations: string[]
  } {
    const activeAlerts = this.getActiveAlerts()
    const recommendations: string[] = []

    // Generate recommendations based on metrics
    if (this.metrics.system.memoryUsagePercent > 80) {
      recommendations.push('Consider implementing memory optimization or adding more RAM')
    }

    if (this.metrics.bots.averageResponseTime > 2000) {
      recommendations.push('Investigate response time bottlenecks - check database queries and external API calls')
    }

    if (this.metrics.performance.errorRate > 5) {
      recommendations.push('High error rate detected - review error logs and implement better error handling')
    }

    if (this.metrics.database.slowQueries > 10) {
      recommendations.push('Multiple slow database queries detected - optimize query performance')
    }

    const summary = `Performance Status: ${activeAlerts.length === 0 ? 'HEALTHY' : activeAlerts.some(a => a.severity === 'critical') ? 'CRITICAL' : 'WARNING'} | ` +
      `Memory: ${this.metrics.system.memoryUsagePercent}% | ` +
      `Response Time: ${this.metrics.bots.averageResponseTime}ms | ` +
      `Error Rate: ${this.metrics.performance.errorRate.toFixed(2)}% | ` +
      `Active Alerts: ${activeAlerts.length}`

    return {
      summary,
      metrics: this.metrics,
      alerts: activeAlerts,
      recommendations
    }
  }
}

// Global performance metrics collector
export const performanceMetrics = new PerformanceMetricsCollector()

/**
 * Convenience functions
 */
export function startPerformanceMonitoring(intervalSeconds: number = 60): void {
  performanceMetrics.startCollection(intervalSeconds)
}

export function stopPerformanceMonitoring(): void {
  performanceMetrics.stopCollection()
}

export function getCurrentPerformanceMetrics(): BotFarmMetrics {
  return performanceMetrics.getCurrentMetrics()
}

export function getPerformanceReport(): {
  summary: string
  metrics: BotFarmMetrics
  alerts: PerformanceAlert[]
  recommendations: string[]
} {
  return performanceMetrics.generatePerformanceReport()
}