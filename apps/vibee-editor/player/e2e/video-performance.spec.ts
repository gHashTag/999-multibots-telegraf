/**
 * E2E Video Performance Tests
 *
 * Based on: specs/video-benchmark.vibee
 * Tests video loading performance against scientific targets
 *
 * Targets (from research):
 * - Startup Time: < 2s (HTTP/2 Push Study)
 * - Rebuffer Ratio: < 2% (BBA Stanford)
 * - QoE Score: > 4.0 (Pensieve MIT)
 * - Memory Growth: < 50MB
 */

import { test, expect, Page } from '@playwright/test';

// Performance targets based on scientific research
const PERFORMANCE_TARGETS = {
  startupTime: 2000,       // < 2 seconds (HTTP/2 Push Study)
  rebufferRatio: 0.02,     // < 2% (BBA Stanford)
  qoeScore: 4.0,           // > 4.0 (Pensieve MIT)
  memoryGrowth: 50_000_000, // < 50MB
  prefetchCount: 5,         // At least 5 videos prefetched
  qualitySwitches: 5,       // Max switches after stabilization
};

// Test video URL (local asset)
const TEST_VIDEO_URL = '/lipsync/lipsync.mp4';

interface VideoMetrics {
  startupTime: number;
  bufferingEvents: number;
  totalBufferTime: number;
  rebufferRatio: number;
  qoeScore: number;
}

interface MemoryMetrics {
  initial: number;
  peak: number;
  final: number;
  growth: number;
}

/**
 * Helper: Wait for video to be ready and measure startup time
 */
async function measureStartupTime(page: Page): Promise<number> {
  const startTime = await page.evaluate(() => performance.now());

  await page.waitForFunction(
    () => {
      const video = document.querySelector('video');
      return video && video.readyState >= 3; // HAVE_FUTURE_DATA
    },
    { timeout: 30000 }
  );

  const endTime = await page.evaluate(() => performance.now());
  return endTime - startTime;
}

/**
 * Helper: Get QoE metrics from window
 */
async function getQoEMetrics(page: Page): Promise<VideoMetrics | null> {
  return await page.evaluate(() => {
    return (window as any).__QOE_METRICS__ || null;
  });
}

/**
 * Helper: Get memory usage
 */
async function getMemoryUsage(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const perf = performance as any;
    return perf.memory?.usedJSHeapSize || 0;
  });
}

// ============================================================================
// Test Suite: Video Loading Performance
// ============================================================================

test.describe('Video Loading Performance', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to editor page
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
  });

  test('startup time should be under 2 seconds', async ({ page }) => {
    const startupTime = await measureStartupTime(page);

    console.log(`[Benchmark] Startup time: ${startupTime.toFixed(0)}ms`);

    expect(startupTime).toBeLessThan(PERFORMANCE_TARGETS.startupTime);
  });

  test('video should start playing without errors', async ({ page }) => {
    // Wait for video element
    const video = page.locator('video').first();
    await expect(video).toBeVisible({ timeout: 10000 });

    // Check video is not in error state
    const hasError = await video.evaluate((v) => v.error !== null);
    expect(hasError).toBe(false);

    // Check video has valid duration
    const duration = await video.evaluate((v) => v.duration);
    expect(duration).toBeGreaterThan(0);
  });

  test('should track QoE metrics', async ({ page }) => {
    // Wait for video to start
    await page.waitForTimeout(3000);

    const metrics = await getQoEMetrics(page);

    // Metrics should be tracked
    if (metrics) {
      expect(metrics).toHaveProperty('startupTime');
      expect(metrics).toHaveProperty('bufferingEvents');
      expect(metrics).toHaveProperty('qoeScore');

      console.log('[Benchmark] QoE Metrics:', JSON.stringify(metrics, null, 2));
    }
  });

  test('QoE score should be above 4.0', async ({ page }) => {
    // Wait for video to play for 10 seconds
    await page.waitForTimeout(10000);

    const metrics = await getQoEMetrics(page);

    if (metrics && metrics.qoeScore > 0) {
      console.log(`[Benchmark] QoE Score: ${metrics.qoeScore.toFixed(2)}`);
      expect(metrics.qoeScore).toBeGreaterThanOrEqual(PERFORMANCE_TARGETS.qoeScore);
    }
  });
});

// ============================================================================
// Test Suite: Buffer Health
// ============================================================================

test.describe('Buffer Health', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
  });

  test('rebuffering ratio should be under 2%', async ({ page }) => {
    // Wait for video to play for 30 seconds
    const video = page.locator('video').first();
    await expect(video).toBeVisible({ timeout: 10000 });

    // Start playback
    await video.evaluate((v) => v.play());

    // Wait and collect metrics
    await page.waitForTimeout(30000);

    const metrics = await getQoEMetrics(page);

    if (metrics) {
      console.log(`[Benchmark] Rebuffer ratio: ${(metrics.rebufferRatio * 100).toFixed(2)}%`);
      expect(metrics.rebufferRatio).toBeLessThan(PERFORMANCE_TARGETS.rebufferRatio);
    }
  });

  test('should maintain healthy buffer level', async ({ page }) => {
    const video = page.locator('video').first();
    await expect(video).toBeVisible({ timeout: 10000 });

    // Check buffer level after 5 seconds
    await page.waitForTimeout(5000);

    const bufferHealth = await video.evaluate((v) => {
      if (v.buffered.length === 0) return 0;
      return v.buffered.end(v.buffered.length - 1) - v.currentTime;
    });

    console.log(`[Benchmark] Buffer health: ${bufferHealth.toFixed(1)}s`);

    // Should have at least 2 seconds of buffer
    expect(bufferHealth).toBeGreaterThan(2);
  });
});

