/**
 * Shared Constants for VIBEE Remotion
 *
 * Re-exports from @vibee/atoms for backward compatibility.
 * Single source of truth is in @vibee/atoms.
 */

import {
  DEFAULT_AVATAR_CONFIG,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VIGNETTE_STRENGTH,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_COVER_DURATION,
  BRAND_COLORS,
} from '@vibee/atoms';

// ============================================================
// Brand Colors
// ============================================================

export const VIBEE_AMBER = BRAND_COLORS.amber;

export const COLORS = {
  amber: BRAND_COLORS.amber,
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

// ============================================================
// Avatar Defaults (from @vibee/atoms)
// ============================================================

export const AVATAR_DEFAULTS = {
  circleSizePercent: DEFAULT_AVATAR_CONFIG.circleSizePercent,
  circleBottomPercent: DEFAULT_AVATAR_CONFIG.circleBottomPercent,
  circleLeftPx: 40, // Legacy - kept for compatibility
} as const;

// ============================================================
// Effect Defaults (from @vibee/atoms)
// ============================================================

export const EFFECT_DEFAULTS = {
  coverDuration: DEFAULT_COVER_DURATION,
  vignetteStrength: DEFAULT_VIGNETTE_STRENGTH,
  colorCorrection: DEFAULT_COLOR_CORRECTION,
  musicVolume: DEFAULT_MUSIC_VOLUME,
} as const;

// ============================================================
// Animation
// ============================================================

export const SMOOTH_EASING = [0.4, 0, 0.2, 1] as const;

// Bezier easing for Remotion
export const SMOOTH_BEZIER = {
  x1: 0.4,
  y1: 0,
  x2: 0.2,
  y2: 1,
} as const;
