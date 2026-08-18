/**
 * ParallelPrefetcher - Unified parallel video prefetching
 *
 * Based on research (2025):
 * - Sequential prefetch phases waste 15-25% startup time
 * - Parallel execution significantly reduces TTFF
 *
 * Combines all prefetch strategies into single parallel operation:
 * 1. Range request (metadata + first keyframes)
 * 2. Preload link hint (browser optimization)
 * 3. IndexedDB cache check
 * 4. Full prefetch (if not cached)
 * 5. First-frame JPEG preload
 */

import { prefetch } from 'remotion';
import { preloadVideo } from '@remotion/preload';
import { selectOptimalFormats, getFormatInfo } from './formatSelector';
import { behaviorTracker } from './behaviorTracker';

interface PrefetchResult {
  url: string;
  metadataLoaded: boolean;
  cached: boolean;
  prefetched: boolean;
  firstFrameLoaded: boolean;
  durationMs: number;
}

interface PrefetchOptions {
  rangeBytes?: number;       // Default: 1MB
  preloadFirstFrame?: boolean;
  checkCache?: boolean;
  skipIfCached?: boolean;
}

// Track active prefetches to avoid duplicates
const activePrefetches = new Set<string>();
const completedPrefetches = new Map<string, PrefetchResult>();

/**
 * Add preload link hint to document head
 */
function addPreloadHint(url: string, type: 'video' | 'image' = 'video'): boolean {
  if (!url || url.startsWith('blob:')) return false;

  // Check if hint already exists
  const existingHint = document.querySelector(`link[href="${url}"]`);
  if (existingHint) return true;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  document.head.appendChild(link);

  return true;
}

/**
 * Check if video is cached in IndexedDB
 */
async function checkIndexedDBCache(url: string): Promise<boolean> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vibee-broll-cache', 1);
      request.onerror = () => reject(new Error('Failed to open cache DB'));
      request.onsuccess = () => resolve(request.result);
    });

    const transaction = db.transaction('broll-blobs', 'readonly');
    const store = transaction.objectStore('broll-blobs');
    const index = store.index('url');

    return new Promise((resolve) => {
      const request = index.get(url);
      request.onsuccess = () => {
        const entry = request.result;
        if (entry && entry.expiresAt > Date.now()) {
          resolve(true);
        } else {
          resolve(false);
        }
      };
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Get first-frame JPEG URL from video URL
 */
function getFirstFrameUrl(videoUrl: string): string {
  // Normalize to base video name: strip quality/format/optimization suffixes
  return videoUrl
    .replace(/_360p\.mp4$/, '.mp4')
    .replace(/_720p\.mp4$/, '.mp4')
    .replace(/_1080p\.mp4$/, '.mp4')
    .replace(/_opt\.mp4$/, '.mp4')
    .replace(/\.av1\.mp4$/, '.mp4')
    .replace(/\.webm$/, '.mp4')
    .replace(/\.mp4$/, '_first.jpg');
}

/**
 * Prefetch video with all strategies in parallel
 */
export async function prefetchVideoParallel(
  url: string,
  options: PrefetchOptions = {}
): Promise<PrefetchResult> {
  const {
    rangeBytes = 1048575, // 1MB - 1 byte
    preloadFirstFrame = true,
    checkCache = true,
    skipIfCached = true,
  } = options;

  // Check if already prefetching or completed
  if (activePrefetches.has(url)) {
    return completedPrefetches.get(url) || {
      url,
      metadataLoaded: false,
      cached: false,
      prefetched: false,
      firstFrameLoaded: false,
      durationMs: 0,
    };
  }

  const cached = completedPrefetches.get(url);
  if (cached) return cached;

  // Mark as active
  activePrefetches.add(url);
  const startTime = performance.now();

  // Build parallel promises
  const promises: Promise<any>[] = [];

  // 1. Range request for metadata + first keyframes
  promises.push(
    fetch(url, {
      headers: { 'Range': `bytes=0-${rangeBytes}` },
      priority: 'high',
    } as RequestInit).catch(() => null)
  );

  // 2. Add preload link hint (synchronous)
  const hintAdded = addPreloadHint(url, 'video');
  promises.push(Promise.resolve(hintAdded));

  // 3. Check IndexedDB cache
  if (checkCache) {
    promises.push(checkIndexedDBCache(url).catch(() => false));
  } else {
    promises.push(Promise.resolve(false));
  }

  // 4. Preload first-frame JPEG
  if (preloadFirstFrame) {
    const firstFrameUrl = getFirstFrameUrl(url);
    promises.push(
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = firstFrameUrl;
      })
    );
    addPreloadHint(firstFrameUrl, 'image');
  } else {
    promises.push(Promise.resolve(false));
  }

  // Execute all in parallel
  const results = await Promise.allSettled(promises);

  const metadataLoaded = results[0].status === 'fulfilled' && results[0].value !== null;
  const isCached = results[2].status === 'fulfilled' && results[2].value === true;
  const firstFrameLoaded = results[3].status === 'fulfilled' && results[3].value === true;

  // 5. Full prefetch (only if not cached)
  let prefetched = false;
  if (!isCached || !skipIfCached) {
    try {
      // Use Remotion's preload API
      preloadVideo(url);

      // Also use Remotion's prefetch for composition use
      const prefetcher = prefetch(url);

      // Don't await full prefetch - let it run in background
      prefetched = true;
    } catch {
      prefetched = false;
    }
  }

  const durationMs = performance.now() - startTime;

  const result: PrefetchResult = {
    url,
    metadataLoaded,
    cached: isCached,
    prefetched,
    firstFrameLoaded,
    durationMs,
  };

  // Store result and remove from active
  completedPrefetches.set(url, result);
  activePrefetches.delete(url);

  return result;
}

