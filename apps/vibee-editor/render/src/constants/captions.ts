/**
 * Caption styles - Re-export from @vibee/atoms
 * Single source of truth for all caption settings
 */

// Re-export defaults from @vibee/atoms
export {
  CAPTION_DEFAULTS,
  DEFAULT_AVATAR_CONFIG,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VIGNETTE_STRENGTH,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_COVER_DURATION,
} from '@vibee/atoms';

// Type alias for backward compatibility
export type CaptionDefaults = {
  fontSize: number;
  textColor: string;
  highlightColor: string;
  backgroundColor: string;
  bottomPercent: number;
  maxWidthPercent: number;
  fontWeight: number;
  fontFamily: string;
  showShadow: boolean;
  maxWords: number;
};
