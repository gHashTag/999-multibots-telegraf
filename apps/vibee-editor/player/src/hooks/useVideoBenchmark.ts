/**
 * useVideoBenchmark - Video Performance Benchmarking
 *
 * Generated from: specs/video-benchmark.vibee
 * Provides performance measurement and before/after comparison
 */

import { useCallback, useState } from 'react';

// ============================================================================
// Types (from spec)
// ============================================================================

export interface BenchmarkResult {
  testName: string;
  timestamp: string;
  measurements: number[];
  mean: number;
  median: number;
  p50: number;
  p95: number;
  p99: number;
  stdDev: number;
  min: number;
  max: number;
}

export interface StartupBenchmark {
  videoUrl: string;
  iterations: number;
  results: BenchmarkResult;
  networkProfile: string;
}

export interface BufferBenchmark {
  videoUrl: string;
  duration: number;
  rebufferEvents: number;
  rebufferRatio: number;
  avgBufferHealth: number;
  networkProfile: string;
}

export interface MemoryBenchmark {
  initialHeap: number;
  peakHeap: number;
  finalHeap: number;
  memoryGrowth: number;
  leakDetected: boolean;
  videoCount: number;
}

export interface ComparisonResult {
  metricName: string;
  baseline: number;
  current: number;
  difference: number;
  improvementPercent: number;
  pValue: number;
  isSignificant: boolean;
}

export interface BenchmarkReport {
  runId: string;
  date: string;
  environment: Environment;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
  comparison: ComparisonResult[] | null;
  recommendations: string[];
}

export interface BenchmarkSummary {
  totalTests: number;
  passed: number;
  failed: number;
  avgStartupTime: number;
  avgRebufferRatio: number;
  memoryLeakDetected: boolean;
}

export interface Environment {
  browser: string;
  browserVersion: string;
  os: string;
  viewport: { width: number; height: number };
  networkProfile: string;
}

export interface NetworkProfile {
  name: string;
  downloadThroughput: number;  // bytes per second
  uploadThroughput: number;
  latency: number;             // milliseconds
}

// ============================================================================
// Network Profiles
// ============================================================================

export const NETWORK_PROFILES: Record<string, NetworkProfile> = {
  slow3G: {
    name: 'Slow 3G',
    downloadThroughput: 500 * 1024 / 8,  // 500 Kbps
    uploadThroughput: 500 * 1024 / 8,
    latency: 400,
  },
  fast3G: {
    name: 'Fast 3G',
    downloadThroughput: 1.5 * 1024 * 1024 / 8,  // 1.5 Mbps
    uploadThroughput: 750 * 1024 / 8,
    latency: 150,
  },
  regular4G: {
    name: 'Regular 4G',
    downloadThroughput: 4 * 1024 * 1024 / 8,  // 4 Mbps
    uploadThroughput: 3 * 1024 * 1024 / 8,
    latency: 50,
  },
  wifi: {
    name: 'WiFi',
    downloadThroughput: 30 * 1024 * 1024 / 8,  // 30 Mbps
    uploadThroughput: 15 * 1024 * 1024 / 8,
    latency: 10,
  },
};

export function getNetworkProfile(name: 'slow3G' | 'fast3G' | '4G' | 'wifi'): NetworkProfile {
  const profileName = name === '4G' ? 'regular4G' : name;
  return NETWORK_PROFILES[profileName] || NETWORK_PROFILES.wifi;
}

// ============================================================================
// Statistical Functions
// ============================================================================

/**
 * Calculate mean of an array
 */
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate median of an array
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate percentile
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = calculateMean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(calculateMean(squaredDiffs));
}

/**
 * Calculate p-value using Welch's t-test (simplified)
 */
