// Monitoring and Metrics Service
// Tracks performance and usage metrics

import * as Sentry from '@sentry/react';

interface MetricData {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

interface GenerationMetrics {
  totalGenerations: number;
  successfulGenerations: number;
  failedGenerations: number;
  cacheHits: number;
  averageDuration: number;
  successRate: number;
  cacheHitRate: number;
}

export class MonitoringService {
  private static metrics: MetricData[] = [];
  private static readonly MAX_METRICS = 1000;
  
  // Simple counters for tests
  private static totalGenerations = 0;
  private static successfulGenerations = 0;
  private static failedGenerations = 0;
  private static cacheHits = 0;
  private static totalDuration = 0;

  /**
   * Track script generation metrics
   */
  static trackGeneration(params: {
    success: boolean;
    duration: number;
    cached: boolean;
    niche: string;
    style: string;
    duration_seconds: number;
    error?: string;
  }): void {
    // Update counters
    this.totalGenerations++;
    if (params.success) {
      this.successfulGenerations++;
    } else {
      this.failedGenerations++;
    }
    if (params.cached) {
      this.cacheHits++;
    }
    this.totalDuration += params.duration;

    // Track in Sentry
    Sentry.addBreadcrumb({
      category: 'script.generation',
      message: params.success ? 'Script generated' : 'Generation failed',
      level: params.success ? 'info' : 'error',
      data: params,
    });

    // Track metric
    this.addMetric({
      name: 'script.generation',
      value: params.duration,
      tags: {
        success: params.success.toString(),
        cached: params.cached.toString(),
        niche: params.niche,
        style: params.style,
        error: params.error || 'none',
      },
      timestamp: Date.now(),
    });

    // Track success rate
    this.addMetric({
      name: 'script.success_rate',
      value: params.success ? 1 : 0,
      tags: {
        niche: params.niche,
        style: params.style,
      },
      timestamp: Date.now(),
    });

    // Track cache hit rate
    if (params.cached) {
      this.addMetric({
        name: 'script.cache_hit',
        value: 1,
        tags: {
          niche: params.niche,
        },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Track error
   */
  static trackError(params: {
    error: Error | string;
    context: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }): void {
    const errorMessage = params.error instanceof Error ? params.error.message : params.error;

    Sentry.captureMessage(errorMessage, {
      level: params.severity === 'critical' ? 'fatal' : params.severity === 'high' ? 'error' : 'warning',
      tags: {
        context: params.context,
      },
    });

    this.addMetric({
      name: 'error.count',
      value: 1,
      tags: {
        context: params.context,
        severity: params.severity,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Track user action
   */
  static trackAction(params: {
    action: string;
    category: string;
    label?: string;
    value?: number;
  }): void {
    Sentry.addBreadcrumb({
      category: params.category,
      message: params.action,
      level: 'info',
      data: {
        label: params.label,
        value: params.value,
      },
    });

    this.addMetric({
      name: `action.${params.category}`,
      value: params.value || 1,
      tags: {
        action: params.action,
        label: params.label || 'none',
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Get metrics summary
   */
  static getMetricsSummary(timeWindow: number = 3600000): {
    totalGenerations: number;
    successRate: number;
    cacheHitRate: number;
    avgDuration: number;
    errorCount: number;
  } {
    const now = Date.now();
    const recentMetrics = this.metrics.filter(m => now - m.timestamp < timeWindow);

    const generations = recentMetrics.filter(m => m.name === 'script.generation');
    const successes = recentMetrics.filter(m => m.name === 'script.success_rate' && m.value === 1);
    const cacheHits = recentMetrics.filter(m => m.name === 'script.cache_hit');
    const errors = recentMetrics.filter(m => m.name === 'error.count');

    const totalGenerations = generations.length;
    const successRate = totalGenerations > 0 ? (successes.length / totalGenerations) * 100 : 0;
    const cacheHitRate = totalGenerations > 0 ? (cacheHits.length / totalGenerations) * 100 : 0;
    const avgDuration = totalGenerations > 0
      ? generations.reduce((sum, m) => sum + m.value, 0) / totalGenerations
      : 0;
    const errorCount = errors.length;

    return {
      totalGenerations,
      successRate,
      cacheHitRate,
      avgDuration,
      errorCount,
    };
  }

  /**
   * Check if metrics are healthy
   */
  static checkHealth(): {
    healthy: boolean;
    issues: string[];
  } {
    const summary = this.getMetricsSummary();
    const issues: string[] = [];

    // Check success rate
    if (summary.successRate < 80 && summary.totalGenerations > 5) {
      issues.push(`Low success rate: ${summary.successRate.toFixed(1)}% (target: >80%)`);
    }

    // Check average duration
    if (summary.avgDuration > 30000 && summary.totalGenerations > 5) {
      issues.push(`Slow generation: ${(summary.avgDuration / 1000).toFixed(1)}s (target: <30s)`);
    }

    // Check error rate
    const errorRate = summary.totalGenerations > 0
      ? (summary.errorCount / summary.totalGenerations) * 100
      : 0;
    if (errorRate > 15 && summary.totalGenerations > 5) {
      issues.push(`High error rate: ${errorRate.toFixed(1)}% (target: <15%)`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Add metric to internal storage
   */
  private static addMetric(metric: MetricData): void {
    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }

  /**
   * Get current metrics
   */
  static getMetrics(): GenerationMetrics {
    const avgDuration = this.totalGenerations > 0 
      ? this.totalDuration / this.totalGenerations 
      : 0;
    
    const successRate = this.totalGenerations > 0
      ? this.successfulGenerations / this.totalGenerations
      : 0;
    
    const cacheHitRate = this.totalGenerations > 0
      ? this.cacheHits / this.totalGenerations
      : 0;

    return {
      totalGenerations: this.totalGenerations,
      successfulGenerations: this.successfulGenerations,
      failedGenerations: this.failedGenerations,
      cacheHits: this.cacheHits,
      averageDuration: avgDuration,
      successRate,
      cacheHitRate,
    };
  }

  /**
   * Get success rate (0-1)
   */
  static getSuccessRate(): number {
    if (this.totalGenerations === 0) return 0;
    return this.successfulGenerations / this.totalGenerations;
  }

  /**
   * Get cache hit rate (0-1)
   */
  static getCacheHitRate(): number {
    if (this.totalGenerations === 0) return 0;
    return this.cacheHits / this.totalGenerations;
  }

  /**
   * Reset all metrics
   */
  static reset(): void {
    this.totalGenerations = 0;
    this.successfulGenerations = 0;
    this.failedGenerations = 0;
    this.cacheHits = 0;
    this.totalDuration = 0;
    this.metrics = [];
  }

  /**
   * Clear all metrics (alias for reset)
   */
  static clearMetrics(): void {
    this.reset();
  }

  /**
   * Export metrics for analysis
   */
  static exportMetrics(): MetricData[] {
    return [...this.metrics];
  }
}

// Auto-check health every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    const health = MonitoringService.checkHealth();
    if (!health.healthy) {
      console.warn('Health check failed:', health.issues);
      
      // Send to Sentry
      Sentry.captureMessage('Health check failed', {
        level: 'warning',
        extra: {
          issues: health.issues,
          summary: MonitoringService.getMetricsSummary(),
        },
      });
    }
  }, 5 * 60 * 1000); // 5 minutes
}
