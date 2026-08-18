/**
 * Avatar Morph Component
 *
 * Premium avatar morphing system with:
 * - Avatar1: Main avatar that morphs fullscreen → circle
 * - Avatar2: Popup circle that appears during B-roll for seamless crossfade
 * - Glassmorphism with rotating conic-gradient glare
 * - Bezier easing for super-smooth transitions
 *
 * Based on LipSyncMain.tsx original implementation.
 */

import React from 'react';
import {
  AbsoluteFill,
  Video,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  staticFile,
} from 'remotion';
import { DEFAULT_AVATAR_CONFIG, DEFAULT_COLOR_CORRECTION } from '@vibee/atoms';

import type { BRollSegment } from '../types';

// ============================================================
// Constants (from LipSyncMain)
// ============================================================

// Super-smooth Bezier curve
const SMOOTH_EASING = Easing.bezier(0.4, 0, 0.2, 1);

// ============================================================
// Types
// ============================================================

export interface AvatarMorphProps {
  lipSyncVideo: string;
  segments: BRollSegment[];
  // Circle positioning (dynamic)
  circleSizePercent?: number; // Size as % of height (default: 25.2)
  circleBottomPercent?: number; // Bottom offset as % (default: 15)
  circleLeftPx?: number; // Left offset in pixels (default: 40)
  // Visual options
  glassMorphism?: boolean;
  colorCorrection?: number;
}

// ============================================================
// Helper: Resolve media path
// ============================================================

function resolveMediaPath(path: string): string {
  if (path.startsWith('{{') && path.endsWith('}}')) {
    return staticFile('/lipsync/lipsync.mp4');
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return path;
  }
  return staticFile(path.startsWith('/') ? path : `/${path}`);
}

// ============================================================
// Main Component
// ============================================================

export const AvatarMorph: React.FC<AvatarMorphProps> = ({
  lipSyncVideo,
  segments,
  circleSizePercent = DEFAULT_AVATAR_CONFIG.circleSizePercent,
  circleBottomPercent = DEFAULT_AVATAR_CONFIG.circleBottomPercent,
  circleLeftPx = 40,
  glassMorphism = true,
  colorCorrection = DEFAULT_COLOR_CORRECTION,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // ============================================================
  // Calculate Avatar1 State (main avatar morph)
  // ============================================================

  const targetCircleScale = circleSizePercent / 100;
  const morphDuration = fps * 1.2; // 1.2 sec for morphing
  const extendedCrossfade = fps * 1.5; // 1.5 sec for opacity

  // Default state: fullscreen
  let avatarScale = 1.0;
  let avatarCrossfadeOpacity = 1.0;
  let isBgActive = false;

  for (const segment of segments) {
    const segmentFrame = frame - segment.startFrame;

    if (segmentFrame >= 0 && segmentFrame < segment.durationFrames) {
      isBgActive = true;

      // Ultra-smooth transform: 100% → 75% → 25.2% → 75% → 100%
      const targetScale = interpolate(
        segmentFrame,
        [
          0,
          morphDuration * 0.33,
          morphDuration * 0.66,
          segment.durationFrames - morphDuration * 0.66,
          segment.durationFrames - morphDuration * 0.33,
          segment.durationFrames,
        ],
        [1.0, 0.75, targetCircleScale, targetCircleScale, 0.75, 1.0],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: SMOOTH_EASING,
        }
      );

      // Crossfade opacity: 1.0 → 0.75 → 0.25 → 0.25 → 0.75 → 1.0
      avatarCrossfadeOpacity = interpolate(
        segmentFrame,
        [
          -fps * 0.5,
          -fps * 0.5 + extendedCrossfade * 0.33,
          -fps * 0.5 + extendedCrossfade * 0.66,
          segment.durationFrames - extendedCrossfade * 0.66,
          segment.durationFrames - extendedCrossfade * 0.33,
          segment.durationFrames,
        ],
        [1.0, 0.75, 0.25, 0.25, 0.75, 1.0],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: SMOOTH_EASING,
        }
      );

      avatarScale = Math.min(avatarScale, targetScale);
    }
  }


  // ============================================================
  // Calculated Styles
  // ============================================================

  const circleSize = height * targetCircleScale;
  const circleMargin = 60;
  const circleBottomOffset = circleMargin + height * (circleBottomPercent / 100);
  const circleLeftOffset = circleLeftPx;

  // Border radius: 50% (circle) → 0% (fullscreen)
  const avatarBorderRadius = interpolate(
    avatarScale,
    [targetCircleScale, 0.5, 0.75, 1.0],
    [50, 35, 15, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: SMOOTH_EASING,
    }
  );

  // Glass opacity based on border radius
  const glassOpacity = interpolate(
    avatarBorderRadius,
    [0, 25, 50],
    [0, 0.6, 1.0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: SMOOTH_EASING,
    }
  );

  // Cinematic filter
  const cinematicFilter = `brightness(${colorCorrection * 0.95}) contrast(1.15) saturate(1.3)`;

  // ============================================================
  // Render
  // ============================================================

  return (
    <>
      {/* ========== AVATAR1: Main morphing avatar ========== */}
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            // Smooth position: bottom-left (circle) → fullscreen
            top: interpolate(
              avatarScale,
              [targetCircleScale, 1.0],
              [height - circleSize - circleBottomOffset, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ),
            left: interpolate(
              avatarScale,
              [targetCircleScale, 1.0],
              [circleLeftOffset, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ),
            // Smooth size change
            width: interpolate(
              avatarScale,
              [targetCircleScale, 1.0],
              [circleSize, width],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ),
            height: interpolate(
              avatarScale,
              [targetCircleScale, 1.0],
              [circleSize, height],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ),
            overflow: 'visible',
            // Dynamic z-index: circle over B-roll, fullscreen under B-roll
            zIndex: avatarScale < 0.5 ? 10 : 1,
            // Crossfade opacity
            opacity: avatarCrossfadeOpacity,
          }}
        >
          {/* Clean modern border - no cringe glassmorphism */}
          {glassMorphism && glassOpacity > 0 && (
            <div
              style={{
                position: 'absolute',
                width: '104%',
                height: '104%',
                top: '-2%',
                left: '-2%',
                borderRadius: '50%',
                background: 'transparent',
                border: '3px solid rgba(255, 255, 255, 0.9)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                opacity: glassOpacity,
                zIndex: 0,
              }}
            />
          )}

          {/* Avatar container with clip */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              borderRadius: `${avatarBorderRadius}%`,
              overflow: 'hidden',
              zIndex: 1,
            }}
          >
            {/* Avatar video with audio (30% volume) */}
            <Video
              src={resolveMediaPath(lipSyncVideo)}
              preload="auto"
              volume={0.13}
              style={{
                width: '100%',
                height: '100%',
                objectFit: avatarScale < 0.5 ? 'cover' : 'contain',
                filter: cinematicFilter,
              }}
            />
          </div>
        </div>
      </AbsoluteFill>

      {/* Avatar2 removed - using single morphing avatar only */}
    </>
  );
};

export default AvatarMorph;
