/**
 * E2E Video Network Condition Tests
 *
 * Tests video loading under various network conditions using CDP throttling
 * Based on: specs/video-benchmark.vibee
 */

import { test, expect, Page, CDPSession } from '@playwright/test';

// Network profiles based on scientific research
const NETWORK_PROFILES = {
  slow3G: {
    name: 'Slow 3G',
    offline: false,
    downloadThroughput: (500 * 1024) / 8,  // 500 Kbps
    uploadThroughput: (500 * 1024) / 8,
    latency: 400,
    expectedStartup: 8000, // 8 seconds acceptable for slow 3G
    expectedRebuffer: 0.15, // 15% acceptable
  },
  fast3G: {
    name: 'Fast 3G',
    offline: false,
    downloadThroughput: (1.5 * 1024 * 1024) / 8,  // 1.5 Mbps
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
    expectedStartup: 5000, // 5 seconds
    expectedRebuffer: 0.05, // 5%
  },
  regular4G: {
    name: 'Regular 4G',
    offline: false,
    downloadThroughput: (4 * 1024 * 1024) / 8,  // 4 Mbps
    uploadThroughput: (3 * 1024 * 1024) / 8,
    latency: 50,
    expectedStartup: 3000, // 3 seconds
    expectedRebuffer: 0.02, // 2%
  },
  wifi: {
    name: 'WiFi',
    offline: false,
    downloadThroughput: (30 * 1024 * 1024) / 8,  // 30 Mbps
    uploadThroughput: (15 * 1024 * 1024) / 8,
    latency: 10,
    expectedStartup: 2000, // 2 seconds
    expectedRebuffer: 0.01, // 1%
  },
};

/**
 * Apply network throttling via CDP
 */
async function applyNetworkConditions(
  page: Page,
  profile: typeof NETWORK_PROFILES[keyof typeof NETWORK_PROFILES]
): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);

  await client.send('Network.emulateNetworkConditions', {
    offline: profile.offline,
    downloadThroughput: profile.downloadThroughput,
    uploadThroughput: profile.uploadThroughput,
    latency: profile.latency,
  });

  console.log(`[Network] Applied ${profile.name} throttling`);
  return client;
}

/**
 * Measure startup time under network conditions
 */
async function measureNetworkStartup(page: Page): Promise<number> {
  const startTime = await page.evaluate(() => performance.now());

  try {
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video');
        return video && video.readyState >= 3;
      },
      { timeout: 60000 } // Longer timeout for slow networks
    );
  } catch {
    // If timeout, return max time
    return 60000;
  }

  const endTime = await page.evaluate(() => performance.now());
  return endTime - startTime;
}

/**
 * Count rebuffer events during playback
 */
async function measureRebuffering(
  page: Page,
  duration: number
): Promise<{ events: number; ratio: number }> {
  const result = await page.evaluate(async (playDuration) => {
    return new Promise<{ events: number; ratio: number }>((resolve) => {
      const video = document.querySelector('video');
      if (!video) {
        resolve({ events: 0, ratio: 0 });
        return;
      }

      let rebufferEvents = 0;
      let totalBufferTime = 0;
      let bufferStart: number | null = null;

      video.addEventListener('waiting', () => {
        rebufferEvents++;
        bufferStart = performance.now();
      });

      video.addEventListener('playing', () => {
        if (bufferStart !== null) {
          totalBufferTime += performance.now() - bufferStart;
          bufferStart = null;
        }
      });

      video.play().catch(() => {});

      setTimeout(() => {
        const playbackTime = video.currentTime * 1000;
        resolve({
          events: rebufferEvents,
          ratio: playbackTime > 0 ? totalBufferTime / playbackTime : 0,
        });
      }, playDuration);
    });
  }, duration);

  return result;
}

// ============================================================================
// Test Suite: Network Condition Tests
// ============================================================================

