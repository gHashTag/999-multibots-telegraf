// ===============================
// Video Preloading Hook
// Preloads next videos in feed for instant playback
// ===============================

import { useEffect, useRef, useCallback } from 'react';

interface PreloadOptions {
  // How many videos ahead to preload
  preloadCount?: number;
  // Preload when current video reaches this percentage
  preloadThreshold?: number;
  // Max concurrent preloads
  maxConcurrent?: number;
}

interface VideoItem {
  id: string | number;
  videoUrl: string;
}

// Global preload cache to avoid duplicate requests
const preloadCache = new Map<string, HTMLVideoElement>();
const preloadQueue = new Set<string>();

export function useVideoPreload(
  videos: VideoItem[],
  currentIndex: number,
  options: PreloadOptions = {}
) {
  const {
    preloadCount = 2,
    preloadThreshold = 0.5,
    maxConcurrent = 2,
  } = options;

  const activePreloads = useRef<Set<string>>(new Set());

  // Preload a single video
  const preloadVideo = useCallback((url: string): Promise<void> => {
    // Skip if already cached or in queue
    if (preloadCache.has(url) || preloadQueue.has(url)) {
      return Promise.resolve();
    }

    // Check concurrent limit
    if (activePreloads.current.size >= maxConcurrent) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      preloadQueue.add(url);
      activePreloads.current.add(url);

      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;

      const cleanup = () => {
        preloadQueue.delete(url);
        activePreloads.current.delete(url);
      };

      video.onloadeddata = () => {
        preloadCache.set(url, video);
        cleanup();
        resolve();
      };

      video.onerror = () => {
        cleanup();
        resolve();
      };

      // Set timeout to prevent hanging
      setTimeout(() => {
        if (!preloadCache.has(url)) {
          cleanup();
          resolve();
        }
      }, 10000);

      video.src = url;
      video.load();
    });
  }, [maxConcurrent]);

  // Preload next videos
  const preloadNext = useCallback(() => {
    if (!videos || videos.length === 0) return;

    const startIndex = currentIndex + 1;
    const endIndex = Math.min(startIndex + preloadCount, videos.length);

    for (let i = startIndex; i < endIndex; i++) {
      const video = videos[i];
      if (video?.videoUrl) {
        preloadVideo(video.videoUrl);
      }
    }
  }, [currentIndex, preloadCount, videos, preloadVideo]);

  // Get preloaded video element if available
  const getPreloadedVideo = useCallback((url: string): HTMLVideoElement | null => {
    return preloadCache.get(url) || null;
  }, []);

  // Check if video is preloaded
  const isPreloaded = useCallback((url: string): boolean => {
    return preloadCache.has(url);
  }, []);

  // Clear old preloads to free memory
  const clearOldPreloads = useCallback((keepUrls: string[]) => {
    const keepSet = new Set(keepUrls);

    for (const [url, video] of preloadCache.entries()) {
      if (!keepSet.has(url)) {
        video.src = '';
        video.load();
        preloadCache.delete(url);
      }
    }
  }, []);

  // Auto-preload on index change
  useEffect(() => {
    if (!videos || videos.length === 0) return;

    preloadNext();

    // Clear videos that are too far behind
    const keepUrls = videos
      .slice(Math.max(0, currentIndex - 1), currentIndex + preloadCount + 1)
      .map(v => v.videoUrl)
      .filter(Boolean);

    clearOldPreloads(keepUrls);
  }, [currentIndex, preloadNext, clearOldPreloads, videos, preloadCount]);

  return {
    preloadVideo,
    preloadNext,
    getPreloadedVideo,
    isPreloaded,
    clearOldPreloads,
    cacheSize: preloadCache.size,
  };
}

// Hook for tracking video progress and triggering preload
export function useVideoProgress(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onThresholdReached: () => void,
  threshold = 0.5
) {
  const hasTriggered = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    hasTriggered.current = false;

    const handleTimeUpdate = () => {
      if (hasTriggered.current) return;

      const progress = video.currentTime / video.duration;
      if (progress >= threshold) {
        hasTriggered.current = true;
        onThresholdReached();
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [videoRef, onThresholdReached, threshold]);
}

// Utility to preload image
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

// Preload multiple images
export function preloadImages(urls: string[]): Promise<void[]> {
  return Promise.all(urls.map(preloadImage));
}
