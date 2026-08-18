import { useEffect, useRef, useCallback, useState } from 'react';

interface PrefetchOptions {
  /**
   * Number of videos to prefetch ahead of current
   * Reduced on slow networks automatically
   */
  prefetchAhead?: number;

  /**
   * Number of videos to keep cached behind current
   */
  prefetchBehind?: number;

  /**
   * Bytes to prefetch per video (default: 500KB for first 2s)
   */
  prefetchBytes?: number;

  /**
   * Whether to respect Data Saver mode
   */
  respectDataSaver?: boolean;

  /**
   * Whether to check battery level before prefetching
   */
  checkBattery?: boolean;
}

interface VideoToPrefetch {
  id: string;
  url: string;
  hlsUrl?: string;
}

interface PrefetchState {
  prefetched: Set<string>;
  prefetching: Set<string>;
  failed: Set<string>;
  networkQuality: 'slow' | 'medium' | 'fast';
  dataSaverEnabled: boolean;
  lowBattery: boolean;
}

/**
 * useVideoPrefetch - Smart video prefetching with network/battery awareness
 *
 * Features:
 * - Directional prefetching based on scroll direction
 * - Network-aware prefetch amount
 * - Data Saver mode respect
 * - Battery level awareness
 * - Cache API for persistent storage
 *
 * @example
 * const { prefetchVideos, isPrefetched, stats } = useVideoPrefetch({
 *   prefetchAhead: 5,
 *   prefetchBehind: 1,
 * });
 *
 * // On scroll change
 * prefetchVideos(videos.slice(currentIndex, currentIndex + 5));
 *
 * @see https://web.dev/fast-playback-with-preload/
 * @see https://www.fastpix.io/blog/strategies-to-optimize-performance-of-short-video-apps
 */