test.describe('Video Loading Under Network Conditions', () => {
  // Test each network profile
  for (const [profileKey, profile] of Object.entries(NETWORK_PROFILES)) {
    test(`should load video under ${profile.name} conditions`, async ({ page }) => {
      // Apply network throttling
      const client = await applyNetworkConditions(page, profile);

      try {
        // Navigate to editor
        await page.goto('/editor', { timeout: 60000 });

        // Measure startup time
        const startupTime = await measureNetworkStartup(page);

        console.log(`[${profile.name}] Startup time: ${startupTime.toFixed(0)}ms`);
        console.log(`[${profile.name}] Expected: <${profile.expectedStartup}ms`);

        // Verify startup time is within acceptable range
        expect(startupTime).toBeLessThan(profile.expectedStartup);
      } finally {
        // Remove throttling
        await client.send('Network.emulateNetworkConditions', {
          offline: false,
          downloadThroughput: -1,
          uploadThroughput: -1,
          latency: 0,
        });
      }
    });
  }
});

// ============================================================================
// Test Suite: Rebuffering Under Network Conditions
// ============================================================================

test.describe('Rebuffering Under Network Conditions', () => {
  test('should minimize rebuffering on 4G network', async ({ page }) => {
    const profile = NETWORK_PROFILES.regular4G;
    const client = await applyNetworkConditions(page, profile);

    try {
      await page.goto('/editor', { timeout: 60000 });
      await page.waitForSelector('video', { timeout: 30000 });

      // Play for 30 seconds and measure rebuffering
      const { events, ratio } = await measureRebuffering(page, 30000);

      console.log(`[4G] Rebuffer events: ${events}`);
      console.log(`[4G] Rebuffer ratio: ${(ratio * 100).toFixed(2)}%`);
      console.log(`[4G] Expected: <${(profile.expectedRebuffer * 100).toFixed(0)}%`);

      expect(ratio).toBeLessThan(profile.expectedRebuffer);
    } finally {
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: -1,
        uploadThroughput: -1,
        latency: 0,
      });
    }
  });

  test('should gracefully degrade on 3G network', async ({ page }) => {
    const profile = NETWORK_PROFILES.fast3G;
    const client = await applyNetworkConditions(page, profile);

    try {
      await page.goto('/editor', { timeout: 60000 });
      await page.waitForSelector('video', { timeout: 30000 });

      // Play for 20 seconds
      const { events, ratio } = await measureRebuffering(page, 20000);

      console.log(`[3G] Rebuffer events: ${events}`);
      console.log(`[3G] Rebuffer ratio: ${(ratio * 100).toFixed(2)}%`);

      // 3G should still be under 5% rebuffering with BBA
      expect(ratio).toBeLessThan(profile.expectedRebuffer);
    } finally {
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: -1,
        uploadThroughput: -1,
        latency: 0,
      });
    }
  });
});

// ============================================================================
// Test Suite: Network Switching
// ============================================================================

