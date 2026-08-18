// ===============================
// @vibee/atoms - Default Values
// Single source of truth for Web & Mobile editors
// ===============================

import type { Track, TrackItem, Asset, CaptionItem, AvatarModeSettings, AvatarAnimation, AvatarConfig } from './types';

// ===============================
// Default Template Config
// ===============================

export const DEFAULT_TEMPLATE = {
  fps: 30,
  width: 1080,
  height: 1920,
  durationInFrames: 834, // ~27.8 seconds at 30fps
  coverDuration: 0.5,
  circleSizePercent: 25.2,
  circleBottomPercent: 0,
  circleLeftPercent: 0,
};

// ===============================
// Default Assets
// ===============================

export const DEFAULT_ASSETS: Asset[] = [
  {
    id: 'asset-lipsync',
    type: 'video',
    name: 'Lipsync Video',
    url: '/lipsync/lipsync.mp4',
    duration: 900,
  },
  {
    id: 'asset-cover',
    type: 'image',
    name: 'Cover Image',
    url: '/covers/poster.jpeg',
    width: 1080,
    height: 1920,
  },
  {
    id: 'asset-bg-00',
    type: 'video',
    name: 'Background 00',
    url: '/backgrounds/business/bg00.mp4',
    duration: 300,
  },
  {
    id: 'asset-bg-01',
    type: 'video',
    name: 'Background 01',
    url: '/backgrounds/business/bg01.mp4',
    duration: 300,
  },
  {
    id: 'asset-bg-02',
    type: 'video',
    name: 'Background 02',
    url: '/backgrounds/business/bg02.mp4',
    duration: 300,
  },
  {
    id: 'asset-bg-03',
    type: 'video',
    name: 'Background 03',
    url: '/backgrounds/business/bg03.mp4',
    duration: 300,
  },
  {
    id: 'asset-bg-04',
    type: 'video',
    name: 'Background 04',
    url: '/backgrounds/business/bg04.mp4',
    duration: 300,
  },
  {
    id: 'asset-music-phonk',
    type: 'audio',
    name: 'Phonk Music',
    url: '/audio/music/bgmusic.mp3',
    duration: 1800,
  },
  {
    id: 'asset-music-business',
    type: 'audio',
    name: 'Business Music',
    url: '/music/business.mp3',
    duration: 1800,
  },
  {
    id: 'asset-music-corporate',
    type: 'audio',
    name: 'Corporate Music',
    url: '/music/corporate.mp3',
    duration: 1800,
  },
  {
    id: 'asset-music-upbeat',
    type: 'audio',
    name: 'Upbeat Music',
    url: '/music/upbeat.mp3',
    duration: 1800,
  },
];

// Asset IDs that should never be removed
export const DEFAULT_ASSET_IDS = [
  'asset-lipsync',
  'asset-cover',
  'asset-music-phonk',
  'asset-music-business',
  'asset-music-corporate',
  'asset-music-upbeat',
];

// ===============================
// Timeline Timing Defaults (MUST be before createDefaultTracks)
// ===============================

export const DEFAULT_GAP_DURATION_SECONDS = 1.5;
export const DEFAULT_SEGMENT_DURATION_SECONDS = 4;
export const DEFAULT_COVER_DURATION = 0.5;

// ===============================
// Create Default Tracks
// ===============================

