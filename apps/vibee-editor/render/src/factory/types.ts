/**
 * Vibe Reels Template Factory - Core Types
 *
 * Type definitions for the template factory system that generates
 * 100+ variations of talking head Instagram Reels.
 */

// ============================================================
// Avatar Position Types
// ============================================================

/** Avatar position configurations */
export type AvatarPosition =
  | 'circle-bottom-left'
  | 'circle-bottom-right'
  | 'circle-top-left'
  | 'circle-top-right'
  | 'side-left'
  | 'side-right'
  | 'fullscreen'
  | 'split-horizontal'
  | 'split-vertical'
  | 'floating-center';

/** Avatar layout configuration */
export interface AvatarLayoutConfig {
  position: AvatarPosition;
  /** Size as percentage of screen height */
  sizePercent: number;
  /** Bottom offset as percentage */
  bottomPercent: number;
  /** Left offset in pixels */
  leftPx: number;
  /** Right offset in pixels (for right-aligned) */
  rightPx?: number;
  /** Enable morphing animation */
  morphEnabled: boolean;
  /** For split layouts: ratio of avatar side */
  splitRatio?: number;
  /** Border radius in pixels */
  borderRadius?: number;
}

// ============================================================
// Hook Style Types
// ============================================================

/** Hook animation styles for first 3 seconds */
export type HookStyle =
  | 'zoom-impact'      // Fast zoom to text
  | 'slide-reveal'     // Sliding text reveal
  | 'typewriter'       // Character-by-character
  | 'glitch'           // Glitch effect on text
  | 'pulse'            // Pulsing text entrance
  | 'question'         // Question mark animation
  | 'counter'          // Countdown/counter hook
  | 'none';            // Direct start (no hook)

/** Hook configuration */
export interface HookConfig {
  style: HookStyle;
  /** Duration in seconds (typically 2-3) */
  duration: number;
  /** Hook text to display */
  text?: string;
  /** Text color */
  textColor?: string;
  /** Background color/gradient */
  backgroundColor?: string;
  /** Font size in pixels */
  fontSize?: number;
}

// ============================================================
// Caption Style Types
// ============================================================

/** Caption/subtitle animation styles */
export type CaptionStyle =
  | 'classic'          // Simple fade with background
  | 'modern'           // Spring animation with glow
  | 'karaoke'          // Horizontal text reveal
  | 'typewriter'       // Character-by-character reveal
  | 'bounce'           // Word-by-word bounce
  | 'word-highlight'   // Highlight individual words
  | 'none';            // No captions

/** Single caption entry */
export interface CaptionEntry {
  text: string;
  startFrame: number;
  endFrame: number;
  /** Word to highlight (optional) */
  highlight?: string;
}

/** Caption configuration */
export interface CaptionConfig {
  style: CaptionStyle;
  entries: CaptionEntry[];
  /** Position on screen */
  position: 'top' | 'center' | 'bottom';
  /** Font size in pixels */
  fontSize: number;
  /** Text color */
  fontColor: string;
  /** Highlight color for emphasized words */
  highlightColor: string;
  /** Background color (for classic style) */
  backgroundColor?: string;
  /** Max width in pixels */
  maxWidth: number;
}

// ============================================================
// B-Roll Pattern Types
// ============================================================

/** B-roll distribution patterns */
export type BRollPattern =
  | 'hook-content-cta'   // 3-segment structure (Hook → Content → CTA)
  | 'even-distribution'  // Equal spacing between b-rolls
  | 'progressive'        // Increasing frequency toward end
  | 'random-weighted';   // Weighted random timing

/** B-roll animation types (from LipSyncMain) */
export type BRollAnimation =
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-right'
  | 'pan-left'
  | 'rotate-zoom';

/** Single B-roll segment */
export interface BRollSegment {
  /** Start frame */
  startFrame: number;
  /** Duration in frames */
  durationFrames: number;
  /** Animation type */
  animation: BRollAnimation;
  /** Video URL */
  videoUrl: string;
  /** Opacity (0-1) */
  opacity: number;
  /** Blend mode */
  blendMode: 'normal' | 'screen' | 'overlay';
}

