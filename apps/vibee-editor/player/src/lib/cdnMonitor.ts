/**
 * CDN Monitor - Multi-CDN failover with health monitoring
 *
 * Research (2025):
 * - Multi-CDN strategies improve cache hit rate by 15-25%
 * - Redundancy reduces downtime risk
 * - Akamai Super Bowl: 10s latency with edge computing
 *
 * Strategy:
 * 1. Monitor health of multiple CDN endpoints
 * 2. Measure latency to each endpoint
 * 3. Automatically failover on errors
 * 4. Use fastest healthy endpoint
 *
 * @see https://www.cachefly.com/news/how-edge-computing-optimizes-cdn-performance-and-video-streaming/
 */

interface CDNEndpoint {
  name: string;
  baseUrl: string;
  priority: number;
  latency: number;
  available: boolean;
  lastCheck: number;
  failCount: number;
}

interface CDNMonitorConfig {
  endpoints: Omit<CDNEndpoint, 'latency' | 'available' | 'lastCheck' | 'failCount'>[];
  healthCheckInterval?: number;
  maxFailCount?: number;
  timeout?: number;
}

const DEFAULT_CONFIG: Required<Omit<CDNMonitorConfig, 'endpoints'>> = {
  healthCheckInterval: 30000, // 30 seconds
  maxFailCount: 3,
  timeout: 5000,
};

class CDNMonitor {
  private endpoints: CDNEndpoint[];
  private config: Required<Omit<CDNMonitorConfig, 'endpoints'>>;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private currentEndpoint: CDNEndpoint | null = null;

  constructor(config: CDNMonitorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize endpoints
    this.endpoints = config.endpoints.map((ep) => ({
      ...ep,
      latency: Infinity,
      available: true, // Assume available until proven otherwise
      lastCheck: 0,
      failCount: 0,
    }));

    // Sort by priority
    this.endpoints.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Start health monitoring
   */
  start(): void {
    // Initial health check
    this.checkAllEndpoints();

    // Periodic health checks
    this.healthCheckTimer = setInterval(() => {
      this.checkAllEndpoints();
    }, this.config.healthCheckInterval);

    console.log('[CDN] Started monitoring', this.endpoints.length, 'endpoints');
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Check health of all endpoints
   */
  async checkAllEndpoints(): Promise<void> {
    const checks = this.endpoints.map((ep) => this.checkEndpoint(ep));
    await Promise.all(checks);

    // Update current best endpoint
    this.updateBestEndpoint();
  }

  /**
   * Check health of a single endpoint
   */
  private async checkEndpoint(endpoint: CDNEndpoint): Promise<void> {
    const start = performance.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(`${endpoint.baseUrl}/health`, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        endpoint.latency = performance.now() - start;
        endpoint.available = true;
        endpoint.failCount = 0;
      } else {
        this.handleEndpointFailure(endpoint);
      }
    } catch (error) {
      this.handleEndpointFailure(endpoint);
    }

    endpoint.lastCheck = Date.now();
  }

  /**
   * Handle endpoint failure
   */
  private handleEndpointFailure(endpoint: CDNEndpoint): void {
    endpoint.failCount++;
    endpoint.latency = Infinity;

    if (endpoint.failCount >= this.config.maxFailCount) {
      endpoint.available = false;
      console.warn(`[CDN] ${endpoint.name} marked unavailable after ${endpoint.failCount} failures`);
    }
  }

  /**
   * Update best endpoint based on availability and latency
   */
  private updateBestEndpoint(): void {
    const available = this.endpoints
      .filter((ep) => ep.available)
      .sort((a, b) => {
        // First by priority, then by latency
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.latency - b.latency;
      });

    if (available.length > 0) {
      const best = available[0];

      if (this.currentEndpoint?.name !== best.name) {
        console.log(`[CDN] Switching to ${best.name} (latency: ${best.latency.toFixed(0)}ms)`);
        this.currentEndpoint = best;
      }
    } else {
      console.error('[CDN] All endpoints unavailable!');
      this.currentEndpoint = null;
    }
  }

  /**
   * Get the best available CDN endpoint
   */
  getBestEndpoint(): CDNEndpoint | null {
    return this.currentEndpoint;
  }

  /**
   * Get all endpoints with status
   */
  getAllEndpoints(): CDNEndpoint[] {
    return [...this.endpoints];
  }

  /**
   * Fetch with automatic failover
   */
  async fetchWithFailover(path: string, options?: RequestInit): Promise<Response> {
    // Get endpoints sorted by preference
    const endpoints = this.endpoints
      .filter((ep) => ep.available)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.latency - b.latency;
      });