export function createDefaultTracks(
  fps: number = DEFAULT_TEMPLATE.fps,
  durationInFrames: number = DEFAULT_TEMPLATE.durationInFrames
): Track[] {
  const coverFrames = Math.floor((DEFAULT_TEMPLATE.coverDuration || DEFAULT_COVER_DURATION) * fps);
  const gapFrames = Math.floor(DEFAULT_GAP_DURATION_SECONDS * fps);
  const segmentFrames = Math.floor(DEFAULT_SEGMENT_DURATION_SECONDS * fps);

  const backgroundVideos = [
    '/backgrounds/business/bg00.mp4',
    '/backgrounds/business/bg01.mp4',
    '/backgrounds/business/bg02.mp4',
    '/backgrounds/business/bg03.mp4',
    '/backgrounds/business/bg04.mp4',
  ];

  // Video track items
  const videoItems: TrackItem[] = [];
  let currentFrame = coverFrames + gapFrames;

  backgroundVideos.forEach((_, index) => {
    if (currentFrame < durationInFrames) {
      const duration = Math.min(segmentFrames, durationInFrames - currentFrame);
      videoItems.push({
        id: `item-bg-${index}`,
        trackId: 'track-video',
        assetId: `asset-bg-${String(index).padStart(2, '0')}`,
        type: 'video',
        startFrame: currentFrame,
        durationInFrames: duration,
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        rotation: 0,
        opacity: 1,
        volume: 0,
        playbackRate: 1,
      });
      currentFrame += duration + gapFrames;
    }
  });

  return [
    // Avatar first - primary content
    {
      id: 'track-avatar',
      type: 'avatar',
      name: 'Avatar',
      items: [
        {
          id: 'item-lipsync',
          trackId: 'track-avatar',
          assetId: 'asset-lipsync',
          type: 'avatar',
          startFrame: 0,
          durationInFrames: durationInFrames,
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          rotation: 0,
          opacity: 1,
          volume: 1,
          circleSizePercent: DEFAULT_TEMPLATE.circleSizePercent,
          circleBottomPercent: DEFAULT_TEMPLATE.circleBottomPercent,
          circleLeftPercent: DEFAULT_TEMPLATE.circleLeftPercent,
        },
      ],
      locked: false,
      visible: true,
      muted: false,
      solo: false,
    },
    // Video (B-roll) track
    {
      id: 'track-video',
      type: 'video',
      name: 'Video',
      items: videoItems,
      locked: false,
      visible: true,
      muted: false,
      solo: false,
    },
    // Image overlay track
    {
      id: 'track-image',
      type: 'image',
      name: 'Image',
      items: [],
      locked: false,
      visible: true,
      muted: false,
      solo: false,
    },
    // Voice track
    {
      id: 'track-voice',
      type: 'voice',
      name: 'Voice',
      items: [],
      locked: false,
      visible: true,
      muted: false,
      solo: false,
    },
    // Audio/Music track
    {
      id: 'track-audio',
      type: 'audio',
      name: 'Music',
      items: [],
      locked: false,
      visible: true,
      muted: false,
      solo: false,
    },
  ];
}

// Default tracks — production-tuned layout for the base Vibee Reel template
export const DEFAULT_TRACKS: Track[] = [
  {
    id: 'track-avatar',
    type: 'avatar',
    name: 'Avatar',
    items: [
      {
        id: 'item-lipsync',
        trackId: 'track-avatar',
        assetId: 'asset-lipsync',
        type: 'avatar',
        startFrame: 0,
        durationInFrames: 834,
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        rotation: 0,
        opacity: 1,
        volume: 1,
        circleSizePercent: 25.2,
        circleBottomPercent: 0,
        circleLeftPercent: 0,
      },
    ],
    locked: false,
    visible: true,
    muted: false,
    solo: false,
  },
  {
    id: 'track-video',
    type: 'video',
    name: 'Video',
    items: [
      {
        id: 'item-bg-0',
        trackId: 'track-video',
        assetId: 'asset-bg-00',
        type: 'video',
        startFrame: 60,
        durationInFrames: 120,
        x: -3,
        y: 0,
        width: 1080,
        height: 2079,
        rotation: 0,
        opacity: 1,
        volume: 0,
        playbackRate: 1,
      },
      {
        id: 'item-bg-1',
        trackId: 'track-video',
        assetId: 'asset-bg-01',
        type: 'video',
        startFrame: 226,
        durationInFrames: 120,
        x: -8,
        y: 0,
        width: 1128,
        height: 1692,
        rotation: 6,
        opacity: 1,
        volume: 0,
        playbackRate: 1,
        cropY: 80,
        cropX: 34,
      },
      {
        id: 'item-bg-2',
        trackId: 'track-video',
        assetId: 'asset-bg-02',
        type: 'video',
        startFrame: 390,
        durationInFrames: 120,
        x: 0,
        y: 0,
        width: 1080,
        height: 1909,
        rotation: 0,
        opacity: 1,
        volume: 0,
        playbackRate: 1,
      },
      {
        id: 'item-bg-3',
        trackId: 'track-video',
        assetId: 'asset-bg-03',
        type: 'video',
        startFrame: 555,
        durationInFrames: 120,
        x: 0,
        y: 0,
        width: 1080,
        height: 2134,
        rotation: 0,
        opacity: 1,
        volume: 0,
        playbackRate: 1,
      },
      {
        id: 'item-bg-4',
        trackId: 'track-video',
        assetId: 'asset-bg-04',
        type: 'video',
        startFrame: 720,
        durationInFrames: 105,
        x: 0,
        y: 0,
        width: 1080,
        height: 1969,
        rotation: 0,
        opacity: 1,
        volume: 0,
        playbackRate: 1,
      },
    ],
    locked: false,
    visible: true,
    muted: false,
    solo: false,
  },
  {
    id: 'track-image',
    type: 'image',
    name: 'Image',
    items: [],
    locked: false,
    visible: true,
    muted: false,
    solo: false,
  },
  {
    id: 'track-voice',
    type: 'voice',
    name: 'Voice',
    items: [],
    locked: false,
    visible: true,
    muted: false,
    solo: false,
  },
  {
    id: 'track-audio',
    type: 'audio',
    name: 'Music',
    items: [],
    locked: false,
    visible: true,
    muted: false,
    solo: false,
  },
];

