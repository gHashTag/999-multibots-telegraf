/**
 * Vibe Reels Template Factory
 *
 * System for generating 100+ variations of talking head Instagram Reels
 * with configurable avatar positions, hooks, captions, and B-roll patterns.
 *
 * @example
 * ```ts
 * import { generateVariations, loadTemplate } from './factory';
 *
 * const template = loadTemplate('talking-head');
 * const result = generateVariations(template, { limit: 100 });
 * console.log(`Generated ${result.variants.length} variants`);
 * ```
 */

// Types
export * from './types';

// Schemas
export * from './schemas';

// Variation Generator
export {
  generateVariations,
  getVariantById,
  filterByAxis,
  getTopVariants,
  sampleVariants,
  estimateRenderCost,
  type GeneratorOptions,
  type GeneratorResult,
  type GeneratorStats,
} from './VariationGenerator';

// Factory Component
export {
  FactoryTalkingHead,
  FactoryTalkingHeadSchema,
  type FactoryTalkingHeadProps,
} from './TemplateFactory';

// Composable Parts
export * from './parts';

// Template loader
import talkingHeadTemplate from './templates/talking-head.json';
import type { TemplateDefinition } from './types';
import { validateTemplate } from './schemas';

/**
 * Available template IDs
 */
export const TEMPLATE_IDS = ['talking-head'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/**
 * Load a template by ID
 */
export function loadTemplate(id: TemplateId): TemplateDefinition {
  const templates: Record<TemplateId, unknown> = {
    'talking-head': talkingHeadTemplate,
  };

  const data = templates[id];
  if (!data) {
    throw new Error(`Template not found: ${id}`);
  }

  const result = validateTemplate(data);
  if (!result.success) {
    throw new Error(`Invalid template ${id}: ${result.error.message}`);
  }

  return result.data as TemplateDefinition;
}

/**
 * List all available templates
 */
export function listTemplates(): TemplateId[] {
  return [...TEMPLATE_IDS];
}

/**
 * Get template metadata without full validation
 */
export function getTemplateInfo(id: TemplateId): {
  id: string;
  name: string;
  description: string;
  version: string;
} {
  const templates: Record<TemplateId, typeof talkingHeadTemplate> = {
    'talking-head': talkingHeadTemplate,
  };

  const data = templates[id];
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    version: data.version,
  };
}
