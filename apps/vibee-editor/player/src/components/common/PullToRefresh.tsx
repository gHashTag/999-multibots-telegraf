import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import './PullToRefresh.css';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  threshold?: number;
  maxPull?: number;
}

export function PullToRefresh({
  children,
  onRefresh,
  disabled = false,
  threshold = 80,
  maxPull = 120,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);

  const isAtTop = useCallback(() => {
    if (!containerRef.current) return false;
    return containerRef.current.scrollTop <= 0;
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || isRefreshing || !isAtTop()) return;
      startYRef.current = e.touches[0].clientY;
      currentYRef.current = e.touches[0].clientY;
    },
    [disabled, isRefreshing, isAtTop]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (disabled || isRefreshing || !startYRef.current) return;

      currentYRef.current = e.touches[0].clientY;
      const delta = currentYRef.current - startYRef.current;

      // Only trigger if scrolled to top and pulling down
      if (delta > 0 && isAtTop()) {
        e.preventDefault();
        setIsPulling(true);
        // Apply resistance
        const resistance = 0.5;
        const pull = Math.min(delta * resistance, maxPull);
        setPullDistance(pull);
      }
    },
    [disabled, isRefreshing, isAtTop, maxPull]
  );

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshing) return;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold);

      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
    setIsPulling(false);
    startYRef.current = 0;
    currentYRef.current = 0;
  }, [disabled, isRefreshing, pullDistance, threshold, onRefresh]);

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
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;
  const scale = 0.5 + progress * 0.5;

  return (
    <div className="pull-to-refresh" ref={containerRef}>
      {/* Indicator */}
      <div
        className={`pull-to-refresh__indicator ${isPulling || isRefreshing ? 'visible' : ''}`}
        style={{
          transform: `translateY(${pullDistance - 40}px)`,
        }}
      >
        <div
          className={`pull-to-refresh__icon ${isRefreshing ? 'spinning' : ''}`}
          style={{
            transform: `rotate(${rotation}deg) scale(${scale})`,
            opacity: progress,
          }}
        >
          <RefreshCw size={24} />
        </div>
        {!isRefreshing && progress >= 1 && (
          <span className="pull-to-refresh__text">Release to refresh</span>
        )}
        {isRefreshing && <span className="pull-to-refresh__text">Refreshing...</span>}
      </div>

      {/* Content */}
      <div
        className="pull-to-refresh__content"
        style={{
          transform: isPulling || isRefreshing ? `translateY(${pullDistance}px)` : undefined,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}