    if (endpoints.length === 0) {
      throw new Error('All CDN endpoints unavailable');
    }

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const url = `${endpoint.baseUrl}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          // Reset fail count on success
          endpoint.failCount = 0;
          return response;
        }

        // Non-OK response, try next
        this.handleEndpointFailure(endpoint);
      } catch (error) {
        lastError = error as Error;
        console.log(`[CDN] ${endpoint.name} failed, trying next...`);
        this.handleEndpointFailure(endpoint);
      }
    }

    throw lastError || new Error('All CDN endpoints failed');
  }

  /**
   * Get URL for best endpoint
   */
  getUrl(path: string): string {
    const endpoint = this.getBestEndpoint();
    if (!endpoint) {
      throw new Error('No CDN endpoint available');
    }
    return `${endpoint.baseUrl}${path}`;
  }

  /**
   * Report manual failure (e.g., from video load error)
   */
  reportFailure(endpointName: string): void {
    const endpoint = this.endpoints.find((ep) => ep.name === endpointName);
    if (endpoint) {
      this.handleEndpointFailure(endpoint);
      this.updateBestEndpoint();
    }
  }

  /**
   * Get monitoring stats
   */
  getStats(): {
    totalEndpoints: number;
    availableEndpoints: number;
    currentEndpoint: string | null;
    avgLatency: number;
  } {
    const available = this.endpoints.filter((ep) => ep.available);
    const avgLatency = available.length > 0
      ? available.reduce((sum, ep) => sum + ep.latency, 0) / available.length
      : Infinity;

    return {
      totalEndpoints: this.endpoints.length,
      availableEndpoints: available.length,
      currentEndpoint: this.currentEndpoint?.name || null,
      avgLatency,
    };
  }
}

/**
 * Default CDN configuration for VIBEE
 */
const DEFAULT_CDN_ENDPOINTS: CDNEndpoint[] = [
  {
    name: 'fly-primary',
    baseUrl: 'https://vibee-player-app.fly.dev',
    priority: 1,
    latency: 0,
    available: true,
    lastCheck: 0,
    failCount: 0,
  },
];

// Singleton instance
let cdnMonitorInstance: CDNMonitor | null = null;

/**
 * Initialize CDN monitor
 */
export function initCDNMonitor(config?: Partial<CDNMonitorConfig>): CDNMonitor {
  if (cdnMonitorInstance) {
    return cdnMonitorInstance;
  }

  cdnMonitorInstance = new CDNMonitor({
    endpoints: config?.endpoints || DEFAULT_CDN_ENDPOINTS.map(({ name, baseUrl, priority }) => ({
      name,
      baseUrl,
      priority,
    })),
    ...config,
  });

  cdnMonitorInstance.start();
  return cdnMonitorInstance;
}

/**
 * Get CDN monitor instance
 */
export function getCDNMonitor(): CDNMonitor | null {
  return cdnMonitorInstance;
}

/**
 * Fetch with CDN failover (convenience function)
 */
export async function fetchWithCDNFailover(path: string, options?: RequestInit): Promise<Response> {
  const monitor = initCDNMonitor();
  return monitor.fetchWithFailover(path, options);
}

export { CDNMonitor };
export default initCDNMonitor;
