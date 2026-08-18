/**
 * Shared Types for VIBEE Remotion Player
 *
 * Types are imported from @vibee/atoms (SSOT)
 */

import type { Caption } from '@remotion/captions';
import type {
  CaptionStyle,
  CaptionAnimation,
  AvatarAnimation,
  AvatarBorderEffect,
} from '@vibee/atoms';

// Re-export types from @vibee/atoms (SSOT)
export type { CaptionStyle, CaptionAnimation, AvatarAnimation, AvatarBorderEffect };

// ============================================================
// LipSync Composition Types
// ============================================================

export interface LipSyncMainProps {
  // Media
  lipSyncVideo: string;
  coverImage?: string;
  backgroundMusic?: string;
  musicVolume?: number;
  backgroundVideos?: string[];

  // Effects
  coverDuration?: number;
  vignetteStrength?: number;
  colorCorrection?: number;

  // Avatar circle position (legacy)
  circleSizePercent?: number;
  circleBottomPercent?: number;
  circleLeftPercent?: number;

  // Face centering
  faceOffsetX?: number;
  faceOffsetY?: number;
  faceScale?: number;

  // Circle avatar (legacy)
  isCircleAvatar?: boolean;
  avatarBorderRadius?: number;

  // Split mode settings
  splitCircleSize?: number;
  splitPositionX?: number;
  splitPositionY?: number;
  splitFaceScale?: number;
  splitIsCircle?: boolean;
  splitBorderRadius?: number;

  // Fullscreen mode settings
  fullscreenCircleSize?: number;
  fullscreenPositionX?: number;
  fullscreenPositionY?: number;
  fullscreenFaceScale?: number;
  fullscreenIsCircle?: boolean;
  fullscreenBorderRadius?: number;

  // Avatar animation
  avatarAnimation?: AvatarAnimation;

  // Avatar border effect
  avatarBorderEffect?: AvatarBorderEffect;
  avatarBorderColor?: string;
  avatarBorderColor2?: string;
  avatarBorderWidth?: number;
  avatarBorderIntensity?: number;

  // Captions
  showCaptions?: boolean;
  captions?: Caption[];
  captionStyle?: CaptionStyle;
}

// Re-export Caption type for convenience
export type { Caption };