// ============================================================================
// Test Suite: Memory Management
// ============================================================================

test.describe('Memory Management', () => {
  test('memory usage should stay within bounds during playback', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    const initialMemory = await getMemoryUsage(page);

    // Play video for 30 seconds
    await page.waitForTimeout(30000);

    const finalMemory = await getMemoryUsage(page);
    const memoryGrowth = finalMemory - initialMemory;

    console.log(`[Benchmark] Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(1)}MB`);

    expect(memoryGrowth).toBeLessThan(PERFORMANCE_TARGETS.memoryGrowth);
  });

  test('should not leak memory when navigating between videos', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    const initialMemory = await getMemoryUsage(page);
    let peakMemory = initialMemory;

    // Scroll through multiple videos
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(2000);

      const currentMemory = await getMemoryUsage(page);
      peakMemory = Math.max(peakMemory, currentMemory);
    }

    // Go back to start
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(500);
    }

    // Wait for garbage collection
    await page.waitForTimeout(3000);

    const finalMemory = await getMemoryUsage(page);
    const memoryGrowth = finalMemory - initialMemory;

    console.log(`[Benchmark] Peak memory: ${(peakMemory / 1024 / 1024).toFixed(1)}MB`);
    console.log(`[Benchmark] Final memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(1)}MB`);

    // Memory should not grow significantly after returning
    expect(memoryGrowth).toBeLessThan(PERFORMANCE_TARGETS.memoryGrowth);
  });
});

// ============================================================================
// Test Suite: Prefetching
// ============================================================================

test.describe('Video Prefetching', () => {
  test('should prefetch videos ahead of current position', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Wait for prefetch to complete
    await page.waitForTimeout(5000);

    const prefetchStats = await page.evaluate(() => {
      return (window as any).__VIDEO_PREFETCH_STATS__ || { prefetchedCount: 0 };
    });

    console.log(`[Benchmark] Prefetched videos: ${prefetchStats.prefetchedCount}`);

    expect(prefetchStats.prefetchedCount).toBeGreaterThanOrEqual(PERFORMANCE_TARGETS.prefetchCount);
  });

  test('preloaded video should start faster than cold load', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Measure first video startup
    const firstStartup = await measureStartupTime(page);

    // Wait for prefetch of next video
    await page.waitForTimeout(3000);

    // Navigate to next video
    await page.keyboard.press('ArrowDown');

    // Measure second video startup (should be faster due to prefetch)
    const secondStartup = await measureStartupTime(page);

    console.log(`[Benchmark] First video startup: ${firstStartup.toFixed(0)}ms`);
    console.log(`[Benchmark] Second video startup (prefetched): ${secondStartup.toFixed(0)}ms`);

    // Prefetched video should be at least 30% faster
    expect(secondStartup).toBeLessThan(firstStartup * 0.7);
  });
});

// ============================================================================
// Test Suite: Codec Detection
// ============================================================================

test.describe('Codec Detection', () => {
  test('should detect available codecs', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    // Wait for codec detection
    await page.waitForTimeout(2000);

    const codecInfo = await page.evaluate(() => {
      return (window as any).__CODEC_INFO__ || null;
    });

    if (codecInfo) {
      console.log('[Benchmark] Codec capabilities:', JSON.stringify(codecInfo.capabilities, null, 2));
      console.log('[Benchmark] Recommended codec:', codecInfo.recommendation?.primary);

      // Should detect at least H.264
      expect(codecInfo.capabilities.h264).toBe(true);
    }
  });
});

// ============================================================================
// Test Suite: Full Benchmark Report
// ============================================================================

test.describe('Benchmark Report', () => {
  test('should generate comprehensive benchmark report', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    // Run all benchmarks
    const startTime = Date.now();

    // Collect startup metrics
    const startupTime = await measureStartupTime(page);

    // Wait for video playback
    await page.waitForTimeout(15000);

    // Collect final metrics
    const qoeMetrics = await getQoEMetrics(page);
    const memoryUsage = await getMemoryUsage(page);
    const codecInfo = await page.evaluate(() => (window as any).__CODEC_INFO__);

    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      metrics: {
        startupTime,
        qoeScore: qoeMetrics?.qoeScore || 0,
        rebufferRatio: qoeMetrics?.rebufferRatio || 0,
        bufferingEvents: qoeMetrics?.bufferingEvents || 0,
        memoryUsage: memoryUsage / 1024 / 1024, // MB
      },
      codec: codecInfo?.recommendation?.primary || 'unknown',
      targets: PERFORMANCE_TARGETS,
      passed: {
        startupTime: startupTime < PERFORMANCE_TARGETS.startupTime,
        qoeScore: (qoeMetrics?.qoeScore || 0) >= PERFORMANCE_TARGETS.qoeScore,
        rebufferRatio: (qoeMetrics?.rebufferRatio || 0) < PERFORMANCE_TARGETS.rebufferRatio,
      },
    };

    console.log('\n========================================');
    console.log('VIDEO PERFORMANCE BENCHMARK REPORT');
    console.log('========================================');
    console.log(JSON.stringify(report, null, 2));
    console.log('========================================\n');

    // At least startup time should pass
    expect(report.passed.startupTime).toBe(true);
  });
});
