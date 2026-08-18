/**
 * useViewportPreload - TikTok-style viewport-based video preloading
 *
 * Based on research (2025):
 * - Viewport-based preload = 30-40% black frame reduction
 * - Predicts which segments user will see in next 5 seconds
 * - Prioritizes by proximity to current playback position
 * - scrollMargin (Chrome 120+) for earlier preload during scroll
 *
 * Strategy:
 * 1. Calculate visible window (current + lookahead)
 * 2. Find segments entering viewport
 * 3. Prioritize by proximity
 * 4. Trigger prefetch for top N segments
 *
 * @see https://frontendmasters.com/blog/simplify-lazy-loading-with-intersection-observers-scrollmargin/
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { prefetchVideoParallel } from '@/lib/parallelPrefetcher';

/**
 * Check if scrollMargin is supported (Chrome 120+)
 * @see https://caniuse.com/mdn-api_intersectionobserver_scrollmargin
 */
function isScrollMarginSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Feature detection: create observer with scrollMargin
    const observer = new IntersectionObserver(() => {}, {
      // @ts-expect-error scrollMargin is new and not in all TS definitions
      scrollMargin: '100px',
    });
    observer.disconnect();
    return true;
  } catch {
    return false;
  }
}

interface Segment {
  type: 'split' | 'fullscreen';
  startFrame: number;
  durationFrames: number;
  bRollUrl?: string;
}

interface PrioritizedSegment extends Segment {
  priority: number;
  framesUntilVisible: number;
  secondsUntilVisible: number;
}

interface ViewportPreloadOptions {
  fps?: number;
  lookaheadSeconds?: number;  // How far ahead to look
  maxPreload?: number;        // Max segments to preload at once
  enabled?: boolean;
}

interface PreloadState {
  loading: Set<string>;
  loaded: Set<string>;
  failed: Set<string>;
}

