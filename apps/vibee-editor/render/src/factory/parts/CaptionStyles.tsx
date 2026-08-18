/**
 * Caption Style Adapter
 *
 * Adapts the existing Subtitles.tsx component for use with the factory system.
 * Maps factory caption styles to Subtitles component props.
 */

import React from 'react';
import type { CaptionStyle, CaptionConfig, CaptionEntry } from '../types';

// ============================================================
// Caption Style Configuration
// ============================================================

interface CaptionStyleConfig {
  name: string;
  description: string;
  /** Default font size */
  fontSize: number;
  /** Background box opacity (0-1) */
  backgroundOpacity: number;
  /** Animation intensity (0-1) */
  intensity: number;
}

export const CAPTION_STYLES: Record<CaptionStyle, CaptionStyleConfig> = {
  classic: {
    name: 'Classic',
    description: 'Simple fade with background box',
    fontSize: 52,  // +10px for readability
    backgroundOpacity: 0.7,
    intensity: 0.3,
  },
  modern: {
    name: 'Modern',
    description: 'Spring animation with glow effect',
    fontSize: 58,  // +10px for readability
    backgroundOpacity: 0,
    intensity: 0.7,
  },
  karaoke: {
    name: 'Karaoke',
    description: 'Horizontal text reveal with glow',
    fontSize: 62,  // +10px for readability
    backgroundOpacity: 0,
    intensity: 0.8,
  },
  typewriter: {
    name: 'Typewriter',
    description: 'Character-by-character reveal with cursor',
    fontSize: 54,  // +10px for readability
    backgroundOpacity: 0.3,
    intensity: 0.5,
  },
  bounce: {
    name: 'Bounce',
    description: 'Word-by-word bounce animation',
    fontSize: 60,  // +10px for readability
    backgroundOpacity: 0,
    intensity: 0.9,
  },
  'word-highlight': {
    name: 'Word Highlight',
    description: 'Highlight individual words progressively',
    fontSize: 56,  // +10px for readability
    backgroundOpacity: 0.2,
    intensity: 0.6,
  },
  none: {
    name: 'None',
    description: 'No captions',
    fontSize: 0,
    backgroundOpacity: 0,
    intensity: 0,
  },
};

// ============================================================
// Props Mapper
// ============================================================

/**
 * Map factory CaptionConfig to Subtitles component props
 */
export function mapToSubtitlesProps(config: CaptionConfig): SubtitlesProps {
  const styleConfig = CAPTION_STYLES[config.style];

  return {
    style: config.style === 'word-highlight' ? 'modern' : config.style,
    subtitles: config.entries.map((entry) => ({
      text: entry.text,
      startFrame: entry.startFrame,
      endFrame: entry.endFrame,
      highlight: entry.highlight,
    })),
    fontSize: config.fontSize || styleConfig.fontSize,
    fontColor: config.fontColor,
    highlightColor: config.highlightColor,
    backgroundColor2: config.backgroundColor || `rgba(0,0,0,${styleConfig.backgroundOpacity})`,
    position: config.position,
    maxWidth: config.maxWidth,
  };
}

interface SubtitlesProps {
  style: string;
  subtitles: Array<{
    text: string;
    startFrame: number;
    endFrame: number;
    highlight?: string;
  }>;
  fontSize: number;
  fontColor: string;
  highlightColor: string;
  backgroundColor2: string;
  position: 'top' | 'center' | 'bottom';
  maxWidth: number;
}

// ============================================================
// Caption Generator
// ============================================================

/**
 * Generate caption entries from transcript text
 */
