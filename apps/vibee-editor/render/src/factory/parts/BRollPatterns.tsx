/**
 * B-Roll Pattern Algorithms
 *
 * 4 different patterns for distributing B-roll segments throughout a video.
 * Each pattern creates a different rhythm and pacing for the content.
 */

import type {
  BRollPattern,
  BRollAnimation,
  BRollSegment,
  BRollConfig,
} from '../types';

// ============================================================
// Pattern Configuration
// ============================================================

interface PatternConfig {
  name: string;
  description: string;
  /** Best use case */
  bestFor: string;
}

export const BROLL_PATTERNS: Record<BRollPattern, PatternConfig> = {
  'hook-content-cta': {
    name: 'Hook → Content → CTA',
    description: '3-segment structure optimized for Instagram engagement',
    bestFor: 'Educational and promotional content',
  },
  'even-distribution': {
    name: 'Even Distribution',
    description: 'Equal spacing between B-roll segments',
    bestFor: 'Consistent pacing and storytelling',
  },
  'progressive': {
    name: 'Progressive',
    description: 'Increasing frequency toward the end',
    bestFor: 'Building energy and excitement',
  },
  'random-weighted': {
    name: 'Random Weighted',
    description: 'Weighted random timing for variety',
    bestFor: 'Dynamic and unpredictable content',
  },
};

// ============================================================
// Animation Sequence
// ============================================================

/**
 * Default animation sequence (cycles through)
 */
export const DEFAULT_ANIMATIONS: BRollAnimation[] = [
  'zoom-in',
  'zoom-out',
  'pan-right',
  'pan-left',
  'rotate-zoom',
];

/**
 * Get blend mode for segment index
 * Using mostly 'normal' for cleaner look (less visual clutter)
 */
function getBlendMode(index: number): 'normal' | 'screen' | 'overlay' {
  const modes: Array<'normal' | 'screen' | 'overlay'> = [
    'normal',
    'normal',
    'normal',
    'screen',  // Only occasional screen blend
  ];
  return modes[index % modes.length];
}

/**
 * Get opacity for segment index
 * Lower opacity (0.5-0.65) for cleaner text readability
 */
function getOpacity(index: number): number {
  const opacities = [0.5, 0.55, 0.6, 0.65];  // Much lower for text readability
  return opacities[index % opacities.length];
}

// ============================================================
// Pattern Generator Interface
// ============================================================

interface PatternInput {
  totalFrames: number;
  fps: number;
  segmentDurationFrames: number;
  gapDurationFrames: number;
  videoUrls: string[];
  hookEndFrame?: number; // End of hook section
  ctaStartFrame?: number; // Start of CTA section
}

// ============================================================
// Main Generator Function
// ============================================================

/**
 * Generate B-roll segments based on pattern
 */
export function generateBRollSegments(
  pattern: BRollPattern,
  input: PatternInput
): BRollSegment[] {
  switch (pattern) {
    case 'hook-content-cta':
      return generateHookContentCta(input);
    case 'even-distribution':
      return generateEvenDistribution(input);
    case 'progressive':
      return generateProgressive(input);
    case 'random-weighted':
      return generateRandomWeighted(input);
    default:
      return generateEvenDistribution(input);
  }
}

// ============================================================
// Hook → Content → CTA Pattern
// ============================================================

/**
 * 3-segment structure:
 * - Hook (0-3s): Minimal B-roll, focus on hook text
 * - Content (3s-end-5s): Regular B-roll with avatar
 * - CTA (last 5s): Minimal B-roll, focus on call-to-action
 */
function generateHookContentCta(input: PatternInput): BRollSegment[] {
  const {
    totalFrames,
    fps,
    segmentDurationFrames,
    gapDurationFrames,
    videoUrls,
    hookEndFrame = fps * 3, // Default 3 seconds
  } = input;

  const ctaStartFrame = totalFrames - fps * 5; // Last 5 seconds
  const segments: BRollSegment[] = [];

  // Content section: regular B-roll
  let currentFrame = hookEndFrame + gapDurationFrames;
  let videoIndex = 0;

  while (currentFrame + segmentDurationFrames < ctaStartFrame) {
    segments.push({
      startFrame: currentFrame,
      durationFrames: segmentDurationFrames,
      animation: DEFAULT_ANIMATIONS[videoIndex % DEFAULT_ANIMATIONS.length],
      videoUrl: videoUrls[videoIndex % videoUrls.length],
      opacity: getOpacity(videoIndex),
      blendMode: getBlendMode(videoIndex),
    });

    currentFrame += segmentDurationFrames + gapDurationFrames;
    videoIndex++;
  }

  return segments;
}

// ============================================================
// Even Distribution Pattern
// ============================================================

/**
 * Equal spacing between B-roll segments throughout the video
 */
function generateEvenDistribution(input: PatternInput): BRollSegment[] {
  const {
    totalFrames,
    segmentDurationFrames,
    gapDurationFrames,
    videoUrls,
  } = input;

  const segments: BRollSegment[] = [];
  const totalSegmentTime = segmentDurationFrames + gapDurationFrames;

  // Calculate how many segments fit
  const numSegments = Math.floor(
    (totalFrames - gapDurationFrames) / totalSegmentTime
  );

  if (numSegments === 0) return segments;

  // Calculate spacing to distribute evenly
  const totalUsedFrames = numSegments * segmentDurationFrames;
  const totalGapFrames = totalFrames - totalUsedFrames;
  const gapPerSegment = Math.floor(totalGapFrames / (numSegments + 1));

  let currentFrame = gapPerSegment;

  for (let i = 0; i < numSegments; i++) {
    segments.push({
      startFrame: currentFrame,
      durationFrames: segmentDurationFrames,
      animation: DEFAULT_ANIMATIONS[i % DEFAULT_ANIMATIONS.length],
      videoUrl: videoUrls[i % videoUrls.length],
      opacity: getOpacity(i),
      blendMode: getBlendMode(i),
    });

    currentFrame += segmentDurationFrames + gapPerSegment;
  }

  return segments;
}

