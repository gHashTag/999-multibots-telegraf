// ===============================
// useLongPress Hook
// Detect long-press for mobile context menus
// ===============================

import { useCallback, useRef, useState } from 'react';

interface LongPressOptions {
  /** Threshold in milliseconds (default: 500) */
  threshold?: number;
  /** Callback when long press is detected */
  onLongPress: (event: React.TouchEvent | React.MouseEvent) => void;
  /** Callback for regular click (if not long press) */
  onClick?: () => void;
  /** Whether to prevent default on touch events */
  preventDefault?: boolean;
}

interface LongPressHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  isPressed: boolean;
  isLongPressed: boolean;
}

export function useLongPress({
  threshold = 500,
  onLongPress,
  onClick,
  preventDefault = true,
}: LongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const startPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [isPressed, setIsPressed] = useState(false);
  const [isLongPressed, setIsLongPressed] = useState(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPositionRef.current = null;
  }, []);

  const start = useCallback(
    (event: React.TouchEvent | React.MouseEvent) => {
      // Store initial position for touch move detection
      if ('touches' in event) {
        const touch = event.touches[0];
        startPositionRef.current = { x: touch.clientX, y: touch.clientY };
      }

      isLongPressRef.current = false;
      setIsPressed(true);
      setIsLongPressed(false);

      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        setIsLongPressed(true);

        // Haptic feedback
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }

        onLongPress(event);
      }, threshold);
    },
    [onLongPress, threshold]
  );

  const cancel = useCallback(() => {
    clear();
    setIsPressed(false);
    setIsLongPressed(false);
  }, [clear]);

  const end = useCallback(
    (event: React.TouchEvent | React.MouseEvent) => {
      const wasLongPress = isLongPressRef.current;
      clear();
      setIsPressed(false);
      setIsLongPressed(false);

      // If it wasn't a long press, trigger regular click
      if (!wasLongPress && onClick) {
        onClick();
      }

      if (preventDefault && wasLongPress) {
        event.preventDefault();
      }
    },
    [clear, onClick, preventDefault]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent) => {
      // Cancel long press if finger moves too much
      if (startPositionRef.current && timerRef.current) {
        const touch = event.touches[0];
        const dx = Math.abs(touch.clientX - startPositionRef.current.x);
        const dy = Math.abs(touch.clientY - startPositionRef.current.y);

        // If moved more than 10px, cancel
        if (dx > 10 || dy > 10) {
          cancel();
        }
      }
    },
    [cancel]
  );

  return {
    onMouseDown: start as (e: React.MouseEvent) => void,
    onMouseUp: end as (e: React.MouseEvent) => void,
    onMouseLeave: cancel,
    onTouchStart: start as (e: React.TouchEvent) => void,
    onTouchEnd: end as (e: React.TouchEvent) => void,
    onTouchMove: handleTouchMove,
    isPressed,
    isLongPressed,
  };
}
