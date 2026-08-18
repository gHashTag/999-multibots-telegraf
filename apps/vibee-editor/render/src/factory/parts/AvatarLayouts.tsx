/**
 * Avatar Layout Configurations
 *
 * Defines 8 different avatar position configurations for talking head videos.
 * Each layout specifies size, position, morphing behavior, and transition style.
 */

import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { DEFAULT_AVATAR_CONFIG, AVATAR_LAYOUT_PRESETS } from '@vibee/atoms';
import type { AvatarPosition, AvatarLayoutConfig } from '../types';

// ============================================================
// Layout Configurations
// ============================================================

/**
 * Avatar layout configurations for each position type
 */
export const AVATAR_LAYOUTS: Record<AvatarPosition, AvatarLayoutConfig> = {
  'circle-bottom-left': {
    position: 'circle-bottom-left',
    sizePercent: DEFAULT_AVATAR_CONFIG.circleSizePercent,
    bottomPercent: DEFAULT_AVATAR_CONFIG.circleBottomPercent,
    leftPx: 40,
    morphEnabled: true,
    borderRadius: 9999, // Fully rounded
  },

  'circle-bottom-right': {
    position: 'circle-bottom-right',
    sizePercent: DEFAULT_AVATAR_CONFIG.circleSizePercent,
    bottomPercent: DEFAULT_AVATAR_CONFIG.circleBottomPercent,
    leftPx: 0,
    rightPx: 40,
    morphEnabled: true,
    borderRadius: 9999,
  },

  'circle-top-left': {
    position: 'circle-top-left',
    sizePercent: AVATAR_LAYOUT_PRESETS.pipSize,
    bottomPercent: 75, // Top position
    leftPx: 40,
    morphEnabled: true,
    borderRadius: 9999,
  },

  'circle-top-right': {
    position: 'circle-top-right',
    sizePercent: AVATAR_LAYOUT_PRESETS.pipSize,
    bottomPercent: 75,
    leftPx: 0,
    rightPx: 40,
    morphEnabled: true,
    borderRadius: 9999,
  },

  'side-left': {
    position: 'side-left',
    sizePercent: AVATAR_LAYOUT_PRESETS.sideSize,
    bottomPercent: 0,
    leftPx: 0,
    morphEnabled: false,
    splitRatio: AVATAR_LAYOUT_PRESETS.sideRatio,
    borderRadius: 0,
  },

  'side-right': {
    position: 'side-right',
    sizePercent: AVATAR_LAYOUT_PRESETS.sideSize,
    bottomPercent: 0,
    leftPx: 0,
    rightPx: 0,
    morphEnabled: false,
    splitRatio: AVATAR_LAYOUT_PRESETS.sideRatio,
    borderRadius: 0,
  },

  'fullscreen': {
    position: 'fullscreen',
    sizePercent: AVATAR_LAYOUT_PRESETS.fullscreenSize,
    bottomPercent: 0,
    leftPx: 0,
    morphEnabled: false,
    borderRadius: 0,
  },

  'split-horizontal': {
    position: 'split-horizontal',
    sizePercent: AVATAR_LAYOUT_PRESETS.splitSize,
    bottomPercent: 50,
    leftPx: 0,
    morphEnabled: false,
    splitRatio: AVATAR_LAYOUT_PRESETS.splitRatio,
    borderRadius: 0,
  },

  'split-vertical': {
    position: 'split-vertical',
    sizePercent: AVATAR_LAYOUT_PRESETS.splitSize,
    bottomPercent: 0,
    leftPx: 0,
    morphEnabled: false,
    splitRatio: AVATAR_LAYOUT_PRESETS.splitRatio,
    borderRadius: 0,
  },

  'floating-center': {
    position: 'floating-center',
    sizePercent: AVATAR_LAYOUT_PRESETS.floatingSize,
    bottomPercent: AVATAR_LAYOUT_PRESETS.floatingBottom,
    leftPx: 0, // Will be calculated for center
    morphEnabled: true,
    borderRadius: 20,
  },
};

// ============================================================
// Layout Component Props
// ============================================================

interface AvatarLayoutProps {
  position: AvatarPosition;
  children: React.ReactNode;
  /** Current morphing state (0 = small/circle, 1 = large/fullscreen) */
  morphState?: number;
  /** Enable smooth morphing transitions */
  enableMorphing?: boolean;
}

// ============================================================
// Avatar Layout Adapter Component
// ============================================================

/**
 * Wraps avatar content with position-specific layout
 */
