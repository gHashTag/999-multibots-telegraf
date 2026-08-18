/**
 * Single source of truth for composition configuration
 * Used by: Root.tsx, render-server.ts, player/renderApi.ts
 */

import { DEFAULT_FPS, DEFAULT_WIDTH, DEFAULT_HEIGHT } from '@vibee/atoms';

export const COMPOSITIONS = {
  SPLIT_TALKING_HEAD: 'SplitTalkingHead',
} as const;

export type CompositionId = typeof COMPOSITIONS[keyof typeof COMPOSITIONS];

// Default composition for rendering
export const DEFAULT_COMPOSITION_ID: CompositionId = COMPOSITIONS.SPLIT_TALKING_HEAD;

// Composition metadata
export const COMPOSITION_CONFIG = {
  [COMPOSITIONS.SPLIT_TALKING_HEAD]: {
    id: COMPOSITIONS.SPLIT_TALKING_HEAD,
    name: 'Split Talking Head',
    description: 'TikTok-style split screen with B-roll and talking head',
    fps: DEFAULT_FPS,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    durationInFrames: 1020,
  },
} as const;