// ===============================
// Avatar Mode Defaults
// ===============================

export const DEFAULT_SPLIT_AVATAR: AvatarModeSettings = {
  circleSize: 47,
  positionX: 0,
  positionY: -14,
  faceScale: 1,
  isCircle: true,
  borderRadius: 50,
  faceOffsetX: 0,
  faceOffsetY: 0,
};

export const DEFAULT_FULLSCREEN_AVATAR: AvatarModeSettings = {
  circleSize: 52,
  positionX: 0,
  positionY: 0,
  faceScale: 1,
  isCircle: false,
  borderRadius: 0,
  faceOffsetX: 0,
  faceOffsetY: 0,
};

export const DEFAULT_AVATAR_ANIMATION: AvatarAnimation = 'none';

// ===============================
// Consolidated Avatar Config
// Single source of truth for all avatar settings
// ===============================

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  // Circle/shape settings
  circleSizePercent: 25.2,
  circleBottomPercent: 0,
  circleLeftPercent: 0,
  // Face positioning
  faceOffsetX: 0,
  faceOffsetY: 0,
  faceScale: 1.0,
  // Shape type
  isCircle: true,
  borderRadius: 50,
  // Animation
  animation: 'pop',
  // Border effects
  borderEffect: 'none',
  borderColor: '#FFD700',
  borderColor2: '#FF6B6B',
  borderWidth: 4,
  borderIntensity: 1.0,
};

// ===============================
// Caption Defaults
// ===============================

export const CAPTION_DEFAULTS = {
  fontSize: 70,
  textColor: '#FFFF00', // Bright yellow TikTok-style
  highlightColor: '#f59e0b', // VIBEE amber
  backgroundColor: '#00000099', // Black with 60% opacity (hex8 format)
  bottomPercent: 20,
  maxWidthPercent: 85,
  fontWeight: 900,
  fontFamily: 'Montserrat', // Single source of truth for font
  showShadow: true,
  fontId: 'Montserrat',
  maxWords: 1, // One word at a time
};

// ===============================
// Demo Captions — Base template transcript
// ===============================