export function calculatePValue(sample1: number[], sample2: number[]): number {
  if (sample1.length < 2 || sample2.length < 2) return 1;

  const mean1 = calculateMean(sample1);
  const mean2 = calculateMean(sample2);
  const var1 = Math.pow(calculateStdDev(sample1), 2);
  const var2 = Math.pow(calculateStdDev(sample2), 2);
  const n1 = sample1.length;
  const n2 = sample2.length;

  // Welch's t-statistic
  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) return 1;

  const t = Math.abs(mean1 - mean2) / se;

  // Approximate p-value using normal distribution (for large samples)
  // This is a simplification; for production use a proper statistical library
  const pValue = 2 * (1 - normalCDF(t));
  return Math.max(0, Math.min(1, pValue));
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Create BenchmarkResult from measurements
 */
function createBenchmarkResult(testName: string, measurements: number[]): BenchmarkResult {
  return {
    testName,
    timestamp: new Date().toISOString(),
    measurements,
    mean: calculateMean(measurements),
    median: calculateMedian(measurements),
    p50: calculatePercentile(measurements, 50),
    p95: calculatePercentile(measurements, 95),
    p99: calculatePercentile(measurements, 99),
    stdDev: calculateStdDev(measurements),
    min: Math.min(...measurements),
    max: Math.max(...measurements),
  };
}

// ============================================================================
// Benchmark Functions (from spec)
// ============================================================================

const BASELINE_STORAGE_KEY = 'vibee-video-benchmark-baseline';

/**
 * Run startup time benchmark
 */
export async function runStartupBenchmark(
  videoUrls: string[],
  iterations: number,
  networkProfile: string = 'wifi'
): Promise<StartupBenchmark> {
  const measurements: number[] = [];

  for (let i = 0; i < iterations; i++) {
    for (const url of videoUrls) {
      const startTime = performance.now();

      await new Promise<void>((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;

        const timeout = setTimeout(() => {
          video.remove();
          reject(new Error('Video load timeout'));
        }, 30000);

        video.oncanplay = () => {
          clearTimeout(timeout);
          const endTime = performance.now();
          measurements.push(endTime - startTime);
          video.remove();
          resolve();
        };

        video.onerror = () => {
          clearTimeout(timeout);
          video.remove();
          reject(new Error('Video load error'));
        };

        video.src = url;
        video.load();
      });

      // Small delay between tests
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return {
    videoUrl: videoUrls.join(', '),
    iterations,
    results: createBenchmarkResult('Startup Time', measurements),
    networkProfile,
  };
}

/**
 * Run buffer health benchmark
 */
export async function runBufferBenchmark(
  videoUrl: string,
  duration: number,
  networkProfile: string = 'wifi'
): Promise<BufferBenchmark> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    let rebufferEvents = 0;
    let totalBufferTime = 0;
    let bufferStart: number | null = null;
    const bufferLevels: number[] = [];

    const checkBuffer = () => {
      if (video.buffered.length > 0) {
        const bufferHealth = video.buffered.end(video.buffered.length - 1) - video.currentTime;
        bufferLevels.push(bufferHealth);
      }
    };

    video.onwaiting = () => {
      rebufferEvents++;
      bufferStart = performance.now();
    };

    video.onplaying = () => {
      if (bufferStart !== null) {
        totalBufferTime += performance.now() - bufferStart;
        bufferStart = null;
      }
    };

    const bufferInterval = setInterval(checkBuffer, 1000);

    const cleanup = () => {
      clearInterval(bufferInterval);
      video.pause();
      video.remove();

      const playbackDuration = video.currentTime * 1000;
      resolve({
        videoUrl,
        duration,
        rebufferEvents,
        rebufferRatio: playbackDuration > 0 ? totalBufferTime / playbackDuration : 0,
        avgBufferHealth: calculateMean(bufferLevels),
        networkProfile,
      });
    };

    video.onended = cleanup;

    setTimeout(cleanup, duration);

    video.src = videoUrl;
    video.play().catch(() => {
      cleanup();
    });
  });
}

/**
 * Run memory usage benchmark
 */
