/**
 * Variation Generator
 *
 * Generates all valid template variations from a Template definition.
 * Handles:
 * - Cartesian product of variation axes
 * - Exclusion filtering (invalid combinations)
 * - Priority scoring based on weights
 * - Unique variant ID generation
 */

import type {
  Template,
  TemplateVariant,
  AvatarPosition,
  HookStyle,
  CaptionStyle,
  BRollPattern,
  TalkingHeadProps,
  AxisWeights,
} from './types';

import {
  AVATAR_ABBREVIATIONS,
  HOOK_ABBREVIATIONS,
  CAPTION_ABBREVIATIONS,
  BROLL_ABBREVIATIONS,
} from './types';

// ============================================================
// Types
// ============================================================

export interface GeneratorOptions {
  /** Maximum number of variants to generate */
  limit?: number;
  /** Minimum priority score (0-100) to include */
  minPriority?: number;
  /** Specific axes to vary (others use default) */
  varyAxes?: Array<'avatarPosition' | 'hookStyle' | 'captionStyle' | 'bRollPattern'>;
  /** Seed for deterministic random (for reproducibility) */
  seed?: number;
}

export interface GeneratorResult {
  /** Generated variants */
  variants: TemplateVariant[];
  /** Total possible combinations (before filtering) */
  totalPossible: number;
  /** Combinations after exclusion filtering */
  afterExclusions: number;
  /** Final count after priority/limit filtering */
  finalCount: number;
  /** Statistics about the generation */
  stats: GeneratorStats;
}

export interface GeneratorStats {
  /** Average priority score */
  avgPriority: number;
  /** Highest priority score */
  maxPriority: number;
  /** Lowest priority score */
  minPriority: number;
  /** Distribution by avatar position */
  byAvatarPosition: Record<string, number>;
  /** Distribution by hook style */
  byHookStyle: Record<string, number>;
  /** Distribution by caption style */
  byCaptionStyle: Record<string, number>;
  /** Distribution by B-roll pattern */
  byBRollPattern: Record<string, number>;
}

// ============================================================
// Main Generator Function
// ============================================================

/**
 * Generate all valid template variations
 */
export function generateVariations(
  template: Template,
  options: GeneratorOptions = {}
): GeneratorResult {
  const {
    limit = 100,
    minPriority = 0,
    varyAxes = ['avatarPosition', 'hookStyle', 'captionStyle', 'bRollPattern'],
  } = options;

  // Get axis values and weights
  const axes = template.axes;

  // Determine which values to iterate over
  const avatarPositions = varyAxes.includes('avatarPosition')
    ? axes.avatarPosition.values
    : [axes.avatarPosition.default];

  const hookStyles = varyAxes.includes('hookStyle')
    ? axes.hookStyle.values
    : [axes.hookStyle.default];

  const captionStyles = varyAxes.includes('captionStyle')
    ? axes.captionStyle.values
    : [axes.captionStyle.default];

  const bRollPatterns = varyAxes.includes('bRollPattern')
    ? axes.bRollPattern.values
    : [axes.bRollPattern.default];

  // Calculate total possible combinations
  const totalPossible =
    avatarPositions.length *
    hookStyles.length *
    captionStyles.length *
    bRollPatterns.length;

  // Generate all combinations
  const allCombinations: Array<{
    avatarPosition: AvatarPosition;
    hookStyle: HookStyle;
    captionStyle: CaptionStyle;
    bRollPattern: BRollPattern;
  }> = [];

  for (const avatarPosition of avatarPositions) {
    for (const hookStyle of hookStyles) {
      for (const captionStyle of captionStyles) {
        for (const bRollPattern of bRollPatterns) {
          allCombinations.push({
            avatarPosition,
            hookStyle,
            captionStyle,
            bRollPattern,
          });
        }
      }
    }
  }

  // Filter out excluded combinations
  const validCombinations = allCombinations.filter(
    (combo) => !isExcluded(combo, template.excludeCombinations)
  );

  const afterExclusions = validCombinations.length;

  // Calculate priority scores
  const scoredCombinations = validCombinations.map((combo) => ({
    ...combo,
    priority: calculatePriority(combo, {
      avatarPosition: axes.avatarPosition.weight,
      hookStyle: axes.hookStyle.weight,
      captionStyle: axes.captionStyle.weight,
      bRollPattern: axes.bRollPattern.weight,
    }),
  }));

  // Filter by minimum priority
  const filteredByPriority = scoredCombinations.filter(
    (combo) => combo.priority >= minPriority
  );

  // Sort by priority (descending)
  filteredByPriority.sort((a, b) => b.priority - a.priority);

  // Limit results
  const limitedCombinations = filteredByPriority.slice(0, limit);

  // Generate variants
  const variants: TemplateVariant[] = limitedCombinations.map((combo, index) => ({
    id: generateVariantId(template.id, combo),
    templateId: template.id,
    name: generateVariantName(combo),
    axes: {
      avatarPosition: combo.avatarPosition,
      hookStyle: combo.hookStyle,
      captionStyle: combo.captionStyle,
      bRollPattern: combo.bRollPattern,
    },
    priority: combo.priority,
    props: generateProps(template, combo),
  }));

  // Calculate statistics
  const stats = calculateStats(variants);

  return {
    variants,
    totalPossible,
    afterExclusions,
    finalCount: variants.length,
    stats,
  };
}

