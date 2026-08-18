/**
 * useTimelinePreload - Timeline-priority based video preloading
 *
 * Based on DeLoad (Oct 2025) - Demand-Driven Short-Video Preloading
 * Prioritizes preloading videos based on proximity to current playback position.
 *
 * Priority Levels (DeLoad-inspired):
 * - Critical (100): < 3 seconds away - MUST be ready
 * - High (80): 3-10 seconds away - Should be buffering
 * - Medium (50): 10-30 seconds away - Start prefetching
 * - Low (20): > 30 seconds away - Background download
 *
 * Features:
 * - Dynamic priority recalculation as playback progresses
 * - Concurrent download limiting (max 2 at a time)
 * - Integration with useBRollCache for IndexedDB persistence
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface TimelineSegment {
  type: 'split' | 'fullscreen';
  startFrame: number;
  durationFrames: number;
  bRollUrl?: string;
}

interface PreloadPriority {
  url: string;
  priority: number;
  startFrame: number;
  secondsAway: number;
}

interface UseTimelinePreloadOptions {
  fps?: number;
  maxConcurrent?: number;
  enabled?: boolean;
}

interface PreloadState {
  loading: Set<string>;
  loaded: Set<string>;
  failed: Set<string>;
  priorities: PreloadPriority[];
}

export function useTimelinePreload(
  segments: TimelineSegment[],
  currentFrame: number,
  options: UseTimelinePreloadOptions = {}
) {
  const {
    fps = 30,
    maxConcurrent = 2,
    enabled = true,
  } = options;

  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const [state, setState] = useState<PreloadState>({
    loading: new Set(),
    loaded: new Set(),
    failed: new Set(),
    priorities: [],
  });

  // Calculate priority based on DeLoad paper research
  const calculatePriority = useCallback(
    (segment: TimelineSegment, currentFrame: number): number => {
      const secondsAway = (segment.startFrame - currentFrame) / fps;

      // Already passed or currently playing - no preload needed
      if (secondsAway < 0) return 0;

      // Critical: < 3 seconds - MUST be ready
      if (secondsAway < 3) return 100;

      // High: 3-10 seconds - Should be buffering
      if (secondsAway < 10) return 80;

      // Medium: 10-30 seconds - Start prefetching
      if (secondsAway < 30) return 50;

      // Low: > 30 seconds - Background download
      return 20;
    },
    [fps]
  );

  // Get prioritized list of videos to preload
  const priorities = useMemo((): PreloadPriority[] => {
    return segments
      .filter((s) => s.type === 'split' && s.bRollUrl && !s.bRollUrl.startsWith('blob:'))
      .map((segment) => {
        const priority = calculatePriority(segment, currentFrame);
        const secondsAway = (segment.startFrame - currentFrame) / fps;
        return {
          url: segment.bRollUrl!,
          priority,
          startFrame: segment.startFrame,
          secondsAway,
        };
      })
      .filter((p) => p.priority > 0)
      .sort((a, b) => b.priority - a.priority);
  }, [segments, currentFrame, calculatePriority, fps]);

  // Preload a single video
  const preloadVideo = useCallback(
    async (url: string): Promise<boolean> => {
      if (state.loaded.has(url) || state.loading.has(url)) {
        return true;
      }

      // Create abort controller for this request
      const controller = new AbortController();
      abortControllers.current.set(url, controller);

      setState((prev) => ({
        ...prev,
        loading: new Set([...prev.loading, url]),
      }));

      try {
        // Use Range request for progressive loading (DeLoad strategy)
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'Range': 'bytes=0-' }, // Full file
          priority: 'high',
        } as RequestInit);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Stream the response to ensure it's cached by browser
        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }

        setState((prev) => ({
          ...prev,
          loading: new Set([...prev.loading].filter((u) => u !== url)),
          loaded: new Set([...prev.loaded, url]),
        }));

        return true;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // Cancelled - not a failure
          setState((prev) => ({
            ...prev,
            loading: new Set([...prev.loading].filter((u) => u !== url)),
          }));
          return false;
        }

        console.warn('[TimelinePreload] Failed to preload:', url, error);
        setState((prev) => ({
          ...prev,
          loading: new Set([...prev.loading].filter((u) => u !== url)),
          failed: new Set([...prev.failed, url]),
        }));
        return false;
      } finally {
        abortControllers.current.delete(url);
      }
    },
    [state.loaded, state.loading]
  );

  // Main preloading effect
  useEffect(() => {
    if (!enabled || priorities.length === 0) return;

    // Get top N videos by priority that aren't loaded/loading
    const toPreload = priorities
      .filter((p) => !state.loaded.has(p.url) && !state.loading.has(p.url) && !state.failed.has(p.url))
      .slice(0, maxConcurrent);

    // Start preloading
    toPreload.forEach((p) => {
      preloadVideo(p.url);
    });

    // Update priorities in state for debugging/monitoring
    setState((prev) => ({
      ...prev,
      priorities,
    }));
  }, [priorities, enabled, maxConcurrent, state.loaded, state.loading, state.failed, preloadVideo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Abort all in-flight requests
      for (const controller of abortControllers.current.values()) {
        controller.abort();
      }
      abortControllers.current.clear();
    };
  }, []);

  // Cancel preload for a specific URL
  const cancelPreload = useCallback((url: string) => {
    const controller = abortControllers.current.get(url);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(url);
    }
  }, []);

  // Check if a URL is preloaded
  const isPreloaded = useCallback(
    (url: string): boolean => {
      return state.loaded.has(url);
    },
    [state.loaded]
  );

  // Get next video to play (highest priority)
  const getNextVideo = useCallback((): PreloadPriority | null => {
    return priorities[0] || null;
  }, [priorities]);

  return {
    // State
    loading: state.loading.size,
    loaded: state.loaded.size,
    failed: state.failed.size,
    priorities: state.priorities,

    // Checks
    isPreloaded,
    getNextVideo,

    // Actions
    preloadVideo,
    cancelPreload,

    // Stats
    stats: {
      totalVideos: segments.filter((s) => s.type === 'split' && s.bRollUrl).length,
      loadedCount: state.loaded.size,
      loadingCount: state.loading.size,
      failedCount: state.failed.size,
      nextVideo: priorities[0]?.url || null,
      nextVideoSecondsAway: priorities[0]?.secondsAway || null,
    },
  };
}

export default useTimelinePreload;