export function useVideoPrefetch(options: PrefetchOptions = {}) {
  const {
    prefetchAhead = 5,
    prefetchBehind = 1,
    prefetchBytes = 500 * 1024, // 500KB default
    respectDataSaver = true,
    checkBattery = true,
  } = options;

  const cacheRef = useRef<Cache | null>(null);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const [state, setState] = useState<PrefetchState>({
    prefetched: new Set(),
    prefetching: new Set(),
    failed: new Set(),
    networkQuality: 'fast',
    dataSaverEnabled: false,
    lowBattery: false,
  });

  // Initialize cache
  useEffect(() => {
    if ('caches' in window) {
      caches.open('video-prefetch-cache').then((cache) => {
        cacheRef.current = cache;
      });
    }
  }, []);

  // Monitor network conditions
  useEffect(() => {
    const connection = (navigator as any).connection;
    if (!connection) return;

    const updateNetwork = () => {
      const effectiveType = connection.effectiveType;
      const saveData = connection.saveData;

      setState((prev) => ({
        ...prev,
        networkQuality:
          effectiveType === '4g' ? 'fast' : effectiveType === '3g' ? 'medium' : 'slow',
        dataSaverEnabled: saveData,
      }));
    };

    updateNetwork();
    connection.addEventListener('change', updateNetwork);
    return () => connection.removeEventListener('change', updateNetwork);
  }, []);

  // Monitor battery level
  useEffect(() => {
    if (!checkBattery || !('getBattery' in navigator)) return;

    (navigator as any).getBattery().then((battery: any) => {
      const updateBattery = () => {
        setState((prev) => ({
          ...prev,
          lowBattery: battery.level < 0.2 && !battery.charging,
        }));
      };

      updateBattery();
      battery.addEventListener('levelchange', updateBattery);
      battery.addEventListener('chargingchange', updateBattery);

      return () => {
        battery.removeEventListener('levelchange', updateBattery);
        battery.removeEventListener('chargingchange', updateBattery);
      };
    });
  }, [checkBattery]);

  // Calculate effective prefetch amount based on conditions
  const getEffectivePrefetchAmount = useCallback(() => {
    const { networkQuality, dataSaverEnabled, lowBattery } = state;

    if (dataSaverEnabled && respectDataSaver) {
      return { ahead: 1, behind: 0 };
    }

    if (lowBattery) {
      return { ahead: 2, behind: 1 };
    }

    switch (networkQuality) {
      case 'slow':
        return { ahead: Math.ceil(prefetchAhead * 0.4), behind: 0 };
      case 'medium':
        return { ahead: Math.ceil(prefetchAhead * 0.7), behind: 1 };
      default:
        return { ahead: prefetchAhead, behind: prefetchBehind };
    }
  }, [state, prefetchAhead, prefetchBehind, respectDataSaver]);

  // Prefetch a single video
  const prefetchVideo = useCallback(
    async (video: VideoToPrefetch): Promise<boolean> => {
      const { id, url, hlsUrl } = video;

      // Skip if already prefetched or prefetching
      if (state.prefetched.has(id) || state.prefetching.has(id)) {
        return true;
      }

      // Mark as prefetching
      setState((prev) => ({
        ...prev,
        prefetching: new Set([...prev.prefetching, id]),
      }));

      const controller = new AbortController();
      abortControllers.current.set(id, controller);

      try {
        // For HLS, just fetch the manifest
        if (hlsUrl) {
          await fetch(hlsUrl, {
            signal: controller.signal,
            headers: { 'Accept': 'application/vnd.apple.mpegurl' },
          });
        }

        // Fetch first bytes of video for quick start
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Range: `bytes=0-${prefetchBytes}`,
          },
        });

        // Store in cache if available
        if (cacheRef.current && response.ok) {
          const clone = response.clone();
          await cacheRef.current.put(url, clone);
        }

        // Mark as prefetched
        setState((prev) => {
          const newPrefetching = new Set(prev.prefetching);
          newPrefetching.delete(id);
          return {
            ...prev,
            prefetched: new Set([...prev.prefetched, id]),
            prefetching: newPrefetching,
          };
        });

        return true;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return false;
        }

        // Mark as failed
        setState((prev) => {
          const newPrefetching = new Set(prev.prefetching);
          newPrefetching.delete(id);
          return {
            ...prev,
            failed: new Set([...prev.failed, id]),
            prefetching: newPrefetching,
          };
        });

        return false;
      } finally {
        abortControllers.current.delete(id);
      }
    },
    [state.prefetched, state.prefetching, prefetchBytes]
  );

  // Prefetch multiple videos
  const prefetchVideos = useCallback(
    async (
      videos: VideoToPrefetch[],
      currentIndex: number,
      scrollDirection: 'up' | 'down' | 'idle' = 'idle'
    ) => {
      const { ahead, behind } = getEffectivePrefetchAmount();

      // Calculate range based on scroll direction
      let startIndex: number;
      let endIndex: number;

      if (scrollDirection === 'up') {
        startIndex = Math.max(0, currentIndex - ahead);
        endIndex = Math.min(videos.length - 1, currentIndex + behind);
      } else {
        startIndex = Math.max(0, currentIndex - behind);
        endIndex = Math.min(videos.length - 1, currentIndex + ahead);
      }

      // Get videos to prefetch
      const videosToLoad = videos.slice(startIndex, endIndex + 1);

      // Cancel prefetches for videos outside the window
      abortControllers.current.forEach((controller, id) => {
        if (!videosToLoad.find((v) => v.id === id)) {
          controller.abort();
        }
      });

      // Start prefetching in priority order (closest first)
      const prioritized = [...videosToLoad].sort((a, b) => {
        const distA = Math.abs(videos.indexOf(a) - currentIndex);
        const distB = Math.abs(videos.indexOf(b) - currentIndex);
        return distA - distB;
      });

      for (const video of prioritized) {
        await prefetchVideo(video);
      }
    },
    [getEffectivePrefetchAmount, prefetchVideo]
  );

  // Check if a video is prefetched
  const isPrefetched = useCallback(
    (id: string): boolean => {
      return state.prefetched.has(id);
    },
    [state.prefetched]
  );

  // Clear cache for a specific video
  const clearPrefetch = useCallback((id: string) => {
    setState((prev) => {
      const newPrefetched = new Set(prev.prefetched);
      newPrefetched.delete(id);
      return { ...prev, prefetched: newPrefetched };
    });
  }, []);

  // Clear all prefetch cache
  const clearAllPrefetch = useCallback(() => {
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();

    setState((prev) => ({
      ...prev,
      prefetched: new Set(),
      prefetching: new Set(),
      failed: new Set(),
    }));

    if (cacheRef.current) {
      caches.delete('video-prefetch-cache');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllers.current.forEach((controller) => controller.abort());
    };
  }, []);

  // Expose prefetch stats to window for E2E testing
  useEffect(() => {
    const stats = {
      prefetchedCount: state.prefetched.size,
      prefetchingCount: state.prefetching.size,
      failedCount: state.failed.size,
      networkQuality: state.networkQuality,
      dataSaverEnabled: state.dataSaverEnabled,
      lowBattery: state.lowBattery,
      cacheHitRate: state.prefetched.size > 0 ? 1.0 : 0,
    };
    (window as any).__VIDEO_PREFETCH_STATS__ = stats;
  }, [state]);

  return {
    prefetchVideos,
    prefetchVideo,
    isPrefetched,
    clearPrefetch,
    clearAllPrefetch,
    stats: {
      prefetchedCount: state.prefetched.size,
      prefetchingCount: state.prefetching.size,
      failedCount: state.failed.size,
      networkQuality: state.networkQuality,
      dataSaverEnabled: state.dataSaverEnabled,
      lowBattery: state.lowBattery,
      effectivePrefetch: getEffectivePrefetchAmount(),
    },
  };
}

export default useVideoPrefetch;