export const AvatarLayoutAdapter: React.FC<AvatarLayoutProps> = ({
  position,
  children,
  morphState = 0,
  enableMorphing = true,
}) => {
  const { width, height } = useVideoConfig();
  const config = AVATAR_LAYOUTS[position];

  // Calculate base dimensions
  const baseSize = (height * config.sizePercent) / 100;
  const fullscreenSize = height;

  // Interpolate between small and large states if morphing is enabled
  const currentSize =
    enableMorphing && config.morphEnabled
      ? interpolate(morphState, [0, 1], [baseSize, fullscreenSize], {
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        })
      : baseSize;

  // Calculate border radius (morphs from circle to square)
  const currentRadius =
    enableMorphing && config.morphEnabled
      ? interpolate(morphState, [0, 1], [config.borderRadius || 9999, 0], {
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        })
      : config.borderRadius || 0;

  // Get position styles based on layout type
  const positionStyle = getPositionStyle(position, config, width, height, currentSize, morphState);

  return (
    <div
      style={{
        position: 'absolute',
        width: currentSize,
        height: currentSize,
        borderRadius: currentRadius,
        overflow: 'hidden',
        ...positionStyle,
        transition: enableMorphing ? 'none' : 'all 0.3s ease-out',
      }}
    >
      {children}
    </div>
  );
};

// ============================================================
// Position Style Calculator
// ============================================================

function getPositionStyle(
  position: AvatarPosition,
  config: AvatarLayoutConfig,
  screenWidth: number,
  screenHeight: number,
  currentSize: number,
  morphState: number
): React.CSSProperties {
  const bottomOffset = (screenHeight * config.bottomPercent) / 100;

  switch (position) {
    case 'circle-bottom-left':
      return {
        bottom: interpolate(morphState, [0, 1], [bottomOffset, 0]),
        left: interpolate(morphState, [0, 1], [config.leftPx, 0]),
      };

    case 'circle-bottom-right':
      return {
        bottom: interpolate(morphState, [0, 1], [bottomOffset, 0]),
        right: interpolate(morphState, [0, 1], [config.rightPx || 40, 0]),
      };

    case 'circle-top-left':
      return {
        top: interpolate(morphState, [0, 1], [screenHeight - bottomOffset - currentSize, 0]),
        left: interpolate(morphState, [0, 1], [config.leftPx, 0]),
      };

    case 'circle-top-right':
      return {
        top: interpolate(morphState, [0, 1], [screenHeight - bottomOffset - currentSize, 0]),
        right: interpolate(morphState, [0, 1], [config.rightPx || 40, 0]),
      };

    case 'side-left':
      return {
        top: 0,
        left: 0,
        width: screenWidth * (config.splitRatio || 0.4),
        height: screenHeight,
      };

    case 'side-right':
      return {
        top: 0,
        right: 0,
        width: screenWidth * (config.splitRatio || 0.4),
        height: screenHeight,
      };

    case 'fullscreen':
      return {
        top: 0,
        left: 0,
        width: screenWidth,
        height: screenHeight,
      };

    case 'split-horizontal':
      return {
        top: 0,
        left: 0,
        width: screenWidth,
        height: screenHeight * (config.splitRatio || 0.5),
      };

    case 'split-vertical':
      return {
        top: 0,
        left: 0,
        width: screenWidth * (config.splitRatio || 0.5),
        height: screenHeight,
      };

    case 'floating-center':
      return {
        top: (screenHeight - currentSize) / 2,
        left: (screenWidth - currentSize) / 2,
      };

    default:
      return {
        bottom: bottomOffset,
        left: config.leftPx,
      };
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Check if a position supports morphing animations
 */
export function supportsMorphing(position: AvatarPosition): boolean {
  return AVATAR_LAYOUTS[position].morphEnabled;
}

/**
 * Get the default circle size for a position
 */
export function getDefaultSize(position: AvatarPosition): number {
  return AVATAR_LAYOUTS[position].sizePercent;
}

/**
 * Check if position is a split layout (avatar + content side by side)
 */
export function isSplitLayout(position: AvatarPosition): boolean {
  return ['side-left', 'side-right', 'split-horizontal', 'split-vertical'].includes(position);
}

/**
 * Get the content area for split layouts (where B-roll should appear)
 */
export function getContentArea(
  position: AvatarPosition,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number; width: number; height: number } | null {
  const config = AVATAR_LAYOUTS[position];

  switch (position) {
    case 'side-left':
      return {
        x: screenWidth * (config.splitRatio || 0.4),
        y: 0,
        width: screenWidth * (1 - (config.splitRatio || 0.4)),
        height: screenHeight,
      };

    case 'side-right':
      return {
        x: 0,
        y: 0,
        width: screenWidth * (1 - (config.splitRatio || 0.4)),
        height: screenHeight,
      };

    case 'split-horizontal':
      return {
        x: 0,
        y: screenHeight * (config.splitRatio || 0.5),
        width: screenWidth,
        height: screenHeight * (1 - (config.splitRatio || 0.5)),
      };

    case 'split-vertical':
      return {
        x: screenWidth * (config.splitRatio || 0.5),
        y: 0,
        width: screenWidth * (1 - (config.splitRatio || 0.5)),
        height: screenHeight,
      };

    default:
      return null; // Non-split layouts have fullscreen B-roll
  }
}

// ============================================================
// Exports
// ============================================================

export default AvatarLayoutAdapter;
