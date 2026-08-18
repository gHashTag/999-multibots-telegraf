import { useEffect, useRef, useCallback } from 'react';

interface UsePullToRefreshOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  threshold?: number;
}

export function usePullToRefresh({
  containerRef,
  onRefresh,
  isRefreshing,
  threshold = 80,
}: UsePullToRefreshOptions) {
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshing) return;

    const container = containerRef.current;
    if (!container) return;

    // Only trigger if at top of scroll
    if (container.scrollTop > 0) return;

    startY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, [containerRef, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;

    currentY.current = e.touches[0].clientY;
    const pullDistance = currentY.current - startY.current;

    if (pullDistance > 0 && pullDistance < threshold * 2) {
      // Visual feedback could be added here
      e.preventDefault();
    }
  }, [isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || isRefreshing) return;

    const pullDistance = currentY.current - startY.current;

    if (pullDistance > threshold) {
      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(20);
      }
      await onRefresh();
    }

    isPulling.current = false;
    startY.current = 0;
    currentY.current = 0;
  }, [onRefresh, isRefreshing, threshold]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, handleTouchStart, handleTouchMove, handleTouchEnd]);
}