export function useViewportPreload(
  segments: Segment[],
  currentFrame: number,
  options: ViewportPreloadOptions = {}
) {
  const {
    fps = 30,
    lookaheadSeconds = 5,
    maxPreload = 2,
    enabled = true,
  } = options;

  const [state, setState] = useState<PreloadState>({
    loading: new Set(),
    loaded: new Set(),
    failed: new Set(),
  });

  const lastPreloadedRef = useRef<Set<string>>(new Set());

  // Calculate visible window (current position + lookahead)
  const visibleWindow = useMemo(() => ({
    start: currentFrame,
    end: currentFrame + (fps * lookaheadSeconds),
  }), [currentFrame, fps, lookaheadSeconds]);

  // Find segments entering viewport and prioritize by proximity
  const prioritizedSegments = useMemo((): PrioritizedSegment[] => {
    return segments
      .filter((seg) => {
        // Only consider split segments with B-roll URLs
        if (seg.type !== 'split' || !seg.bRollUrl) return false;

        // Skip blob URLs (already cached)
        if (seg.bRollUrl.startsWith('blob:')) return false;

        // Segment must start within visible window or be currently visible
        const segmentEnd = seg.startFrame + seg.durationFrames;
        const isVisible = seg.startFrame <= visibleWindow.end && segmentEnd >= visibleWindow.start;
        const isUpcoming = seg.startFrame > currentFrame && seg.startFrame <= visibleWindow.end;

        return isVisible || isUpcoming;
      })
      .map((seg) => {
        const framesUntilVisible = Math.max(0, seg.startFrame - currentFrame);
        const secondsUntilVisible = framesUntilVisible / fps;

        // Priority: higher for closer segments
        // 100 = currently visible, 0 = at edge of lookahead window
        const priority = Math.max(0, 100 - (secondsUntilVisible * (100 / lookaheadSeconds)));

        return {
          ...seg,
          priority,
          framesUntilVisible,
          secondsUntilVisible,
        };
      })
      .sort((a, b) => b.priority - a.priority);
  }, [segments, currentFrame, visibleWindow, fps, lookaheadSeconds]);

  // Get top segments to preload
  const segmentsToPreload = useMemo(() => {
    return prioritizedSegments
      .filter((seg) => {
        const url = seg.bRollUrl!;
        return !state.loaded.has(url) && !state.loading.has(url) && !state.failed.has(url);
      })
      .slice(0, maxPreload);
  }, [prioritizedSegments, state, maxPreload]);

  // Preload segments
  const preloadSegments = useCallback(async () => {
    if (!enabled || segmentsToPreload.length === 0) return;

    const urlsToPreload = segmentsToPreload
      .map((seg) => seg.bRollUrl!)
      .filter((url) => !lastPreloadedRef.current.has(url));

    if (urlsToPreload.length === 0) return;

    // Mark as loading
    setState((prev) => ({
      ...prev,
      loading: new Set([...prev.loading, ...urlsToPreload]),
    }));

    // Preload in parallel
    for (const url of urlsToPreload) {
      lastPreloadedRef.current.add(url);

      try {
        await prefetchVideoParallel(url, {
          preloadFirstFrame: true,
          skipIfCached: true,
        });

        setState((prev) => ({
          ...prev,
          loading: new Set([...prev.loading].filter((u) => u !== url)),
          loaded: new Set([...prev.loaded, url]),
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          loading: new Set([...prev.loading].filter((u) => u !== url)),
          failed: new Set([...prev.failed, url]),
        }));
      }
    }
  }, [enabled, segmentsToPreload]);

  // Trigger preload when segments change
  useEffect(() => {
    preloadSegments();
  }, [preloadSegments]);

  // Get next segment info
  const nextSegment = prioritizedSegments[0] || null;

  // Check if a URL is preloaded
  const isPreloaded = useCallback(
    (url: string): boolean => state.loaded.has(url),
    [state.loaded]
  );

  // Get preload progress
  const getProgress = useCallback((): number => {
    const total = prioritizedSegments.length;
    if (total === 0) return 100;
    return Math.round((state.loaded.size / total) * 100);
  }, [prioritizedSegments.length, state.loaded.size]);

  return {
    // Current state
    loading: state.loading.size,
    loaded: state.loaded.size,
    failed: state.failed.size,

    // Prioritized list
    prioritizedSegments,
    segmentsToPreload,

    // Next segment info
    nextSegment,
    nextSegmentUrl: nextSegment?.bRollUrl || null,
    secondsUntilNext: nextSegment?.secondsUntilVisible || null,

    // Checks
    isPreloaded,
    getProgress,

    // Stats
    stats: {
      windowStart: visibleWindow.start,
      windowEnd: visibleWindow.end,
      segmentsInWindow: prioritizedSegments.length,
      preloadedCount: state.loaded.size,
      loadingCount: state.loading.size,
      failedCount: state.failed.size,
      progress: getProgress(),
    },
  };
}

/**
 * useScrollMarginPreload - IntersectionObserver with scrollMargin for early preload
 *
 * Chrome 120+ feature: Trigger intersection before element enters viewport
 * Perfect for preloading videos during scroll momentum
 *
 * @example
 * const { ref, isPreloading, isPreloaded } = useScrollMarginPreload(videoUrl, {
 *   scrollMargin: '200px',  // Start preloading 200px before visible
 * });
 * return <div ref={ref}><video src={videoUrl} /></div>;
 */
interface ScrollMarginOptions {
  scrollMargin?: string;  // CSS margin string, e.g. '200px' or '50%'
  threshold?: number;     // 0-1, when to trigger
  enabled?: boolean;
  onPreloadStart?: () => void;
  onPreloadComplete?: () => void;
}