export async function runMemoryBenchmark(
  videoCount: number,
  scrollDelay: number
): Promise<MemoryBenchmark> {
  const getHeapSize = (): number => {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  };

  const initialHeap = getHeapSize();
  let peakHeap = initialHeap;

  // Simulate scrolling through videos
  for (let i = 0; i < videoCount; i++) {
    const currentHeap = getHeapSize();
    peakHeap = Math.max(peakHeap, currentHeap);
    await new Promise((r) => setTimeout(r, scrollDelay));
  }

  // Force garbage collection if available (only in debug mode)
  if ('gc' in window) {
    (window as any).gc();
  }

  await new Promise((r) => setTimeout(r, 1000));

  const finalHeap = getHeapSize();
  const memoryGrowth = finalHeap - initialHeap;
  const LEAK_THRESHOLD = 50 * 1024 * 1024; // 50MB

  return {
    initialHeap,
    peakHeap,
    finalHeap,
    memoryGrowth,
    leakDetected: memoryGrowth > LEAK_THRESHOLD,
    videoCount,
  };
}

/**
 * Compare current results with baseline
 */
export function compareResults(
  baseline: BenchmarkResult,
  current: BenchmarkResult
): ComparisonResult {
  const difference = current.mean - baseline.mean;
  const improvementPercent = baseline.mean !== 0 ? ((baseline.mean - current.mean) / baseline.mean) * 100 : 0;
  const pValue = calculatePValue(baseline.measurements, current.measurements);

  return {
    metricName: current.testName,
    baseline: baseline.mean,
    current: current.mean,
    difference,
    improvementPercent,
    pValue,
    isSignificant: pValue < 0.05,
  };
}

/**
 * Get current environment info
 */
function getEnvironment(networkProfile: string): Environment {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let browserVersion = '';

  if (ua.includes('Chrome')) {
    browser = 'Chrome';
    browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] || '';
  } else if (ua.includes('Safari')) {
    browser = 'Safari';
    browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] || '';
  } else if (ua.includes('Firefox')) {
    browser = 'Firefox';
    browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] || '';
  }

  return {
    browser,
    browserVersion,
    os: navigator.platform,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    networkProfile,
  };
}

/**
 * Generate comprehensive benchmark report
 */
export function generateReport(
  results: BenchmarkResult[],
  baseline?: BenchmarkResult[]
): BenchmarkReport {
  const startupResults = results.filter((r) => r.testName.includes('Startup'));
  const avgStartupTime = startupResults.length > 0 ? calculateMean(startupResults.map((r) => r.mean)) : 0;

  const summary: BenchmarkSummary = {
    totalTests: results.length,
    passed: results.filter((r) => r.mean < 2000).length, // Startup < 2s
    failed: results.filter((r) => r.mean >= 2000).length,
    avgStartupTime,
    avgRebufferRatio: 0, // Would need buffer benchmarks
    memoryLeakDetected: false, // Would need memory benchmarks
  };

  const comparison: ComparisonResult[] | null = baseline
    ? results
        .map((result) => {
          const baselineResult = baseline.find((b) => b.testName === result.testName);
          return baselineResult ? compareResults(baselineResult, result) : null;
        })
        .filter((c): c is ComparisonResult => c !== null)
    : null;

  const recommendations: string[] = [];

  if (avgStartupTime > 2000) {
    recommendations.push('Consider enabling video preloading to reduce startup time below 2s');
  }
  if (avgStartupTime > 3000) {
    recommendations.push('High startup time detected. Check network conditions and video bitrate');
  }
  if (comparison?.some((c) => c.improvementPercent < -10)) {
    recommendations.push('Performance regression detected. Review recent changes');
  }

  return {
    runId: `run-${Date.now()}`,
    date: new Date().toISOString(),
    environment: getEnvironment('wifi'),
    results,
    summary,
    comparison,
    recommendations,
  };
}

/**
 * Save current results as baseline
 */