// ============================================================
// Exclusion Checking
// ============================================================

interface Combination {
  avatarPosition: AvatarPosition;
  hookStyle: HookStyle;
  captionStyle: CaptionStyle;
  bRollPattern: BRollPattern;
}

interface ExclusionRule {
  avatarPosition?: AvatarPosition[];
  hookStyle?: HookStyle[];
  captionStyle?: CaptionStyle[];
  bRollPattern?: BRollPattern[];
  reason?: string;
}

/**
 * Check if a combination is excluded by any rule
 */
function isExcluded(combo: Combination, rules: ExclusionRule[]): boolean {
  for (const rule of rules) {
    if (matchesExclusionRule(combo, rule)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if combination matches an exclusion rule
 */
function matchesExclusionRule(combo: Combination, rule: ExclusionRule): boolean {
  // A rule matches if ALL specified conditions match
  const conditions: boolean[] = [];

  if (rule.avatarPosition && rule.avatarPosition.length > 0) {
    conditions.push(rule.avatarPosition.includes(combo.avatarPosition));
  }

  if (rule.hookStyle && rule.hookStyle.length > 0) {
    conditions.push(rule.hookStyle.includes(combo.hookStyle));
  }

  if (rule.captionStyle && rule.captionStyle.length > 0) {
    conditions.push(rule.captionStyle.includes(combo.captionStyle));
  }

  if (rule.bRollPattern && rule.bRollPattern.length > 0) {
    conditions.push(rule.bRollPattern.includes(combo.bRollPattern));
  }

  // If no conditions, rule doesn't apply
  if (conditions.length === 0) {
    return false;
  }

  // Rule matches if ALL conditions are true
  return conditions.every((c) => c);
}

// ============================================================
// Priority Calculation
// ============================================================

/**
 * Calculate priority score (0-100) based on axis weights
 */
function calculatePriority(
  combo: Combination,
  weights: AxisWeights
): number {
  // Get individual weights (default to 10 if not specified)
  const avatarWeight = weights.avatarPosition?.[combo.avatarPosition] ?? 10;
  const hookWeight = weights.hookStyle?.[combo.hookStyle] ?? 10;
  const captionWeight = weights.captionStyle?.[combo.captionStyle] ?? 10;
  const bRollWeight = weights.bRollPattern?.[combo.bRollPattern] ?? 10;

  // Weighted average (equal axis importance)
  const totalWeight = avatarWeight + hookWeight + captionWeight + bRollWeight;
  const maxPossible = 100 * 4; // If all axes had weight 100

  // Normalize to 0-100 scale
  return Math.round((totalWeight / maxPossible) * 100);
}

// ============================================================
// Variant ID Generation
// ============================================================

/**
 * Generate unique variant ID
 * Format: TH_{avatar}_{hook}_{caption}_{broll}
 */
function generateVariantId(
  templateId: string,
  combo: Combination
): string {
  const prefix = templateId.startsWith('talking-head') ? 'TH' : 'V';

  const avatarAbbr = AVATAR_ABBREVIATIONS[combo.avatarPosition] || 'unk';
  const hookAbbr = HOOK_ABBREVIATIONS[combo.hookStyle] || 'unk';
  const captionAbbr = CAPTION_ABBREVIATIONS[combo.captionStyle] || 'unk';
  const brollAbbr = BROLL_ABBREVIATIONS[combo.bRollPattern] || 'unk';

  return `${prefix}_${avatarAbbr}_${hookAbbr}_${captionAbbr}_${brollAbbr}`;
}

/**
 * Generate human-readable variant name
 */
function generateVariantName(combo: Combination): string {
  const parts = [
    formatAxisValue(combo.avatarPosition),
    formatAxisValue(combo.hookStyle),
    formatAxisValue(combo.captionStyle),
    formatAxisValue(combo.bRollPattern),
  ];

  return parts.join(' + ');
}

/**
 * Format axis value for display
 */
function formatAxisValue(value: string): string {
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================
// Props Generation
// ============================================================

/**
 * Generate full props for a variant
 */
function generateProps(
  template: Template,
  combo: Combination
): Partial<TalkingHeadProps> {
  const defaultProps = template.defaultProps;

  return {
    // Media (from defaults/placeholders)
    lipSyncVideo: defaultProps.lipSyncVideo,
    backgroundVideos: defaultProps.backgroundVideos,
    backgroundMusic: defaultProps.backgroundMusic,
    musicVolume: defaultProps.musicVolume,

    // Variation axes
    avatarPosition: combo.avatarPosition,
    hookStyle: combo.hookStyle,
    captionStyle: combo.captionStyle,
    bRollPattern: combo.bRollPattern,

    // Avatar config
    circleSizePercent: defaultProps.circleSizePercent ?? 25,
    circleBottomPercent: defaultProps.circleBottomPercent ?? 15,
    circleLeftPx: defaultProps.circleLeftPx ?? 40,
    glassMorphism: defaultProps.glassMorphism ?? true,

    // Hook config
    hookText: defaultProps.hookText ?? '',
    hookDuration: defaultProps.hookDuration ?? 3,

    // B-roll config
    bRollDuration: defaultProps.bRollDuration ?? 4,
    bRollGapDuration: defaultProps.bRollGapDuration ?? 1.5,

    // Effects
    vignetteStrength: defaultProps.vignetteStrength ?? 0.7,
    filmGrainOpacity: defaultProps.filmGrainOpacity ?? 0.05,
    colorCorrection: defaultProps.colorCorrection ?? 1.2,

    // Captions (empty by default, filled from transcript)
    captions: defaultProps.captions ?? [],
    captionPosition: defaultProps.captionPosition ?? 'bottom',
    captionFontSize: defaultProps.captionFontSize ?? 48,
    captionFontColor: defaultProps.captionFontColor ?? '#ffffff',
    captionHighlightColor: defaultProps.captionHighlightColor ?? '#FFD700',
  };
}

// ============================================================
// Statistics Calculation
// ============================================================

/**
 * Calculate generation statistics
 */
function calculateStats(variants: TemplateVariant[]): GeneratorStats {
  if (variants.length === 0) {
    return {
      avgPriority: 0,
      maxPriority: 0,
      minPriority: 0,
      byAvatarPosition: {},
      byHookStyle: {},
      byCaptionStyle: {},
      byBRollPattern: {},
    };
  }

  const priorities = variants.map((v) => v.priority);

  // Distribution counters
  const byAvatarPosition: Record<string, number> = {};
  const byHookStyle: Record<string, number> = {};
  const byCaptionStyle: Record<string, number> = {};
  const byBRollPattern: Record<string, number> = {};

  for (const variant of variants) {
    byAvatarPosition[variant.axes.avatarPosition] =
      (byAvatarPosition[variant.axes.avatarPosition] ?? 0) + 1;
    byHookStyle[variant.axes.hookStyle] =
      (byHookStyle[variant.axes.hookStyle] ?? 0) + 1;
    byCaptionStyle[variant.axes.captionStyle] =
      (byCaptionStyle[variant.axes.captionStyle] ?? 0) + 1;
    byBRollPattern[variant.axes.bRollPattern] =
      (byBRollPattern[variant.axes.bRollPattern] ?? 0) + 1;
  }

  return {
    avgPriority: Math.round(
      priorities.reduce((a, b) => a + b, 0) / priorities.length
    ),
    maxPriority: Math.max(...priorities),
    minPriority: Math.min(...priorities),
    byAvatarPosition,
    byHookStyle,
    byCaptionStyle,
    byBRollPattern,
  };
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Get a specific variant by ID
 */
export function getVariantById(
  variants: TemplateVariant[],
  id: string
): TemplateVariant | undefined {
  return variants.find((v) => v.id === id);
}

/**
 * Filter variants by axis value
 */
export function filterByAxis(
  variants: TemplateVariant[],
  axis: 'avatarPosition' | 'hookStyle' | 'captionStyle' | 'bRollPattern',
  value: string
): TemplateVariant[] {
  return variants.filter((v) => v.axes[axis] === value);
}

/**
 * Get top N variants by priority
 */
export function getTopVariants(
  variants: TemplateVariant[],
  n: number
): TemplateVariant[] {
  return [...variants]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, n);
}

/**
 * Sample variants for A/B testing (weighted by priority)
 */
export function sampleVariants(
  variants: TemplateVariant[],
  count: number,
  seed?: number
): TemplateVariant[] {
  if (count >= variants.length) {
    return [...variants];
  }

  // Seeded random for reproducibility
  let currentSeed = seed ?? Date.now();
  const seededRandom = () => {
    currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
    return currentSeed / 0x7fffffff;
  };

  // Weighted selection based on priority
  const totalWeight = variants.reduce((sum, v) => sum + v.priority, 0);
  const selected: TemplateVariant[] = [];
  const remaining = [...variants];

  while (selected.length < count && remaining.length > 0) {
    const rand = seededRandom() * totalWeight;
    let cumulative = 0;

    for (let i = 0; i < remaining.length; i++) {
      cumulative += remaining[i].priority;
      if (rand <= cumulative) {
        selected.push(remaining[i]);
        remaining.splice(i, 1);
        break;
      }
    }
  }

  return selected;
}

/**
 * Estimate rendering cost for variants
 */
export function estimateRenderCost(
  variants: TemplateVariant[],
  durationSeconds: number = 30,
  fps: number = 30,
  costPerMinute: number = 0.02 // Lambda cost estimate
): {
  totalFrames: number;
  totalMinutes: number;
  estimatedCost: number;
} {
  const framesPerVariant = durationSeconds * fps;
  const totalFrames = variants.length * framesPerVariant;
  const totalMinutes = (totalFrames / fps) / 60;
  const estimatedCost = totalMinutes * costPerMinute;

  return {
    totalFrames,
    totalMinutes,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
  };
}

// ============================================================
// Exports
// ============================================================

export default generateVariations;
