/**
 * Vibe Reels Template Factory - Zod Schemas
 *
 * Runtime validation schemas for template definitions and props.
 */

import { z } from 'zod';

// ============================================================
// Enum Schemas
// ============================================================

export const AvatarPositionSchema = z.enum([
  'circle-bottom-left',
  'circle-bottom-right',
  'circle-top-left',
  'circle-top-right',
  'side-left',
  'side-right',
  'fullscreen',
  'split-horizontal',
  'split-vertical',
  'floating-center',
]);

export const HookStyleSchema = z.enum([
  'zoom-impact',
  'slide-reveal',
  'typewriter',
  'glitch',
  'pulse',
  'question',
  'counter',
  'none',
]);

export const CaptionStyleSchema = z.enum([
  'classic',
  'modern',
  'karaoke',
  'typewriter',
  'bounce',
  'word-highlight',
  'none',
]);

export const BRollPatternSchema = z.enum([
  'hook-content-cta',
  'even-distribution',
  'progressive',
  'random-weighted',
]);

export const BRollAnimationSchema = z.enum([
  'zoom-in',
  'zoom-out',
  'pan-right',
  'pan-left',
  'rotate-zoom',
]);

// ============================================================
// Component Schemas
// ============================================================

export const CaptionEntrySchema = z.object({
  text: z.string().min(1),
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().min(1),
  highlight: z.string().optional(),
});

export const DimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().min(24).max(60),
});

export const DurationConstraintsSchema = z.object({
  minSeconds: z.number().positive(),
  maxSeconds: z.number().positive(),
  recommendedSeconds: z.number().positive(),
});

export const SafeZonesSchema = z.object({
  top: z.number().min(0),
  bottom: z.number().min(0),
  left: z.number().min(0),
  right: z.number().min(0),
});

// ============================================================
// Variant Axis Schemas
// ============================================================

const createAxisSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    name: z.string(),
    description: z.string(),
    values: z.array(valueSchema),
    default: valueSchema,
    weight: z.record(valueSchema, z.number()).optional(),
  });

export const AvatarAxisSchema = createAxisSchema(AvatarPositionSchema);
export const HookAxisSchema = createAxisSchema(HookStyleSchema);
export const CaptionAxisSchema = createAxisSchema(CaptionStyleSchema);
export const BRollAxisSchema = createAxisSchema(BRollPatternSchema);

// ============================================================
// Exclusion Rule Schema
// ============================================================

export const ExclusionRuleSchema = z.object({
  avatarPosition: z.array(AvatarPositionSchema).optional(),
  hookStyle: z.array(HookStyleSchema).optional(),
  captionStyle: z.array(CaptionStyleSchema).optional(),
  bRollPattern: z.array(BRollPatternSchema).optional(),
  reason: z.string(),
});

// ============================================================
// Main Props Schema
// ============================================================

export const TalkingHeadPropsSchema = z.object({
  // Core media
  lipSyncVideo: z.string().min(1),
  backgroundVideos: z.array(z.string()),
  backgroundMusic: z.string().optional(),
  coverImage: z.string().optional(),

  // Avatar configuration
  avatarPosition: AvatarPositionSchema,
  circleSizePercent: z.number().min(5).max(100),
  circleBottomPercent: z.number().min(0).max(100),
  circleLeftPx: z.number().min(0),

  // Hook configuration
  hookStyle: HookStyleSchema,
  hookText: z.string().optional(),
  hookDuration: z.number().min(0).max(10),

  // Caption configuration
  captionStyle: CaptionStyleSchema,
  captions: z.array(CaptionEntrySchema),
  captionPosition: z.enum(['top', 'center', 'bottom']),
  captionFontSize: z.number().min(12).max(120),
  captionFontColor: z.string(),
  captionHighlightColor: z.string(),

  // B-roll configuration
  bRollPattern: BRollPatternSchema,
  bRollDuration: z.number().min(1).max(15),
  bRollGapDuration: z.number().min(0).max(5),

  // Effects
  vignetteStrength: z.number().min(0).max(1),
  colorCorrection: z.number().min(0.5).max(2),
  musicVolume: z.number().min(0).max(1),
  filmGrainOpacity: z.number().min(0).max(1),
  glassMorphism: z.boolean(),

  // Cover
  coverDuration: z.number().min(0).max(5),
});