// ============================================================
// Progressive Pattern
// ============================================================

/**
 * B-roll frequency increases toward the end of the video
 * Creates building energy and excitement
 */
function generateProgressive(input: PatternInput): BRollSegment[] {
  const {
    totalFrames,
    fps,
    segmentDurationFrames,
    videoUrls,
  } = input;

  const segments: BRollSegment[] = [];

  // Start with longer gaps, progressively shorter
  const initialGap = fps * 6; // 6 seconds initial gap
  const minGap = fps * 1; // 1 second minimum gap
  const numSegments = Math.min(8, videoUrls.length * 2); // Max 8 segments

  let currentFrame = initialGap;
  let currentGap = initialGap;
  const gapReduction = (initialGap - minGap) / numSegments;

  for (let i = 0; i < numSegments && currentFrame + segmentDurationFrames < totalFrames; i++) {
    segments.push({
      startFrame: currentFrame,
      durationFrames: segmentDurationFrames,
      animation: DEFAULT_ANIMATIONS[i % DEFAULT_ANIMATIONS.length],
      videoUrl: videoUrls[i % videoUrls.length],
      opacity: getOpacity(i),
      blendMode: getBlendMode(i),
    });

    // Decrease gap for next segment
    currentGap = Math.max(minGap, currentGap - gapReduction);
    currentFrame += segmentDurationFrames + currentGap;
  }

  return segments;
}

// ============================================================
// Random Weighted Pattern
// ============================================================

/**
 * Weighted random timing for variety
 * Uses seeded random for reproducibility
 */
function generateRandomWeighted(input: PatternInput): BRollSegment[] {
  const {
    totalFrames,
    fps,
    segmentDurationFrames,
    gapDurationFrames,
    videoUrls,
  } = input;

  const segments: BRollSegment[] = [];

  // Seed based on video duration for reproducibility
  let seed = totalFrames;
  const seededRandom = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // Define weighted zones (more B-roll in middle)
  const zones = [
    { start: 0, end: 0.2, weight: 0.3 }, // Beginning: 30% chance
    { start: 0.2, end: 0.7, weight: 0.5 }, // Middle: 50% chance
    { start: 0.7, end: 1.0, weight: 0.2 }, // End: 20% chance
  ];

  // Generate potential positions
  const potentialPositions: number[] = [];
  const step = segmentDurationFrames + gapDurationFrames;

  for (let frame = gapDurationFrames; frame + segmentDurationFrames < totalFrames; frame += step) {
    const progress = frame / totalFrames;

    // Find current zone and apply weight
    for (const zone of zones) {
      if (progress >= zone.start && progress < zone.end) {
        if (seededRandom() < zone.weight) {
          potentialPositions.push(frame);
        }
        break;
      }
    }
  }

  // Shuffle positions for randomness
  for (let i = potentialPositions.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [potentialPositions[i], potentialPositions[j]] = [
      potentialPositions[j],
      potentialPositions[i],
    ];
  }

  // Create segments from positions (limit to available videos)
  const maxSegments = Math.min(potentialPositions.length, videoUrls.length * 2);
  const selectedPositions = potentialPositions
    .slice(0, maxSegments)
    .sort((a, b) => a - b);

  for (let i = 0; i < selectedPositions.length; i++) {
    segments.push({
      startFrame: selectedPositions[i],
      durationFrames: segmentDurationFrames,
      animation: DEFAULT_ANIMATIONS[i % DEFAULT_ANIMATIONS.length],
      videoUrl: videoUrls[i % videoUrls.length],
      opacity: getOpacity(i),
      blendMode: getBlendMode(i),
    });
  }

  return segments;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Create B-roll config from high-level parameters
 */
export function createBRollConfig(
  pattern: BRollPattern,
  videos: string[],
  segmentDurationSec: number = 4,
  gapDurationSec: number = 1.5
): BRollConfig {
  return {
    pattern,
    segmentDuration: segmentDurationSec,
    gapDuration: gapDurationSec,
    videos,
    animations: DEFAULT_ANIMATIONS,
  };
}

/**
 * Calculate total B-roll time in a video
 */
export function calculateBRollTime(segments: BRollSegment[], fps: number): number {
  return segments.reduce((total, seg) => total + seg.durationFrames / fps, 0);
}

/**
 * Get segment at specific frame (or null if none)
 */
export function getActiveSegment(
  segments: BRollSegment[],
  frame: number
): BRollSegment | null {
  return (
    segments.find(
      (seg) =>
        frame >= seg.startFrame &&
        frame < seg.startFrame + seg.durationFrames
    ) || null
  );
}

/**
 * Check if frame is in transition zone (gap between segments)
 */
export function isInTransition(
  segments: BRollSegment[],
  frame: number,
  transitionFrames: number = 15
): boolean {
  for (const seg of segments) {
    const segEnd = seg.startFrame + seg.durationFrames;
    if (frame >= segEnd && frame < segEnd + transitionFrames) {
      return true;
    }
    if (frame >= seg.startFrame - transitionFrames && frame < seg.startFrame) {
      return true;
    }
  }
  return false;
}

// ============================================================
// Exports
// ============================================================

export default generateBRollSegments;