export const DEFAULT_CAPTIONS: CaptionItem[] = [
  { text: 'Меня', startMs: 110, endMs: 270, timestampMs: 110, confidence: 1 },
  { text: 'зовут', startMs: 270, endMs: 610, timestampMs: 270, confidence: 1 },
  { text: 'Вайби', startMs: 610, endMs: 920, timestampMs: 610, confidence: 1 },
  { text: 'я', startMs: 1090, endMs: 1140, timestampMs: 1090, confidence: 1 },
  { text: 'цифровой', startMs: 1140, endMs: 1530, timestampMs: 1140, confidence: 1 },
  { text: 'клон', startMs: 1530, endMs: 1750, timestampMs: 1530, confidence: 1 },
  { text: 'моего', startMs: 1750, endMs: 2030, timestampMs: 1750, confidence: 1 },
  { text: 'создателя', startMs: 2030, endMs: 2840, timestampMs: 2030, confidence: 1 },
  { text: 'Васильева', startMs: 2880, endMs: 3280, timestampMs: 2880, confidence: 1 },
  { text: 'Дмитрия.', startMs: 3280, endMs: 4280, timestampMs: 3280, confidence: 1 },
  { text: 'Я', startMs: 4280, endMs: 4330, timestampMs: 4280, confidence: 1 },
  { text: 'помогаю', startMs: 4330, endMs: 4690, timestampMs: 4330, confidence: 1 },
  { text: 'создавать', startMs: 4690, endMs: 5160, timestampMs: 4690, confidence: 1 },
  { text: 'агентов', startMs: 5160, endMs: 5520, timestampMs: 5160, confidence: 1 },
  { text: 'и', startMs: 5520, endMs: 5570, timestampMs: 5520, confidence: 1 },
  { text: 'делать', startMs: 5570, endMs: 5900, timestampMs: 5570, confidence: 1 },
  { text: 'вирусный', startMs: 5900, endMs: 6280, timestampMs: 5900, confidence: 1 },
  { text: 'контент', startMs: 6280, endMs: 6800, timestampMs: 6280, confidence: 1 },
  { text: 'Пока', startMs: 6800, endMs: 7010, timestampMs: 6800, confidence: 1 },
  { text: 'ты', startMs: 7010, endMs: 7120, timestampMs: 7010, confidence: 1 },
  { text: 'живешь', startMs: 7120, endMs: 7480, timestampMs: 7120, confidence: 1 },
  { text: 'в', startMs: 7480, endMs: 7540, timestampMs: 7480, confidence: 1 },
  { text: 'свою', startMs: 7540, endMs: 7690, timestampMs: 7540, confidence: 1 },
  { text: 'жизнь', startMs: 7690, endMs: 7960, timestampMs: 7690, confidence: 1 },
  { text: 'я', startMs: 8060, endMs: 8200, timestampMs: 8060, confidence: 1 },
  { text: 'круглосуточно', startMs: 8200, endMs: 8740, timestampMs: 8200, confidence: 1 },
  { text: 'работаю', startMs: 8740, endMs: 9180, timestampMs: 8740, confidence: 1 },
  { text: 'в', startMs: 9180, endMs: 9300, timestampMs: 9180, confidence: 1 },
  { text: 'телеграм', startMs: 9300, endMs: 9840, timestampMs: 9300, confidence: 1 },
  { text: 'на', startMs: 9840, endMs: 9900, timestampMs: 9840, confidence: 1 },
  { text: 'сайте', startMs: 9900, endMs: 10150, timestampMs: 9900, confidence: 1 },
  { text: 'и', startMs: 10150, endMs: 10200, timestampMs: 10150, confidence: 1 },
  { text: 'в', startMs: 10200, endMs: 10360, timestampMs: 10200, confidence: 1 },
  { text: 'сторис', startMs: 10360, endMs: 10620, timestampMs: 10360, confidence: 1 },
  { text: 'как', startMs: 10620, endMs: 10790, timestampMs: 10620, confidence: 1 },
  { text: 'твой', startMs: 10790, endMs: 11040, timestampMs: 10790, confidence: 1 },
  { text: 'личный', startMs: 11040, endMs: 11420, timestampMs: 11040, confidence: 1 },
  { text: 'нейросотрудник', startMs: 11420, endMs: 12370, timestampMs: 11420, confidence: 1 },
  { text: 'Я', startMs: 12480, endMs: 12560, timestampMs: 12480, confidence: 1 },
  { text: 'придумываю', startMs: 12560, endMs: 13290, timestampMs: 12560, confidence: 1 },
  { text: 'идеи,', startMs: 13290, endMs: 13630, timestampMs: 13290, confidence: 1 },
  { text: 'пишу', startMs: 13630, endMs: 13930, timestampMs: 13630, confidence: 1 },
  { text: 'сценарии', startMs: 13930, endMs: 14430, timestampMs: 13930, confidence: 1 },
  { text: 'озвучиваю', startMs: 14700, endMs: 15320, timestampMs: 14700, confidence: 1 },
  { text: 'AI', startMs: 15320, endMs: 15440, timestampMs: 15320, confidence: 1 },
  { text: 'голосом', startMs: 15440, endMs: 15990, timestampMs: 15440, confidence: 1 },
  { text: 'и', startMs: 15990, endMs: 16040, timestampMs: 15990, confidence: 1 },
  { text: 'собираю', startMs: 16040, endMs: 16480, timestampMs: 16040, confidence: 1 },
  { text: 'ролики', startMs: 16480, endMs: 16920, timestampMs: 16480, confidence: 1 },
  { text: 'которые', startMs: 17110, endMs: 17380, timestampMs: 17110, confidence: 1 },
  { text: 'приводят', startMs: 17380, endMs: 17900, timestampMs: 17380, confidence: 1 },
  { text: 'тебе', startMs: 17900, endMs: 18160, timestampMs: 17900, confidence: 1 },
  { text: 'клиентов', startMs: 18160, endMs: 18810, timestampMs: 18160, confidence: 1 },
  { text: 'даже', startMs: 18810, endMs: 18960, timestampMs: 18810, confidence: 1 },
  { text: 'когда', startMs: 18960, endMs: 19380, timestampMs: 18960, confidence: 1 },
  { text: 'ты', startMs: 19380, endMs: 19550, timestampMs: 19380, confidence: 1 },
  { text: 'офлайн', startMs: 19550, endMs: 20200, timestampMs: 19550, confidence: 1 },
  { text: 'Если', startMs: 20200, endMs: 20430, timestampMs: 20200, confidence: 1 },
  { text: 'хочешь', startMs: 20430, endMs: 20780, timestampMs: 20430, confidence: 1 },
  { text: 'чтобы', startMs: 20880, endMs: 21120, timestampMs: 20880, confidence: 1 },
  { text: 'за', startMs: 21120, endMs: 21230, timestampMs: 21120, confidence: 1 },
  { text: 'тебя', startMs: 21230, endMs: 21460, timestampMs: 21230, confidence: 1 },
  { text: 'работал', startMs: 21460, endMs: 21900, timestampMs: 21460, confidence: 1 },
  { text: 'личный', startMs: 21900, endMs: 22200, timestampMs: 21900, confidence: 1 },
  { text: 'нейросотрудник', startMs: 22200, endMs: 23160, timestampMs: 22200, confidence: 1 },
  { text: 'пиши', startMs: 23160, endMs: 23410, timestampMs: 23160, confidence: 1 },
  { text: 'в', startMs: 23410, endMs: 23470, timestampMs: 23410, confidence: 1 },
  { text: 'личку', startMs: 23470, endMs: 23780, timestampMs: 23470, confidence: 1 },
  { text: 'я', startMs: 23900, endMs: 24160, timestampMs: 23900, confidence: 1 },
  { text: 'расскажу', startMs: 24160, endMs: 24440, timestampMs: 24160, confidence: 1 },
  { text: 'с', startMs: 24470, endMs: 24520, timestampMs: 24470, confidence: 1 },
  { text: 'чего', startMs: 24520, endMs: 24770, timestampMs: 24520, confidence: 1 },
  { text: 'начать', startMs: 24770, endMs: 25150, timestampMs: 24770, confidence: 1 },
  { text: 'уже', startMs: 25150, endMs: 25340, timestampMs: 25150, confidence: 1 },
  { text: 'сегодня', startMs: 25340, endMs: 25840, timestampMs: 25340, confidence: 1 },
];