// ============================================================
// Template Definition Schema
// ============================================================

export const TemplateDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(['talking-head', 'intro', 'outro', 'carousel']),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  dimensions: DimensionsSchema,
  duration: DurationConstraintsSchema,
  safeZones: SafeZonesSchema,
  extends: z.string().optional(),

  axes: z.object({
    avatarPosition: AvatarAxisSchema,
    hookStyle: HookAxisSchema,
    captionStyle: CaptionAxisSchema,
    bRollPattern: BRollAxisSchema,
  }),

  excludeCombinations: z.array(ExclusionRuleSchema),
  defaultProps: TalkingHeadPropsSchema,
});

// ============================================================
// Generated Variant Schemas
// ============================================================

export const VariantAxesSchema = z.object({
  avatarPosition: AvatarPositionSchema,
  hookStyle: HookStyleSchema,
  captionStyle: CaptionStyleSchema,
  bRollPattern: BRollPatternSchema,
});

export const GeneratedVariantSchema = z.object({
  variantId: z.string().min(1),
  displayName: z.string(),
  baseTemplateId: z.string(),
  axes: VariantAxesSchema,
  props: TalkingHeadPropsSchema,
  priority: z.number().min(0).max(100),
  tags: z.array(z.string()),
  meta: z.object({
    generatedAt: z.string().datetime(),
    version: z.string(),
  }),
});

export const VariantManifestSchema = z.object({
  baseTemplateId: z.string(),
  generatedAt: z.string().datetime(),
  totalVariants: z.number().int().min(0),
  filteredVariants: z.number().int().min(0),
  variants: z.array(GeneratedVariantSchema),
  stats: z.object({
    byAvatarPosition: z.record(AvatarPositionSchema, z.number()),
    byHookStyle: z.record(HookStyleSchema, z.number()),
    byCaptionStyle: z.record(CaptionStyleSchema, z.number()),
    byBRollPattern: z.record(BRollPatternSchema, z.number()),
  }),
});

// ============================================================
// Asset Schemas
// ============================================================

export const AssetCategorySchema = z.enum([
  'lipsync',
  'background',
  'broll',
  'music',
  'cover',
]);

export const AssetEntrySchema = z.object({
  id: z.string(),
  url: z.string().url(),
  type: z.enum(['video', 'image', 'audio']),
  category: AssetCategorySchema,
  duration: z.number().positive().optional(),
  dimensions: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  tags: z.array(z.string()),
  fileSize: z.number().int().positive().optional(),
});

export const AssetManifestSchema = z.object({
  version: z.string(),
  updatedAt: z.string().datetime(),
  bucketUrl: z.string().url(),
  assets: z.object({
    lipsync: z.array(AssetEntrySchema),
    backgrounds: z.array(AssetEntrySchema),
    broll: z.array(AssetEntrySchema),
    music: z.array(AssetEntrySchema),
    covers: z.array(AssetEntrySchema),
  }),
  placeholders: z.object({
    lipsync: z.string(),
    background: z.string(),
    broll: z.array(z.string()),
    music: z.string(),
    cover: z.string(),
  }),
});

// ============================================================
// Batch Rendering Schemas
// ============================================================

export const RenderJobStatusSchema = z.enum([
  'queued',
  'rendering',
  'completed',
  'failed',
  'cancelled',
]);