export function saveBaseline(results: BenchmarkResult[]): void {
  try {
    localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(results));
    console.log('[Benchmark] Baseline saved:', results.length, 'results');
  } catch (error) {
    console.error('[Benchmark] Failed to save baseline:', error);
  }
}

/**
 * Load baseline from storage
 */
export function loadBaseline(): BenchmarkResult[] | null {
  try {
    const data = localStorage.getItem(BASELINE_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[Benchmark] Failed to load baseline:', error);
    return null;
  }
}

// ============================================================================
// React Hook
// ============================================================================

interface UseBenchmarkResult {
  isRunning: boolean;
  progress: number;
  results: BenchmarkResult[];
  report: BenchmarkReport | null;
  error: Error | null;
  runStartup: (videoUrls: string[], iterations?: number) => Promise<void>;
  runBuffer: (videoUrl: string, duration?: number) => Promise<void>;
  runMemory: (videoCount?: number) => Promise<void>;
  runAll: (videoUrls: string[]) => Promise<void>;
  saveAsBaseline: () => void;
  compareWithBaseline: () => ComparisonResult[] | null;
}

export function useVideoBenchmark(): UseBenchmarkResult {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const runStartup = useCallback(async (videoUrls: string[], iterations: number = 3) => {
    setIsRunning(true);
    setProgress(0);
    setError(null);

    try {
      const benchmark = await runStartupBenchmark(videoUrls, iterations);
      setResults((prev) => [...prev, benchmark.results]);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Startup benchmark failed'));
    } finally {
      setIsRunning(false);
    }
  }, []);

  const runBuffer = useCallback(async (videoUrl: string, duration: number = 30000) => {
    setIsRunning(true);
    setProgress(0);
    setError(null);

    try {
      await runBufferBenchmark(videoUrl, duration);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Buffer benchmark failed'));
    } finally {
      setIsRunning(false);
    }
  }, []);

  const runMemory = useCallback(async (videoCount: number = 20) => {
    setIsRunning(true);
    setProgress(0);
    setError(null);

    try {
      await runMemoryBenchmark(videoCount, 1000);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Memory benchmark failed'));
    } finally {
      setIsRunning(false);
    }
  }, []);

  const runAll = useCallback(async (videoUrls: string[]) => {
    setIsRunning(true);
    setProgress(0);
    setResults([]);
    setError(null);

    try {
      // Startup benchmark
      setProgress(20);
      const startup = await runStartupBenchmark(videoUrls, 3);
      setResults((prev) => [...prev, startup.results]);

      // Buffer benchmark
      setProgress(60);
      if (videoUrls[0]) {
        await runBufferBenchmark(videoUrls[0], 15000);
      }

      // Memory benchmark
      setProgress(80);
      await runMemoryBenchmark(10, 500);

      // Generate report
      setProgress(90);
      const baseline = loadBaseline();
      const newReport = generateReport(results, baseline || undefined);
      setReport(newReport);

      // Expose for E2E tests
      if (typeof window !== 'undefined') {
        (window as any).__BENCHMARK_REPORT__ = newReport;
      }

      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Benchmark failed'));
    } finally {
      setIsRunning(false);
    }
  }, [results]);

  const saveAsBaseline = useCallback(() => {
    if (results.length > 0) {
      saveBaseline(results);
    }
  }, [results]);

  const compareWithBaseline = useCallback(() => {
    const baseline = loadBaseline();
    if (!baseline || results.length === 0) return null;

    return results
      .map((result) => {
        const baselineResult = baseline.find((b) => b.testName === result.testName);
        return baselineResult ? compareResults(baselineResult, result) : null;
      })
      .filter((c): c is ComparisonResult => c !== null);
  }, [results]);

  return {
    isRunning,
    progress,
    results,
    report,
    error,
    runStartup,
    runBuffer,
    runMemory,
    runAll,
    saveAsBaseline,
    compareWithBaseline,
  };
}

export default useVideoBenchmark;