/** B-roll configuration */
export interface BRollConfig {
  pattern: BRollPattern;
  /** Duration of each B-roll segment in seconds */
  segmentDuration: number;
  /** Gap between avatar and B-roll in seconds */
  gapDuration: number;
  /** Video URLs to cycle through */
  videos: string[];
  /** Animation sequence (cycles through) */
  animations: BRollAnimation[];
}

// ============================================================
// Template Definition Types
// ============================================================

/** Video dimensions */
export interface Dimensions {
  width: number;
  height: number;
  fps: number;
}

/** Duration constraints */
export interface DurationConstraints {
  minSeconds: number;
  maxSeconds: number;
  recommendedSeconds: number;
}

/** Safe zones (pixels from edges) */
export interface SafeZones {
  top: number;      // Instagram UI overlap (250px)
  bottom: number;   // Caption/CTA area (320px)
  left: number;
  right: number;
}

/** Variant axis configuration */
export interface VariantAxis<T extends string> {
  name: string;
  description: string;
  values: T[];
  default: T;
  /** Weight for A/B testing priority (higher = more important) */
  weight?: Partial<Record<T, number>>;
}

/** Exclusion rule for invalid combinations */
export interface ExclusionRule {
  avatarPosition?: AvatarPosition[];
  hookStyle?: HookStyle[];
  captionStyle?: CaptionStyle[];
  bRollPattern?: BRollPattern[];
  reason: string;
}

/** Base template definition */
export interface BaseTemplate {
  id: string;
  name: string;
  description: string;
  category: 'talking-head' | 'intro' | 'outro' | 'carousel';
  version: string;
  dimensions: Dimensions;
  duration: DurationConstraints;
  safeZones: SafeZones;
  /** Inherits from another template */
  extends?: string;
}

/** Complete template with variation axes */
export interface TemplateDefinition extends BaseTemplate {
  axes: {
    avatarPosition: VariantAxis<AvatarPosition>;
    hookStyle: VariantAxis<HookStyle>;
    captionStyle: VariantAxis<CaptionStyle>;
    bRollPattern: VariantAxis<BRollPattern>;
  };
  excludeCombinations: ExclusionRule[];
  defaultProps: TalkingHeadProps;
}

// ============================================================
// Props Types
// ============================================================

/** Props for the TalkingHead factory composition */
export interface TalkingHeadProps {
  // Core media
  lipSyncVideo: string;
  backgroundVideos: string[];
  backgroundMusic?: string;
  coverImage?: string;

  // Avatar configuration
  avatarPosition: AvatarPosition;
  circleSizePercent: number;
  circleBottomPercent: number;
  circleLeftPx: number;

  // Hook configuration
  hookStyle: HookStyle;
  hookText?: string;
  hookDuration: number;

  // Caption configuration
  captionStyle: CaptionStyle;
  captions: CaptionEntry[];
  captionPosition: 'top' | 'center' | 'bottom';
  captionFontSize: number;
  captionFontColor: string;
  captionHighlightColor: string;

  // B-roll configuration
  bRollPattern: BRollPattern;
  bRollDuration: number;
  bRollGapDuration: number;

  // Effects
  vignetteStrength: number;
  colorCorrection: number;
  musicVolume: number;
  filmGrainOpacity: number;
  glassMorphism: boolean;

  // Cover
  coverDuration: number;
}

// ============================================================
// Abbreviation Maps (for variant ID generation)
// ============================================================

/** Avatar position abbreviations for variant IDs */
export const AVATAR_ABBREVIATIONS: Record<AvatarPosition, string> = {
  'circle-bottom-left': 'cbl',
  'circle-bottom-right': 'cbr',
  'circle-top-left': 'ctl',
  'circle-top-right': 'ctr',
  'side-left': 'sl',
  'side-right': 'sr',
  'fullscreen': 'fs',
  'split-horizontal': 'sh',
  'split-vertical': 'sv',
  'floating-center': 'fc',
};

