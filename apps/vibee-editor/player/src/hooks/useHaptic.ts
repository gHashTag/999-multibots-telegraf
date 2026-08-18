// ===============================
// Haptic Feedback Hook
// Vibration for touch interactions
// ===============================

import { useCallback } from 'react';
import { useReducedMotion } from './useReducedMotion';

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

// Vibration patterns (duration in ms)
const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 50, 20],
  warning: [20, 40, 20, 40, 20],
  error: [50, 100, 50],
  selection: 5,
};

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported(): boolean {
  return 'vibrate' in navigator;
}

/**
 * Hook for haptic feedback
 */
export function useHaptic() {
  const prefersReducedMotion = useReducedMotion();

  const vibrate = useCallback((pattern: HapticPattern = 'light') => {
    // Respect reduced motion preference
    if (prefersReducedMotion) return;

    // Check if vibration is supported
    if (!isHapticSupported()) return;

    try {
      const vibrationPattern = PATTERNS[pattern];
      navigator.vibrate(vibrationPattern);
    } catch (e) {
      // Silently fail if vibration is not allowed
      console.debug('Haptic feedback not available');
    }
  }, [prefersReducedMotion]);

  // Convenience methods
  const light = useCallback(() => vibrate('light'), [vibrate]);
  const medium = useCallback(() => vibrate('medium'), [vibrate]);
  const heavy = useCallback(() => vibrate('heavy'), [vibrate]);
  const success = useCallback(() => vibrate('success'), [vibrate]);
  const warning = useCallback(() => vibrate('warning'), [vibrate]);
  const error = useCallback(() => vibrate('error'), [vibrate]);
  const selection = useCallback(() => vibrate('selection'), [vibrate]);

  return {
    vibrate,
    light,
    medium,
    heavy,
    success,
    warning,
    error,
    selection,
    isSupported: isHapticSupported(),
  };
}

/**
 * Hook for haptic on tap/click
 */
export function useHapticTap(pattern: HapticPattern = 'light') {
  const { vibrate } = useHaptic();

  const onTap = useCallback(() => {
    vibrate(pattern);
  }, [vibrate, pattern]);

  return onTap;
}

/**
 * Hook for haptic on long press
 */
export function useHapticLongPress(pattern: HapticPattern = 'medium') {
  const { vibrate } = useHaptic();

  const onLongPress = useCallback(() => {
    vibrate(pattern);
  }, [vibrate, pattern]);

  return onLongPress;
}