test.describe('Network Switching During Playback', () => {
  test('should handle WiFi to 3G transition smoothly', async ({ page }) => {
    // Start with WiFi
    let client = await applyNetworkConditions(page, NETWORK_PROFILES.wifi);

    await page.goto('/editor', { timeout: 30000 });
    await page.waitForSelector('video', { timeout: 10000 });

    // Start playback
    const video = page.locator('video').first();
    await video.evaluate((v) => v.play());

    // Play on WiFi for 5 seconds
    await page.waitForTimeout(5000);

    // Switch to 3G
    console.log('[Network] Switching from WiFi to 3G...');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: NETWORK_PROFILES.fast3G.downloadThroughput,
      uploadThroughput: NETWORK_PROFILES.fast3G.uploadThroughput,
      latency: NETWORK_PROFILES.fast3G.latency,
    });

    // Continue playing for 10 seconds
    const { events } = await measureRebuffering(page, 10000);

    console.log(`[Network Switch] Rebuffer events after switch: ${events}`);

    // Should have minimal rebuffering due to BBA algorithm
    expect(events).toBeLessThan(3);

    // Cleanup
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });

  test('should recover from temporary offline state', async ({ page }) => {
    const client = await applyNetworkConditions(page, NETWORK_PROFILES.wifi);

    await page.goto('/editor', { timeout: 30000 });
    await page.waitForSelector('video', { timeout: 10000 });

    // Start playback
    const video = page.locator('video').first();
    await video.evaluate((v) => v.play());

    // Play for 5 seconds to build buffer
    await page.waitForTimeout(5000);

    // Go offline
    console.log('[Network] Going offline...');
    await client.send('Network.emulateNetworkConditions', {
      offline: true,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0,
    });

    // Stay offline for 3 seconds
    await page.waitForTimeout(3000);

    // Come back online
    console.log('[Network] Coming back online...');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: NETWORK_PROFILES.wifi.downloadThroughput,
      uploadThroughput: NETWORK_PROFILES.wifi.uploadThroughput,
      latency: NETWORK_PROFILES.wifi.latency,
    });

    // Wait for recovery
    await page.waitForTimeout(5000);

    // Check video is still playing (not paused due to error)
    const isPaused = await video.evaluate((v) => v.paused);
    const hasError = await video.evaluate((v) => v.error !== null);

    console.log(`[Network Recovery] Paused: ${isPaused}, Error: ${hasError}`);

    expect(hasError).toBe(false);

    // Cleanup
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });
});

// ============================================================================
// Test Suite: Adaptive Quality
// ============================================================================

test.describe('Adaptive Quality Under Network Conditions', () => {
  test('should adapt quality based on network speed', async ({ page }) => {
    // Start with slow 3G
    const client = await applyNetworkConditions(page, NETWORK_PROFILES.slow3G);

    await page.goto('/editor', { timeout: 60000 });
    await page.waitForSelector('video', { timeout: 45000 });

    // Check if video loaded (may be at lower quality)
    const video = page.locator('video').first();
    await expect(video).toBeVisible({ timeout: 30000 });

    // Video should still function under slow network
    const hasSource = await video.evaluate((v) => v.src !== '' || v.currentSrc !== '');
    expect(hasSource).toBe(true);

    // Upgrade to WiFi
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: NETWORK_PROFILES.wifi.downloadThroughput,
      uploadThroughput: NETWORK_PROFILES.wifi.uploadThroughput,
      latency: NETWORK_PROFILES.wifi.latency,
    });

    // Wait for quality upgrade
    await page.waitForTimeout(10000);

    // Video should still be playing without errors
    const errorAfterUpgrade = await video.evaluate((v) => v.error);
    expect(errorAfterUpgrade).toBeNull();

    // Cleanup
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });
});

// ============================================================================
// Test Suite: Network Benchmark Summary
// ============================================================================

test.describe('Network Benchmark Summary', () => {
  test('should generate network performance summary', async ({ page }) => {
    const results: Record<string, { startup: number; passed: boolean }> = {};

    for (const [profileKey, profile] of Object.entries(NETWORK_PROFILES)) {
      const client = await applyNetworkConditions(page, profile);

      try {
        await page.goto('/editor', { timeout: 60000 });
        const startupTime = await measureNetworkStartup(page);

        results[profile.name] = {
          startup: startupTime,
          passed: startupTime < profile.expectedStartup,
        };
      } catch (error) {
        results[profile.name] = {
          startup: 60000,
          passed: false,
        };
      }

      // Reset network
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: -1,
        uploadThroughput: -1,
        latency: 0,
      });
    }

    console.log('\n========================================');
    console.log('NETWORK PERFORMANCE SUMMARY');
    console.log('========================================');
    console.log(JSON.stringify(results, null, 2));
    console.log('========================================\n');

    // WiFi should definitely pass
    expect(results['WiFi']?.passed).toBe(true);
  });
});