/** Hook style abbreviations */
export const HOOK_ABBREVIATIONS: Record<HookStyle, string> = {
  'zoom-impact': 'zi',
  'slide-reveal': 'sr',
  'typewriter': 'tw',
  'glitch': 'gl',
  'pulse': 'pu',
  'question': 'qu',
  'counter': 'co',
  'none': 'no',
};

/** Caption style abbreviations */
export const CAPTION_ABBREVIATIONS: Record<CaptionStyle, string> = {
  'classic': 'c',
  'modern': 'm',
  'karaoke': 'k',
  'typewriter': 'tw',
  'bounce': 'b',
  'word-highlight': 'wh',
  'none': 'no',
};

/** B-Roll pattern abbreviations */
export const BROLL_ABBREVIATIONS: Record<BRollPattern, string> = {
  'hook-content-cta': 'hcc',
  'even-distribution': 'ed',
  'progressive': 'pr',
  'random-weighted': 'rw',
};

// ============================================================
// Generated Variant Types
// ============================================================

/** Axis values for a specific variant */
export interface VariantAxes {
  avatarPosition: AvatarPosition;
  hookStyle: HookStyle;
  captionStyle: CaptionStyle;
  bRollPattern: BRollPattern;
}

/** A single generated variant */
export interface GeneratedVariant {
  /** Unique variant ID (e.g., "TH_cbl_zi_k_hcc") */
  variantId: string;
  /** Human-readable name */
  displayName: string;
  /** Base template ID */
  baseTemplateId: string;
  /** Specific axis values for this variant */
  axes: VariantAxes;
  /** Computed props for rendering */
  props: TalkingHeadProps;
  /** Priority score for A/B testing (0-100) */
  priority: number;
  /** Tags for filtering/search */
  tags: string[];
  /** Metadata */
  meta: {
    generatedAt: string;
    version: string;
  };
}

/** Manifest of all generated variants */
export interface VariantManifest {
  baseTemplateId: string;
  generatedAt: string;
  totalVariants: number;
  filteredVariants: number;
  variants: GeneratedVariant[];
  stats: {
    byAvatarPosition: Record<AvatarPosition, number>;
    byHookStyle: Record<HookStyle, number>;
    byCaptionStyle: Record<CaptionStyle, number>;
    byBRollPattern: Record<BRollPattern, number>;
  };
}

// ============================================================
// Asset Management Types
// ============================================================

/** Asset category */
export type AssetCategory = 'lipsync' | 'background' | 'broll' | 'music' | 'cover';

/** Asset metadata */
export interface AssetEntry {
  id: string;
  url: string;
  type: 'video' | 'image' | 'audio';
  category: AssetCategory;
  /** Duration in seconds (for video/audio) */
  duration?: number;
  /** Dimensions (for video/image) */
  dimensions?: {
    width: number;
    height: number;
  };
  /** Content tags for matching */
  tags: string[];
  /** File size in bytes */
  fileSize?: number;
}

/** Asset manifest for S3 bucket */
export interface AssetManifest {
  version: string;
  updatedAt: string;
  bucketUrl: string;
  assets: {
    lipsync: AssetEntry[];
    backgrounds: AssetEntry[];
    broll: AssetEntry[];
    music: AssetEntry[];
    covers: AssetEntry[];
  };
  placeholders: {
    lipsync: string;
    background: string;
    broll: string[];
    music: string;
    cover: string;
  };
}

// ============================================================
// Batch Rendering Types
// ============================================================

/** Render job status */
export type RenderJobStatus = 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled';

/** Render job configuration */
export interface RenderJob {
  jobId: string;
  variantId: string;
  batchId: string;
  status: RenderJobStatus;

  input: {
    compositionId: string;
    props: TalkingHeadProps;
    durationInFrames: number;
    codec: 'h264' | 'h265' | 'vp9';
  };

  output: {
    bucket: string;
    key: string;
    format: 'mp4' | 'webm';
  };

