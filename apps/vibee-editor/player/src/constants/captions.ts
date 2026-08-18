/**
 * Single source of truth for caption styles
 * All caption-related components should import from here
 */

import { BRAND_COLORS } from '@vibee/atoms';

export const CAPTION_DEFAULTS = {
  fontSize: 70,
  textColor: '#FFFF00', // Bright yellow TikTok-style
  highlightColor: BRAND_COLORS.amber, // VIBEE amber
  backgroundColor: '#00000099', // Black with 60% opacity (hex8 format)
  bottomPercent: 20,
  maxWidthPercent: 85,
  fontWeight: 900,
  fontFamily: '"Inter", "Arial", sans-serif',
  showShadow: true,
  maxWords: 1, // One word at a time
} as const;

export type CaptionDefaults = typeof CAPTION_DEFAULTS;