// ===============================
// History Defaults
// ===============================

export const MAX_HISTORY_SIZE = 50;

// ===============================
// FPS Options for Video Rendering
// ===============================

export interface FpsOption {
  value: number;
  label: string;
  description: string;
}

export const FPS_OPTIONS: FpsOption[] = [
  { value: 24, label: '24 fps', description: 'Cinema standard' },
  { value: 25, label: '25 fps', description: 'PAL/European TV' },
  { value: 30, label: '30 fps', description: 'Standard (default)' },
  { value: 50, label: '50 fps', description: 'High-motion PAL' },
  { value: 60, label: '60 fps', description: 'Smooth motion' },
];

// ===============================
// Platform Character Limits
// ===============================

export const PLATFORM_LIMITS: Record<string, number> = {
  instagram: 2200,
  tiktok: 4000,
  youtube: 5000,
  telegram: 4096,
};

// ===============================
// Limits
// ===============================

export const MAX_DRAFTS = 20;
export const MAX_RESULTS_PER_TAB = 5;

// ===============================
// Video Effect Defaults
// ===============================

export const DEFAULT_MUSIC_VOLUME = 0.06;
export const DEFAULT_VIGNETTE_STRENGTH = 0.7;
export const DEFAULT_COLOR_CORRECTION = 1.2;
// DEFAULT_COVER_DURATION moved above createDefaultTracks

// DEFAULT_GAP_DURATION_SECONDS moved above createDefaultTracks
// DEFAULT_SEGMENT_DURATION_SECONDS moved above createDefaultTracks

// ===============================
// Factory/Remotion Defaults
// ===============================

export const DEFAULT_FPS = 30;
export const DEFAULT_WIDTH = 1080;
export const DEFAULT_HEIGHT = 1920;
export const DEFAULT_COVER_OVERLAY_DURATION_FRAMES = 15;
export const DEFAULT_FADE_DURATION_FRAMES = 8;

// ===============================
// Track Colors (Single source of truth)
// ===============================

export const TRACK_COLORS: Record<string, string> = {
  video: '#3b82f6',   // Blue
  avatar: '#8b5cf6',  // Purple
  audio: '#22c55e',   // Green
  voice: '#f97316',   // Orange
  image: '#ec4899',   // Pink
  text: '#eab308',    // Yellow
};

// ===============================
// Brand Colors (Single source of truth)
// ===============================

export const BRAND_COLORS = {
  amber: '#f59e0b',        // Primary brand color
  amberLight: '#fbbf24',   // Amber hover/light variant
  amberDark: '#d97706',    // Amber dark variant
  orange: '#f97316',       // Orange accent
  gold: '#FFD700',         // Avatar border default
  red: '#FF6B6B',          // Avatar border secondary
  brightYellow: '#FFFF00', // Caption text color
} as const;

// ===============================
// Color Correction Multipliers
// ===============================

export const COLOR_CORRECTION_MULTIPLIERS = {
  brightness: 0.95,
  contrast: 1.15,
  saturation: 1.3,
} as const;