export const RenderJobSchema = z.object({
  jobId: z.string(),
  variantId: z.string(),
  batchId: z.string(),
  status: RenderJobStatusSchema,

  input: z.object({
    compositionId: z.string(),
    props: TalkingHeadPropsSchema,
    durationInFrames: z.number().int().positive(),
    codec: z.enum(['h264', 'h265', 'vp9']),
  }),

  output: z.object({
    bucket: z.string(),
    key: z.string(),
    format: z.enum(['mp4', 'webm']),
  }),

  progress: z
    .object({
      framesRendered: z.number().int().min(0),
      totalFrames: z.number().int().positive(),
      percentComplete: z.number().min(0).max(100),
      estimatedTimeRemaining: z.number().optional(),
    })
    .optional(),

  result: z
    .object({
      outputUrl: z.string().url(),
      thumbnailUrl: z.string().url(),
      fileSize: z.number().int().positive(),
      renderTimeMs: z.number().int().positive(),
    })
    .optional(),

  error: z
    .object({
      message: z.string(),
      code: z.string(),
      retryCount: z.number().int().min(0),
    })
    .optional(),

  timestamps: z.object({
    created: z.string().datetime(),
    started: z.string().datetime().optional(),
    completed: z.string().datetime().optional(),
  }),
});

export const BatchRenderConfigSchema = z.object({
  batchId: z.string(),
  templateId: z.string(),
  variantIds: z.array(z.string()),

  concurrency: z.object({
    maxParallel: z.number().int().min(1).max(20),
    retryAttempts: z.number().int().min(0).max(5),
    retryDelayMs: z.number().int().min(100),
  }),

  assets: z.object({
    mode: z.enum(['test', 'production']),
    manifestUrl: z.string().url().optional(),
  }),

  output: z.object({
    bucket: z.string(),
    prefix: z.string(),
    format: z.enum(['mp4', 'webm']),
    generateThumbnails: z.boolean(),
  }),

  webhookUrl: z.string().url().optional(),
});

export const BatchProgressSchema = z.object({
  batchId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),

  jobs: z.object({
    total: z.number().int().min(0),
    queued: z.number().int().min(0),
    rendering: z.number().int().min(0),
    completed: z.number().int().min(0),
    failed: z.number().int().min(0),
  }),

  percentComplete: z.number().min(0).max(100),

  timing: z.object({
    startedAt: z.string().datetime().optional(),
    estimatedCompletion: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  }),

  cost: z
    .object({
      renderMinutes: z.number().min(0),
      estimatedUSD: z.number().min(0),
    })
    .optional(),
});

export const CostEstimateSchema = z.object({
  variants: z.number().int().positive(),
  totalFrames: z.number().int().positive(),
  renderMinutes: z.number().positive(),
  storageGB: z.number().positive(),
  estimatedUSD: z.number().min(0),
  breakdown: z.object({
    lambdaCost: z.number().min(0),
    storageCost: z.number().min(0),
    transferCost: z.number().min(0),
  }),
});

// ============================================================
// Type Exports (inferred from schemas)
// ============================================================

export type TemplateDefinitionInput = z.input<typeof TemplateDefinitionSchema>;
export type TalkingHeadPropsInput = z.input<typeof TalkingHeadPropsSchema>;
export type GeneratedVariantInput = z.input<typeof GeneratedVariantSchema>;
export type BatchRenderConfigInput = z.input<typeof BatchRenderConfigSchema>;

// ============================================================
// Validation Helpers
// ============================================================

/**
 * Validate a template definition
 */
export function validateTemplate(data: unknown): z.SafeParseReturnType<unknown, z.infer<typeof TemplateDefinitionSchema>> {
  return TemplateDefinitionSchema.safeParse(data);
}

/**
 * Validate talking head props
 */
export function validateProps(data: unknown): z.SafeParseReturnType<unknown, z.infer<typeof TalkingHeadPropsSchema>> {
  return TalkingHeadPropsSchema.safeParse(data);
}

/**
 * Validate a generated variant
 */
export function validateVariant(data: unknown): z.SafeParseReturnType<unknown, z.infer<typeof GeneratedVariantSchema>> {
  return GeneratedVariantSchema.safeParse(data);
}

/**
 * Validate batch render config
 */
export function validateBatchConfig(data: unknown): z.SafeParseReturnType<unknown, z.infer<typeof BatchRenderConfigSchema>> {
  return BatchRenderConfigSchema.safeParse(data);
}
