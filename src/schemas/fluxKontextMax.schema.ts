import { z } from 'zod'

/**
 * FLUX Kontext Max (Black Forest Labs) API Schema
 * Редактирование и трансформация изображений
 */

export const FluxKontextMaxAspectRatioSchema = z.enum(['1:1', '16:9', 'match_input_image'])

export const FluxKontextMaxOutputFormatSchema = z.enum(['png', 'jpg'])

export const FluxKontextMaxInputSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(1500, 'Prompt too long'),
  input_image: z.string().url().optional(),
  seed: z.number().int().min(0).max(2147483647).optional(),
  aspect_ratio: FluxKontextMaxAspectRatioSchema.default('1:1'),
  output_format: FluxKontextMaxOutputFormatSchema.default('png'),
  safety_tolerance: z.number().int().min(0).max(6).default(2),
}).refine((data) => {
  // If aspect_ratio is 'match_input_image', input_image is required
  if (data.aspect_ratio === 'match_input_image') {
    return data.input_image !== undefined
  }
  return true
}, {
  message: "Input image is required when aspect_ratio is 'match_input_image'",
  path: ['input_image']
})

export const FluxKontextMaxResponseSchema = z.object({
  image: z.string().url(),
  metadata: z.object({
    prompt: z.string(),
    seed: z.number(),
    aspect_ratio: z.string(),
    output_format: z.string(),
    safety_tolerance: z.number(),
    generation_time: z.number().optional(),
    model_version: z.string().optional(),
    dimensions: z.object({
      width: z.number(),
      height: z.number()
    }).optional()
  })
})

export const FluxKontextMaxErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional()
})

// Type exports
export type FluxKontextMaxInput = z.infer<typeof FluxKontextMaxInputSchema>
export type FluxKontextMaxResponse = z.infer<typeof FluxKontextMaxResponseSchema>
export type FluxKontextMaxError = z.infer<typeof FluxKontextMaxErrorSchema>
export type FluxKontextMaxAspectRatio = z.infer<typeof FluxKontextMaxAspectRatioSchema>
export type FluxKontextMaxOutputFormat = z.infer<typeof FluxKontextMaxOutputFormatSchema>

// Utility function to get dimensions by aspect ratio
export function getFluxKontextMaxDimensions(aspectRatio: FluxKontextMaxAspectRatio): { width: number; height: number } | null {
  switch (aspectRatio) {
    case '1:1':
      return { width: 1024, height: 1024 }
    case '16:9':
      return { width: 1920, height: 1080 }
    case 'match_input_image':
      return null // Dimensions match input image
    default:
      return { width: 1024, height: 1024 }
  }
}

// Default configuration for avatar transformation
export const FLUX_KONTEXT_MAX_AVATAR_CONFIG: Partial<FluxKontextMaxInput> = {
  aspect_ratio: 'match_input_image',
  output_format: 'png',
  safety_tolerance: 2
}

// Safety tolerance levels description
export const FLUX_SAFETY_LEVELS = {
  0: 'Most permissive',
  1: 'Low restrictions',
  2: 'Moderate restrictions (default)',
  3: 'High restrictions',
  4: 'Very high restrictions',
  5: 'Maximum restrictions',
  6: 'Extreme restrictions'
} as const