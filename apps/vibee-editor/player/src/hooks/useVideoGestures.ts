import { useRef, useCallback, useEffect, useState } from 'react';

interface UseVideoGesturesOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onVolumeChange?: (volume: number) => void;
  onBrightnessChange?: (brightness: number) => void;
  onSeek?: (time: number) => void;
  enabled?: boolean;
}

interface GestureState {
  type: 'volume' | 'brightness' | 'seek' | null;
  value: number;
  visible: boolean;
}

/**
 * Hook for TikTok-style video gesture controls
 * - Swipe up/down on left side: brightness
 * - Swipe up/down on right side: volume
 * - Swipe left/right: seek
 */
export function useVideoGestures({
  videoRef,
  onVolumeChange,
  onBrightnessChange,
  onSeek,
  enabled = true,
}: UseVideoGesturesOptions) {
  const [gestureState, setGestureState] = useState<GestureState>({
    type: null,
    value: 0,
    visible: false,
  });

  const startX = useRef(0);
  const startY = useRef(0);
  const startVolume = useRef(1);
  const startBrightness = useRef(1);
  const startTime = useRef(0);
  const containerWidth = useRef(0);
  const isGesturing = useRef(false);
  const gestureType = useRef<'volume' | 'brightness' | 'seek' | null>(null);

  const hideIndicator = useCallback(() => {
    setGestureState(prev => ({ ...prev, visible: false }));
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;

    const video = videoRef.current;
    const container = e.currentTarget as HTMLElement;
    if (!video || !container) return;

    const touch = e.touches[0];
    const rect = container.getBoundingClientRect();

    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startVolume.current = video.volume;
    startBrightness.current = 1; // Would need CSS filter for brightness
    startTime.current = video.currentTime;
    containerWidth.current = rect.width;
    isGesturing.current = false;
    gestureType.current = null;

    // Determine gesture type based on touch position
    const relativeX = (touch.clientX - rect.left) / rect.width;
    if (relativeX < 0.3) {
      gestureType.current = 'brightness';
    } else if (relativeX > 0.7) {
      gestureType.current = 'volume';
    } else {
      gestureType.current = 'seek';
    }
  }, [enabled, videoRef]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || gestureType.current === null) return;

    const video = videoRef.current;
    if (!video) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - startX.current;
    const deltaY = touch.clientY - startY.current;

    // Start gesture after threshold
    if (!isGesturing.current) {
      const threshold = 10;
      if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
        isGesturing.current = true;
      } else {
        return;
      }
    }

    e.preventDefault();

    if (gestureType.current === 'volume') {
      // Volume: swipe up to increase, down to decrease
      const volumeChange = -deltaY / 200;
      const newVolume = Math.max(0, Math.min(1, startVolume.current + volumeChange));
      video.volume = newVolume;
      onVolumeChange?.(newVolume);
      setGestureState({
        type: 'volume',
        value: Math.round(newVolume * 100),
        visible: true,
      });
    } else if (gestureType.current === 'brightness') {
      // Brightness: swipe up to increase, down to decrease
      const brightnessChange = -deltaY / 200;
      const newBrightness = Math.max(0.2, Math.min(1.5, startBrightness.current + brightnessChange));
      onBrightnessChange?.(newBrightness);
      setGestureState({
        type: 'brightness',
        value: Math.round(newBrightness * 100),
        visible: true,
      });
    } else if (gestureType.current === 'seek') {
      // Seek: swipe left/right
      const seekAmount = (deltaX / containerWidth.current) * video.duration * 0.5;
      const newTime = Math.max(0, Math.min(video.duration, startTime.current + seekAmount));
      video.currentTime = newTime;
      onSeek?.(newTime);
      setGestureState({
        type: 'seek',
        value: Math.round(newTime),
        visible: true,
      });
    }
  }, [enabled, videoRef, onVolumeChange, onBrightnessChange, onSeek]);

  const handleTouchEnd = useCallback(() => {
    isGesturing.current = false;
    gestureType.current = null;

    // Hide indicator after delay
    setTimeout(hideIndicator, 500);
  }, [hideIndicator]);

  // Attach event listeners to video container
  const attachGestures = useCallback((container: HTMLElement | null) => {
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    gestureState,
    attachGestures,
  };
}
