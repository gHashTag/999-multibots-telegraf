// ===============================
// useDoubleTap Hook
// Detect double-tap gesture for mobile
// ===============================

import { useCallback, useRef } from 'react';

interface DoubleTapOptions {
  onDoubleTap: (e: React.TouchEvent | React.MouseEvent) => void;
  onSingleTap?: (e: React.TouchEvent | React.MouseEvent) => void;
  delay?: number; // Max time between taps (default: 300ms)
}

interface DoubleTapHandlers {
  onClick: (e: React.MouseEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useDoubleTap({
  onDoubleTap,
  onSingleTap,
  delay = 300,
}: DoubleTapOptions): DoubleTapHandlers {
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventRef = useRef<React.TouchEvent | React.MouseEvent | null>(null);

  const handleTap = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      const now = Date.now();
      const timeSinceLastTap = now - lastTapRef.current;

      if (timeSinceLastTap < delay && timeSinceLastTap > 0) {
        // Double tap detected
        if (tapTimeoutRef.current) {
          clearTimeout(tapTimeoutRef.current);
          tapTimeoutRef.current = null;
        }
        onDoubleTap(e);
        lastTapRef.current = 0;
      } else {
        // First tap - wait for potential second tap
        lastTapRef.current = now;
        lastEventRef.current = e;

        if (onSingleTap) {
          tapTimeoutRef.current = setTimeout(() => {
            if (lastEventRef.current) {
              onSingleTap(lastEventRef.current);
            }
            lastTapRef.current = 0;
            lastEventRef.current = null;
          }, delay);
        }
      }
    },
    [onDoubleTap, onSingleTap, delay]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only handle mouse clicks, not touch
      if ('ontouchstart' in window) return;
      handleTap(e);
    },
    [handleTap]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length > 0) return; // Still touching
      handleTap(e);
    },
    [handleTap]
  );

  return {
    onClick: handleClick,
    onTouchEnd: handleTouchEnd,
  };
}