  progress?: {
    framesRendered: number;
    totalFrames: number;
    percentComplete: number;
    estimatedTimeRemaining?: number;
  };

  result?: {
    outputUrl: string;
    thumbnailUrl: string;
    fileSize: number;
    renderTimeMs: number;
  };

  error?: {
    message: string;
    code: string;
    retryCount: number;
  };

  timestamps: {
    created: string;
    started?: string;
    completed?: string;
  };
}

/** Batch render configuration */
export interface BatchRenderConfig {
  batchId: string;
  templateId: string;
  variantIds: string[];

  concurrency: {
    maxParallel: number;
    retryAttempts: number;
    retryDelayMs: number;
  };

  assets: {
    mode: 'test' | 'production';
    manifestUrl?: string;
  };

  output: {
    bucket: string;
    prefix: string;
    format: 'mp4' | 'webm';
    generateThumbnails: boolean;
  };

  webhookUrl?: string;
}

/** Batch render progress */
export interface BatchProgress {
  batchId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  jobs: {
    total: number;
    queued: number;
    rendering: number;
    completed: number;
    failed: number;
  };

  percentComplete: number;

  timing: {
    startedAt?: string;
    estimatedCompletion?: string;
    completedAt?: string;
  };

  cost?: {
    renderMinutes: number;
    estimatedUSD: number;
  };
}

/** Cost estimation result */
export interface CostEstimate {
  variants: number;
  totalFrames: number;
  renderMinutes: number;
  storageGB: number;
  estimatedUSD: number;
  breakdown: {
    lambdaCost: number;
    storageCost: number;
    transferCost: number;
  };
}

// ============================================================
// Abbreviation Maps (for variant ID generation)
// ============================================================

export const AVATAR_ABBREV: Record<AvatarPosition, string> = {
  'circle-bottom-left': 'cbl',
  'circle-bottom-right': 'cbr',
  'circle-top-left': 'ctl',
  'circle-top-right': 'ctr',
  'side-left': 'sl',
  'side-right': 'sr',
  'fullscreen': 'fs',
  'split-horizontal': 'sh',
  'split-vertical': 'sv',
  'floating-center': 'fc',
};

export const HOOK_ABBREV: Record<HookStyle, string> = {
  'zoom-impact': 'zi',
  'slide-reveal': 'sr',
  'typewriter': 'tw',
  'glitch': 'gl',
  'pulse': 'pu',
  'question': 'qu',
  'counter': 'co',
  'none': 'no',
};

export const CAPTION_ABBREV: Record<CaptionStyle, string> = {
  'classic': 'cl',
  'modern': 'mo',
  'karaoke': 'ka',
  'typewriter': 'tw',
  'bounce': 'bo',
  'word-highlight': 'wh',
  'none': 'no',
};

export const BROLL_ABBREV: Record<BRollPattern, string> = {
  'hook-content-cta': 'hcc',
  'even-distribution': 'ed',
  'progressive': 'pr',
  'random-weighted': 'rw',
};

// ============================================================
// Type Aliases (for backwards compatibility)
// ============================================================

/** Alias for TemplateDefinition */
export type Template = TemplateDefinition;

/** Simplified variant type used by VariationGenerator */
export interface TemplateVariant {
  /** Unique variant ID (e.g., "TH_cbl_zi_k_hcc") */
  id: string;
  /** Base template ID */
  templateId: string;
  /** Human-readable name */
  name: string;
  /** Specific axis values for this variant */
  axes: VariantAxes;
  /** Priority score for A/B testing (0-100) */
  priority: number;
  /** Computed props for rendering */
  props: Partial<TalkingHeadProps>;
}

/** Weights for variation axes */
export interface AxisWeights {
  avatarPosition?: Partial<Record<AvatarPosition, number>>;
  hookStyle?: Partial<Record<HookStyle, number>>;
  captionStyle?: Partial<Record<CaptionStyle, number>>;
  bRollPattern?: Partial<Record<BRollPattern, number>>;
}