// ===============================
// Animation Timings (seconds)
// ===============================

export const ANIMATION_TIMINGS = {
  morphTransition: 1.2,    // Avatar morph duration
  crossfade: 0.8,          // Avatar/B-roll crossfade
  popupDuration: 1.4,      // Avatar popup duration
  popupPreStart: 0.5,      // Pre-animation offset
  popupPostEnd: 0.8,       // Post-animation offset
} as const;

// ===============================
// Avatar Positioning
// ===============================

export const AVATAR_POSITIONING = {
  circleMarginPx: 60,      // Base circle offset from edge
  circleLeftPx: 40,        // Default left offset
} as const;

// ===============================
// Video Volume Defaults
// ===============================

export const AVATAR_VIDEO_VOLUME = 0.3;

// ===============================
// Z-Index Scale (Single source of truth)
// ===============================

export const Z_INDEX = {
  base: 1,
  elevated: 10,
  dropdown: 100,
  sticky: 500,
  modal: 1000,
  popover: 1500,
  overlay: 2000,
  toast: 9000,
  tooltip: 10000,
} as const;

// ===============================
// UI Animation Durations (seconds)
// For CSS transitions and React animations
// ===============================

export const UI_ANIMATION_DURATIONS = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.2,
  slow: 0.3,
  slower: 0.4,
  slowest: 0.5,
} as const;

// ===============================
// Spacing Scale (pixels)
// ===============================

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// ===============================
// Background Colors (Dark Theme)
// ===============================

export const BG_COLORS = {
  primary: '#0a0a0a',
  elevated: '#1a1a1a',
  secondary: '#2a2a2a',
  tertiary: '#3a3a3a',
} as const;

// ===============================
// Status Colors (Semantic)
// ===============================

export const STATUS_COLORS = {
  error: '#ef4444',
  success: '#22c55e',
  warning: '#eab308',
  info: '#3b82f6',
} as const;

// ===============================
// Avatar Layout Presets
// For AvatarLayouts.tsx and layout components
// ===============================

export const AVATAR_LAYOUT_PRESETS = {
  // PIP (Picture-in-Picture) mode
  pipSize: 22,
  pipBottom: 5,
  pipLeft: 5,
  // Side-by-side mode
  sideSize: 40,
  sideRatio: 0.4,
  // Split screen mode
  splitSize: 50,
  splitRatio: 0.5,
  // Floating mode
  floatingSize: 35,
  floatingBottom: 32.5,
  // Fullscreen mode
  fullscreenSize: 100,
} as const;

// ===============================
// Editor Colors (Dark Theme Variants)
// Extended palette for editor components
// ===============================

export const EDITOR_COLORS = {
  dark: '#0a0a0a',           // Darkest background
  darker: '#0d0d0d',         // Slightly lighter dark
  darkest: '#111111',        // Very dark (for #111)
  surface: '#1a1a1a',        // Main surface color
  card: '#222222',           // Card background (for #222)
  surfaceHover: '#252525',   // Hover state for surfaces
  border: '#2a2a2a',         // Border color
  input: '#333333',          // Input background (for #333)
  hover: '#444444',          // Hover state (for #444)
  mutedDark: '#555555',      // Darker muted text (for #555)
  muted: '#666666',          // Muted text
  mutedLight: '#888888',     // Lighter muted text
} as const;

// ===============================
// Timeline Colors
// Playhead, guides, and timeline-specific colors
// ===============================

export const TIMELINE_COLORS = {
  playhead: '#f43f5e',       // Rose/red playhead
  guide: '#FF3B30',          // SmartGuide color
  selection: '#3b82f6',      // Selection highlight
  snapLine: '#22c55e',       // Snap indicator
} as const;

// ===============================
// System Colors (iOS-style)
// Common system UI colors
// ===============================

export const SYSTEM_COLORS = {
  blue: '#007AFF',           // iOS blue
  gray: '#8E8E93',           // iOS gray
  lightGray: '#C7C7CC',      // iOS light gray
  red: '#FF3B30',            // iOS red
  green: '#34C759',          // iOS green
} as const;

// ===============================
// Typography Scale
// Font sizes for consistent typography
// ===============================

