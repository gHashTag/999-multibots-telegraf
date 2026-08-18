import { useEffect, useRef, useCallback } from 'react';

interface UseVideoAutoplayOptions {
  threshold?: number;
  rootMargin?: string;
}

/**
 * Hook to autoplay/pause video based on visibility in viewport
 * Uses IntersectionObserver for performance
 */
export function useVideoAutoplay(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  options: UseVideoAutoplayOptions = {}
) {
  const { threshold = 0.5, rootMargin = '0px' } = options;
  const isVisibleRef = useRef(false);

  const handleVisibilityChange = useCallback((isVisible: boolean) => {
    const video = videoRef.current;
    if (!video) return;

    isVisibleRef.current = isVisible;

    if (isVisible) {
      // Play when visible
      video.play().catch(() => {
        // Autoplay was prevented, likely needs user interaction first
      });
    } else {
      // Pause when not visible
      video.pause();
    }
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          handleVisibilityChange(entry.isIntersecting);
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, [videoRef, threshold, rootMargin, handleVisibilityChange]);

  return { isVisible: isVisibleRef.current };
}

/**
 * Hook for managing multiple videos - only one plays at a time
 */
export function useVideoPlaybackManager() {
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);

  const registerVideo = useCallback((video: HTMLVideoElement, isVisible: boolean) => {
    if (isVisible) {
      // Pause previous active video
      if (activeVideoRef.current && activeVideoRef.current !== video) {
        activeVideoRef.current.pause();
      }
      activeVideoRef.current = video;
      video.play().catch(() => {});
    } else if (activeVideoRef.current === video) {
      video.pause();
      activeVideoRef.current = null;
    }
  }, []);

  return { registerVideo };
}