/**
 * Prefetch multiple videos in parallel with concurrency limit
 * Automatically selects optimal formats (VP9/WebM when available)
 */
export async function prefetchVideosParallel(
  urls: string[],
  options: PrefetchOptions & { maxConcurrent?: number; autoSelectFormat?: boolean } = {}
): Promise<PrefetchResult[]> {
  const { maxConcurrent = 3, autoSelectFormat = true, ...prefetchOptions } = options;

  const results: PrefetchResult[] = [];
  const validUrls = urls.filter((url) => url && !url.startsWith('blob:'));

  // Select optimal formats (VP9/WebM when available, optimized H.264 otherwise)
  let urlsToFetch = validUrls;
  if (autoSelectFormat) {
    try {
      const formatMap = await selectOptimalFormats(validUrls);
      urlsToFetch = validUrls.map((url) => formatMap.get(url) || url);

      // Log format selections
      for (let i = 0; i < validUrls.length; i++) {
        if (validUrls[i] !== urlsToFetch[i]) {
          const info = getFormatInfo(urlsToFetch[i]);
          console.log(`[Prefetch] ${validUrls[i]} → ${urlsToFetch[i]} (${info.codec})`);
        }
      }
    } catch (error) {
      console.warn('[Prefetch] Format selection failed, using original URLs:', error);
    }
  }

  // Process in batches
  for (let i = 0; i < urlsToFetch.length; i += maxConcurrent) {
    const batch = urlsToFetch.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map((url) => prefetchVideoParallel(url, prefetchOptions))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Clear prefetch tracking (for testing)
 */
export function clearPrefetchCache(): void {
  activePrefetches.clear();
  completedPrefetches.clear();
}

/**
 * Get prefetch stats
 */
export function getPrefetchStats(): {
  active: number;
  completed: number;
  cached: number;
} {
  const cached = [...completedPrefetches.values()].filter((r) => r.cached).length;
  return {
    active: activePrefetches.size,
    completed: completedPrefetches.size,
    cached,
  };
}

/**
 * Segment interface for behavior tracking
 */
interface Segment {
  id: string;
  url: string;
  startFrame: number;
  endFrame: number;
}

/**
 * Smart prefetch with ML-based prediction
 * Uses behavior tracker to prioritize segments user is likely to watch
 *
 * Research (2025):
 * - Cloudflare Speed Brain: ML-based prefetching
 * - Improves cache hit rate by 25%+
 */
export async function smartPrefetch(
  segments: Segment[],
  currentFrame: number,
  options: PrefetchOptions & { maxConcurrent?: number } = {}
): Promise<PrefetchResult[]> {
  // Get ML-predicted segments in priority order
  const priorityUrls = behaviorTracker.getPrefetchPriority(currentFrame, segments);

  if (priorityUrls.length === 0) {
    // No prediction available, use sequential
    const sequential = segments
      .filter((s) => s.startFrame > currentFrame)
      .sort((a, b) => a.startFrame - b.startFrame)
      .slice(0, 3)
      .map((s) => s.url);

    return prefetchVideosParallel(sequential, options);
  }

  console.log('[SmartPrefetch] Predicted priority:', priorityUrls);

  // Prefetch in priority order
  return prefetchVideosParallel(priorityUrls, options);
}

/**
 * Track segment view for ML model
 */
export function trackSegmentView(segment: Segment): void {
  behaviorTracker.trackSegmentStart(segment);
}

/**
 * Track segment completion for ML model
 */
export function trackSegmentComplete(
  segmentId: string,
  watchedDuration: number,
  completed: boolean
): void {
  behaviorTracker.trackSegmentEnd(segmentId, watchedDuration, completed);
}

export default prefetchVideoParallel;