export function useScrollMarginPreload(
  videoUrl: string | null,
  options: ScrollMarginOptions = {}
) {
  const {
    scrollMargin = '200px',
    threshold = 0,
    enabled = true,
    onPreloadStart,
    onPreloadComplete,
  } = options;

  const elementRef = useRef<HTMLDivElement | null>(null);
  const [isPreloading, setIsPreloading] = useState(false);
  const [isPreloaded, setIsPreloaded] = useState(false);
  const [hasScrollMargin] = useState(() => isScrollMarginSupported());

  // Preload function
  const preload = useCallback(async () => {
    if (!videoUrl || isPreloaded || isPreloading) return;

    setIsPreloading(true);
    onPreloadStart?.();

    try {
      await prefetchVideoParallel(videoUrl, {
        preloadFirstFrame: true,
        skipIfCached: true,
      });
      setIsPreloaded(true);
      onPreloadComplete?.();
    } catch (error) {
      console.warn('[ScrollMarginPreload] Failed:', videoUrl, error);
    } finally {
      setIsPreloading(false);
    }
  }, [videoUrl, isPreloaded, isPreloading, onPreloadStart, onPreloadComplete]);

  // Setup IntersectionObserver with scrollMargin
  useEffect(() => {
    if (!enabled || !videoUrl || isPreloaded || !elementRef.current) return;

    const observerOptions: IntersectionObserverInit = {
      threshold,
    };

    // Add scrollMargin if supported (Chrome 120+)
    if (hasScrollMargin) {
      // @ts-expect-error scrollMargin is new API
      observerOptions.scrollMargin = scrollMargin;
    } else {
      // Fallback: use rootMargin (works differently but similar effect)
      observerOptions.rootMargin = scrollMargin;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          preload();
          observer.disconnect();
        }
      });
    }, observerOptions);

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [enabled, videoUrl, isPreloaded, scrollMargin, threshold, hasScrollMargin, preload]);

  return {
    ref: elementRef,
    isPreloading,
    isPreloaded,
    hasScrollMargin,
    preload, // Manual trigger
  };
}

/**
 * useMultiVideoScrollPreload - Preload multiple videos with scrollMargin
 *
 * Useful for preloading a list of upcoming segments
 */
interface MultiVideoOptions {
  scrollMargin?: string;
  maxConcurrent?: number;
  enabled?: boolean;
}

export function useMultiVideoScrollPreload(
  videos: Array<{ url: string; priority?: number }>,
  options: MultiVideoOptions = {}
) {
  const {
    scrollMargin = '300px',
    maxConcurrent = 2,
    enabled = true,
  } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [preloadedUrls, setPreloadedUrls] = useState<Set<string>>(new Set());
  const [loadingUrls, setLoadingUrls] = useState<Set<string>>(new Set());
  const [hasScrollMargin] = useState(() => isScrollMarginSupported());

  // Sort by priority
  const sortedVideos = useMemo(() => {
    return [...videos].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [videos]);

  // Preload next batch
  const preloadNext = useCallback(async () => {
    const toPreload = sortedVideos
      .filter((v) => !preloadedUrls.has(v.url) && !loadingUrls.has(v.url))
      .slice(0, maxConcurrent);

    if (toPreload.length === 0) return;

    const urls = toPreload.map((v) => v.url);
    setLoadingUrls((prev) => new Set([...prev, ...urls]));

    await Promise.all(
      urls.map(async (url) => {
        try {
          await prefetchVideoParallel(url, {
            preloadFirstFrame: true,
            skipIfCached: true,
          });
          setPreloadedUrls((prev) => new Set([...prev, url]));
        } catch {
          // Ignore errors, continue with others
        } finally {
          setLoadingUrls((prev) => {
            const next = new Set(prev);
            next.delete(url);
            return next;
          });
        }
      })
    );
  }, [sortedVideos, preloadedUrls, loadingUrls, maxConcurrent]);

  // Setup IntersectionObserver for container
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const observerOptions: IntersectionObserverInit = {
      threshold: 0,
    };

    if (hasScrollMargin) {
      // @ts-expect-error scrollMargin is new API
      observerOptions.scrollMargin = scrollMargin;
    } else {
      observerOptions.rootMargin = scrollMargin;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          preloadNext();
        }
      });
    }, observerOptions);

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [enabled, scrollMargin, hasScrollMargin, preloadNext]);

  return {
    containerRef,
    preloadedUrls,
    loadingUrls,
    preloadedCount: preloadedUrls.size,
    loadingCount: loadingUrls.size,
    totalCount: videos.length,
    progress: videos.length > 0
      ? Math.round((preloadedUrls.size / videos.length) * 100)
      : 100,
    hasScrollMargin,
    preloadNext, // Manual trigger
  };
}

export default useViewportPreload;