export const TYPOGRAPHY = {
  fontSize: {
    xs: 10,
    sm: 11,
    md: 12,
    base: 13,
    lg: 14,
    xl: 16,
    xxl: 18,
    xxxl: 24,
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

// ===============================
// Border Radius Scale
// Consistent border radius values
// ===============================

export const BORDER_RADIUS = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// ===============================
// Caption Style Presets
// Pre-defined caption styles for quick selection
// ===============================

export const CAPTION_STYLE_PRESETS = {
  default: {
    fontSize: 70,
    fontWeight: 900,
    textColor: '#FFFF00',
    highlightColor: '#f59e0b',
  },
  minimal: {
    fontSize: 48,
    fontWeight: 600,
    textColor: '#FFFFFF',
    highlightColor: '#FFFFFF',
  },
  bold: {
    fontSize: 80,
    fontWeight: 900,
    textColor: '#FFFFFF',
    highlightColor: '#f59e0b',
  },
  karaoke: {
    fontSize: 64,
    fontWeight: 700,
    textColor: '#FF6B6B',
    highlightColor: '#FFD700',
  },
} as const;

// ===============================
// Service Endpoints (Single Source of Truth)
// API URLs for external services
// ===============================

export const SERVICE_ENDPOINTS = {
  remotion: 'https://vibee-render-server.fly.dev',
  // IMPORTANT: mcp points to render-server for database queries
  // Zig server (vibee-api-server) is used only for AI generation endpoints
  mcp: 'https://vibee-render-server.fly.dev',
  // Zig API server for AI generation (accessed selectively)
  zigApi: 'https://vibee-api-server.fly.dev',
  bridge: 'https://vibee-telegram-bridge.fly.dev',
  player: 'https://vibee-player.fly.dev',
} as const;

// ===============================
// WebSocket Endpoints (Single Source of Truth)
// Derived from SERVICE_ENDPOINTS
// ===============================

const getMcpWsHost = () => SERVICE_ENDPOINTS.mcp.replace('https://', '');
const getRemotionWsHost = () => SERVICE_ENDPOINTS.remotion.replace('https://', '');

export const WEBSOCKET_ENDPOINTS = {
  agent: `wss://${getMcpWsHost()}/agent`,
  logs: `wss://${getMcpWsHost()}/logs`,
  sync: `wss://${getMcpWsHost()}/ws`,
  project: (id: string) => `wss://${getMcpWsHost()}/ws/project/${id}`,
  remotion: `wss://${getRemotionWsHost()}`,
} as const;

// ===============================
// Timing Constants (Single Source of Truth)
// Use instead of magic numbers in setTimeout/setInterval
// ===============================

export const TIMING_CONSTANTS = {
  // Reconnect timeouts (ms)
  RECONNECT_SHORT: 2000,
  RECONNECT_MEDIUM: 3000,
  RECONNECT_LONG: 5000,
  // Animation durations (ms)
  ANIMATION_INSTANT: 100,
  ANIMATION_FAST: 150,
  ANIMATION_NORMAL: 300,
  ANIMATION_SLOW: 500,
  // Polling intervals (ms)
  POLL_FAST: 500,
  POLL_NORMAL: 1000,
  POLL_SLOW: 3000,
  // Debounce delays (ms)
  DEBOUNCE_FAST: 150,
  DEBOUNCE_NORMAL: 300,
  DEBOUNCE_SLOW: 500,
  // Toast duration (ms)
  TOAST_SHORT: 3000,
  TOAST_NORMAL: 5000,
  TOAST_LONG: 8000,
} as const;

// ===============================
// Cache TTL (Single Source of Truth)
// Platform-specific cache durations
// ===============================

export const CACHE_TTL = {
  // Mobile - shorter TTL for fresher data
  MOBILE_SHORT: 5 * 60 * 1000,        // 5 minutes
  MOBILE_NORMAL: 15 * 60 * 1000,      // 15 minutes
  MOBILE_LONG: 60 * 60 * 1000,        // 1 hour
  // Web - longer TTL for performance
  WEB_SHORT: 15 * 60 * 1000,          // 15 minutes
  WEB_NORMAL: 60 * 60 * 1000,         // 1 hour
  WEB_LONG: 24 * 60 * 60 * 1000,      // 24 hours
  // Shared
  ASSETS: 24 * 60 * 60 * 1000,        // 24 hours for assets
  USER_DATA: 5 * 60 * 1000,           // 5 minutes for user data
} as const;

// ===============================
// Script Generation Options (Single Source of Truth)
// Used by both mobile and remotion editors
// ===============================

export type ScriptNiche =
  | 'crypto'
  | 'fitness'
  | 'tech'
  | 'business'
  | 'lifestyle'
  | 'travel'
  | 'food'
  | 'fashion'
  | 'gaming'
  | 'education'
  | 'entertainment'
  | 'beauty'
  | 'motivation'
  | 'other';

export type ScriptStyle = 'educational' | 'entertaining' | 'promotional' | 'storytelling' | 'professional' | 'casual' | 'energetic' | 'calm';
export type ScriptDuration = 15 | 30 | 60 | 90;

export const SCRIPT_NICHE_OPTIONS = [
  { value: 'crypto' as const, labelRu: 'Крипто', labelEn: 'Crypto', emoji: '💰' },
  { value: 'fitness' as const, labelRu: 'Фитнес', labelEn: 'Fitness', emoji: '💪' },
  { value: 'tech' as const, labelRu: 'Технологии', labelEn: 'Tech', emoji: '💻' },
  { value: 'business' as const, labelRu: 'Бизнес', labelEn: 'Business', emoji: '📈' },
  { value: 'lifestyle' as const, labelRu: 'Лайфстайл', labelEn: 'Lifestyle', emoji: '✨' },
  { value: 'travel' as const, labelRu: 'Путешествия', labelEn: 'Travel', emoji: '✈️' },
  { value: 'food' as const, labelRu: 'Еда', labelEn: 'Food', emoji: '🍕' },
  { value: 'fashion' as const, labelRu: 'Мода', labelEn: 'Fashion', emoji: '👗' },
  { value: 'gaming' as const, labelRu: 'Игры', labelEn: 'Gaming', emoji: '🎮' },
  { value: 'education' as const, labelRu: 'Образование', labelEn: 'Education', emoji: '📚' },
  { value: 'entertainment' as const, labelRu: 'Развлечения', labelEn: 'Entertainment', emoji: '🎭' },
  { value: 'beauty' as const, labelRu: 'Красота', labelEn: 'Beauty', emoji: '💄' },
  { value: 'motivation' as const, labelRu: 'Мотивация', labelEn: 'Motivation', emoji: '🔥' },
  { value: 'other' as const, labelRu: 'Другое', labelEn: 'Other', emoji: '📝' },
] as const;

export const SCRIPT_STYLE_OPTIONS = [
  { value: 'educational' as const, labelRu: 'Обучающий', labelEn: 'Educational', emoji: '📖' },
  { value: 'entertaining' as const, labelRu: 'Развлекательный', labelEn: 'Entertaining', emoji: '🎉' },
  { value: 'promotional' as const, labelRu: 'Рекламный', labelEn: 'Promotional', emoji: '📢' },
  { value: 'storytelling' as const, labelRu: 'Сторителлинг', labelEn: 'Storytelling', emoji: '📖' },
  { value: 'professional' as const, labelRu: 'Профессиональный', labelEn: 'Professional', emoji: '👔' },
  { value: 'casual' as const, labelRu: 'Разговорный', labelEn: 'Casual', emoji: '😊' },
  { value: 'energetic' as const, labelRu: 'Энергичный', labelEn: 'Energetic', emoji: '⚡' },
  { value: 'calm' as const, labelRu: 'Спокойный', labelEn: 'Calm', emoji: '🧘' },
] as const;

export const SCRIPT_DURATION_OPTIONS = [
  { value: 15 as const, label: '15s', labelRu: '~15 сек', labelEn: '~15s', description: 'Quick hook' },
  { value: 30 as const, label: '30s', labelRu: '~30 сек', labelEn: '~30s', description: 'Standard' },
  { value: 60 as const, label: '60s', labelRu: '~60 сек', labelEn: '~60s', description: 'Detailed' },
  { value: 90 as const, label: '90s', labelRu: '~90 сек', labelEn: '~90s', description: 'Extended' },
] as const;

export const DEFAULT_SCRIPT_INPUT = {
  idea: '',
  niche: 'business' as ScriptNiche,
  style: 'educational' as ScriptStyle,
  duration: 30 as ScriptDuration,
  language: 'ru',
};

// ===============================
// Export Options (Single Source of Truth)
// Video export quality and format settings
// ===============================

export type ExportQuality = 'low' | 'medium' | 'high' | 'ultra';
export type ExportFormat = 'mp4' | 'webm' | 'gif';

export const EXPORT_QUALITY_OPTIONS = [
  { value: 'low' as const, label: '480p', bitrate: '1M' },
  { value: 'medium' as const, label: '720p', bitrate: '3M' },
  { value: 'high' as const, label: '1080p', bitrate: '8M' },
  { value: 'ultra' as const, label: '4K', bitrate: '20M' },
] as const;

export const EXPORT_FORMAT_OPTIONS = [
  { value: 'mp4' as const, label: 'MP4', mime: 'video/mp4' },
  { value: 'webm' as const, label: 'WebM', mime: 'video/webm' },
  { value: 'gif' as const, label: 'GIF', mime: 'image/gif' },
] as const;

export const DEFAULT_EXPORT_SETTINGS = {
  quality: 'high' as ExportQuality,
  format: 'mp4' as ExportFormat,
};