export function generateCaptionsFromText(
  text: string,
  fps: number,
  totalDurationFrames: number,
  options: {
    /** Words per caption chunk */
    wordsPerChunk?: number;
    /** Minimum frames per caption */
    minFrames?: number;
    /** Gap between captions in frames */
    gapFrames?: number;
  } = {}
): CaptionEntry[] {
  const {
    wordsPerChunk = 5,
    minFrames = 30,
    gapFrames = 10,
  } = options;

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[] = [];

  // Split into chunks
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }

  if (chunks.length === 0) return [];

  // Calculate frames per chunk
  const totalGapFrames = gapFrames * (chunks.length - 1);
  const availableFrames = totalDurationFrames - totalGapFrames;
  const framesPerChunk = Math.max(minFrames, Math.floor(availableFrames / chunks.length));

  const entries: CaptionEntry[] = [];
  let currentFrame = 0;

  for (let i = 0; i < chunks.length; i++) {
    const endFrame = Math.min(
      currentFrame + framesPerChunk,
      totalDurationFrames
    );

    entries.push({
      text: chunks[i],
      startFrame: currentFrame,
      endFrame,
    });

    currentFrame = endFrame + gapFrames;
  }

  return entries;
}

// ============================================================
// Caption Timing Calculator
// ============================================================

/**
 * Calculate optimal caption timing based on audio duration
 */
export function calculateCaptionTiming(
  entries: CaptionEntry[],
  audioDurationFrames: number,
  fps: number
): CaptionEntry[] {
  if (entries.length === 0) return entries;

  const totalCaptionFrames = entries.reduce(
    (sum, e) => sum + (e.endFrame - e.startFrame),
    0
  );

  // Scale factor to fit audio duration
  const scale = audioDurationFrames / totalCaptionFrames;

  let currentFrame = 0;
  return entries.map((entry) => {
    const duration = (entry.endFrame - entry.startFrame) * scale;
    const newEntry: CaptionEntry = {
      ...entry,
      startFrame: Math.round(currentFrame),
      endFrame: Math.round(currentFrame + duration),
    };
    currentFrame += duration;
    return newEntry;
  });
}

// ============================================================
// Caption Position Calculator
// ============================================================

/**
 * Get safe position for captions based on avatar layout
 */
export function getSafeCaptionPosition(
  avatarPosition: string,
  safeZones: { top: number; bottom: number }
): 'top' | 'center' | 'bottom' {
  // Avoid top positions due to Instagram UI
  if (avatarPosition.includes('top')) {
    return 'bottom';
  }

  // For bottom avatar positions, prefer bottom captions (below safe zone)
  if (avatarPosition.includes('bottom')) {
    return 'bottom';
  }

  // For side layouts, center works well
  if (avatarPosition.includes('side') || avatarPosition.includes('split')) {
    return 'center';
  }

  // Default to bottom for fullscreen and floating
  return 'bottom';
}

// ============================================================
// Caption Style Validator
// ============================================================

/**
 * Check if caption style is compatible with avatar position
 */
export function isCaptionStyleCompatible(
  captionStyle: CaptionStyle,
  avatarPosition: string
): boolean {
  // Fullscreen avatar conflicts with animated captions
  if (avatarPosition === 'fullscreen') {
    return ['classic', 'none'].includes(captionStyle);
  }

  // All styles work with other positions
  return true;
}

/**
 * Get recommended caption style for avatar position
 */
export function getRecommendedCaptionStyle(
  avatarPosition: string
): CaptionStyle {
  if (avatarPosition === 'fullscreen') {
    return 'classic';
  }

  if (avatarPosition.includes('bottom')) {
    return 'karaoke';
  }

  if (avatarPosition.includes('side')) {
    return 'modern';
  }

  return 'bounce';
}

// ============================================================
// Default Caption Config
// ============================================================

/**
 * Create default caption config
 */
export function createDefaultCaptionConfig(
  style: CaptionStyle,
  entries: CaptionEntry[] = []
): CaptionConfig {
  const styleConfig = CAPTION_STYLES[style];

  return {
    style,
    entries,
    position: 'bottom',
    fontSize: styleConfig.fontSize,
    fontColor: '#ffffff',
    highlightColor: '#FFD700',
    backgroundColor: `rgba(0,0,0,${styleConfig.backgroundOpacity})`,
    maxWidth: 900,
  };
}

// ============================================================
// Exports
// ============================================================

export default CAPTION_STYLES;
