import { useRef, useEffect, useCallback } from 'react';

interface PinchZoomOptions {
  onZoom: (delta: number, center: { x: number; y: number }) => void;
  minScale?: number;
  maxScale?: number;
}

/**
 * Hook for pinch-to-zoom gesture on touch devices
 * Returns ref to attach to the element
 */
export function usePinchZoom<T extends HTMLElement>({
  onZoom,
  minScale = 0.1,
  maxScale = 10,
}: PinchZoomOptions) {
  const elementRef = useRef<T>(null);
  const lastDistanceRef = useRef<number | null>(null);
  const lastCenterRef = useRef<{ x: number; y: number } | null>(null);

  // Calculate distance between two touch points
  const getDistance = useCallback((touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Calculate center between two touch points
  const getCenter = useCallback((touches: TouchList): { x: number; y: number } => {
    if (touches.length < 2) {
      return { x: touches[0].clientX, y: touches[0].clientY };
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastDistanceRef.current = getDistance(e.touches);
        lastCenterRef.current = getCenter(e.touches);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastDistanceRef.current !== null) {
        e.preventDefault();

        const currentDistance = getDistance(e.touches);
        const center = getCenter(e.touches);

        // Calculate zoom delta (positive = zoom in, negative = zoom out)
        const delta = (currentDistance - lastDistanceRef.current) / 100;

        // Call zoom handler
        onZoom(delta, center);

        lastDistanceRef.current = currentDistance;
        lastCenterRef.current = center;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastDistanceRef.current = null;
        lastCenterRef.current = null;
      }
    };

    // Add touch event listeners
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onZoom, getDistance, getCenter]);

  return elementRef;
}

/**
 * Hook for horizontal swipe gesture
 */
interface SwipeOptions {
  onSwipe: (direction: 'left' | 'right', velocity: number) => void;
  threshold?: number; // Minimum distance to trigger swipe
}

export function useHorizontalSwipe<T extends HTMLElement>({
  onSwipe,
  threshold = 50,
}: SwipeOptions) {
  const elementRef = useRef<T>(null);
  const startXRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        startXRef.current = e.touches[0].clientX;
        startTimeRef.current = Date.now();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (startXRef.current === null || startTimeRef.current === null) return;
      if (e.changedTouches.length === 0) return;

      const endX = e.changedTouches[0].clientX;
      const deltaX = endX - startXRef.current;
      const deltaTime = Date.now() - startTimeRef.current;
      const velocity = Math.abs(deltaX) / deltaTime;

      if (Math.abs(deltaX) > threshold) {
        onSwipe(deltaX > 0 ? 'right' : 'left', velocity);
      }

      startXRef.current = null;
      startTimeRef.current = null;
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipe, threshold]);

  return elementRef;
}
