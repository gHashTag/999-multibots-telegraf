/**
 * BandwidthPredictor - EWMA-based network throughput prediction
 *
 * Based on GRU Bandwidth paper (ACM MM 2024) - simplified EWMA implementation
 * suitable for browser environments (no ML framework required).
 *
 * Uses Exponential Weighted Moving Average (EWMA) for stable predictions:
 * - EWMA provides 11% QoE improvement over naive estimation
 * - Adapts quickly to bandwidth changes while filtering noise
 * - Maintains history for trend detection
 *
 * Features:
 * - Real-time throughput measurement during downloads
 * - EWMA smoothing with configurable alpha
 * - Conservative bandwidth estimation (safety margin)
 * - Jitter detection for unstable connections
 */

export interface BandwidthSample {
  timestamp: number;
  bytesLoaded: number;
  durationMs: number;
  throughputKbps: number;
}

export interface BandwidthStats {
  currentKbps: number;
  predictedKbps: number;
  averageKbps: number;
  minKbps: number;
  maxKbps: number;
  jitterKbps: number;
  sampleCount: number;
  isStable: boolean;
}

export interface BandwidthPredictorOptions {
  alpha?: number;          // EWMA smoothing factor (0.3 = smooth, 0.7 = responsive)
  historySize?: number;    // Max samples to keep
  safetyMargin?: number;   // Conservative factor (0.8 = 80% of predicted)
  defaultKbps?: number;    // Default bandwidth when no data
  jitterThreshold?: number; // Jitter threshold for stability detection
}

export class BandwidthPredictor {
  private history: BandwidthSample[] = [];
  private ewma: number = 0;
  private initialized: boolean = false;

  private readonly alpha: number;
  private readonly historySize: number;
  private readonly safetyMargin: number;
  private readonly defaultKbps: number;
  private readonly jitterThreshold: number;

  constructor(options: BandwidthPredictorOptions = {}) {
    this.alpha = options.alpha ?? 0.3;
    this.historySize = options.historySize ?? 20;
    this.safetyMargin = options.safetyMargin ?? 0.8;
    this.defaultKbps = options.defaultKbps ?? 5000; // 5 Mbps default
    this.jitterThreshold = options.jitterThreshold ?? 500; // 500 Kbps jitter = unstable
  }

  /**
   * Record a bandwidth sample from a completed download
   */
  record(bytesLoaded: number, durationMs: number): void {
    if (durationMs <= 0 || bytesLoaded <= 0) return;

    const throughputKbps = (bytesLoaded * 8) / durationMs; // Convert bytes/ms to kbps

    const sample: BandwidthSample = {
      timestamp: Date.now(),
      bytesLoaded,
      durationMs,
      throughputKbps,
    };

    // Update EWMA
    if (!this.initialized) {
      this.ewma = throughputKbps;
      this.initialized = true;
    } else {
      this.ewma = this.alpha * throughputKbps + (1 - this.alpha) * this.ewma;
    }

    // Add to history
    this.history.push(sample);

    // Trim history if needed
    if (this.history.length > this.historySize) {
      this.history.shift();
    }
  }

  /**
   * Predict bandwidth using EWMA (GRU-inspired estimation)
   * Returns conservative estimate suitable for ABR decisions
   */
  predict(): number {
    if (!this.initialized || this.history.length === 0) {
      return this.defaultKbps * this.safetyMargin;
    }

    // Apply safety margin for conservative estimation
    return this.ewma * this.safetyMargin;
  }

  /**
   * Get raw EWMA without safety margin
   */
  getRawPrediction(): number {
    return this.initialized ? this.ewma : this.defaultKbps;
  }

  /**
   * Calculate jitter (standard deviation of throughput)
   */
  private calculateJitter(): number {
    if (this.history.length < 2) return 0;

    const throughputs = this.history.map((s) => s.throughputKbps);
    const mean = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
    const variance = throughputs.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / throughputs.length;

    return Math.sqrt(variance);
  }

  /**
   * Check if connection is stable (low jitter)
   */
  isStable(): boolean {
    return this.calculateJitter() < this.jitterThreshold;
  }

  /**
   * Get full bandwidth statistics
   */
  getStats(): BandwidthStats {
    if (this.history.length === 0) {
      return {
        currentKbps: this.defaultKbps,
        predictedKbps: this.predict(),
        averageKbps: this.defaultKbps,
        minKbps: this.defaultKbps,
        maxKbps: this.defaultKbps,
        jitterKbps: 0,
        sampleCount: 0,
        isStable: true,
      };
    }

    const throughputs = this.history.map((s) => s.throughputKbps);
    const sum = throughputs.reduce((a, b) => a + b, 0);

    return {
      currentKbps: throughputs[throughputs.length - 1],
      predictedKbps: this.predict(),
      averageKbps: sum / throughputs.length,
      minKbps: Math.min(...throughputs),
      maxKbps: Math.max(...throughputs),
      jitterKbps: this.calculateJitter(),
      sampleCount: this.history.length,
      isStable: this.isStable(),
    };
  }

  /**
   * Clear all history and reset predictor
   */
  reset(): void {
    this.history = [];
    this.ewma = 0;
    this.initialized = false;
  }

  /**
   * Get history for debugging/analysis
   */
  getHistory(): BandwidthSample[] {
    return [...this.history];
  }
}

// Singleton instance for global bandwidth tracking
let globalPredictor: BandwidthPredictor | null = null;

export function getGlobalBandwidthPredictor(): BandwidthPredictor {
  if (!globalPredictor) {
    globalPredictor = new BandwidthPredictor();
  }
  return globalPredictor;
}

/**
 * Hook-style helper for measuring download bandwidth
 * Usage: const { measuredFetch } = useBandwidthMeasurement();
 */
export function createMeasuredFetch(predictor: BandwidthPredictor = getGlobalBandwidthPredictor()) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const startTime = performance.now();

    const response = await fetch(url, init);
    const clonedResponse = response.clone();

    // Read the response to get actual bytes loaded
    const blob = await clonedResponse.blob();
    const endTime = performance.now();

    const durationMs = endTime - startTime;
    const bytesLoaded = blob.size;

    if (durationMs > 0 && bytesLoaded > 0) {
      predictor.record(bytesLoaded, durationMs);
    }

    return response;
  };
}

export default BandwidthPredictor;
