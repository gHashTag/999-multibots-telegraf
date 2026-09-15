import { z } from 'zod'

/**
 * FLUX Kontext Max (Black Forest Labs) API Schema
 * Редактирование и трансформация изображений
 */

/**
 * WHAT THE MODEL ACTUALLY ACCEPTS.
 *
 * This enum used to hold three values. Replicate's own schema for
 * `black-forest-labs/flux-kontext-max` holds fourteen -- read from
 * GET https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-max
 * on 2026-09-15, reproduced verbatim below. `9:16` was never missing at the
 * provider; it was missing here, and the gap was papered over downstream by
 * mapping a request for portrait onto `match_input_image` (see
 * mapToFluxAspectRatio in generateFluxKontextMax.ts). A Telegram profile
 * photo is SQUARE, so "preserve the input's proportions" delivered 1:1 to
 * every person who had asked for 9:16.
 */
export const FluxKontextMaxAspectRatioSchema = z.enum([
  'match_input_image',
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '4:5',
  '5:4',
  '21:9',
  '9:21',
  '2:1',
  '1:2',
])

export const FluxKontextMaxOutputFormatSchema = z.enum(['png', 'jpg'])

export const FluxKontextMaxInputSchema = z
  .object({
    prompt: z
      .string()
      .min(1, 'Prompt is required')
      .max(1500, 'Prompt too long'),
    input_image: z.string().url().optional(),
    seed: z.number().int().min(0).max(2147483647).optional(),
    aspect_ratio: FluxKontextMaxAspectRatioSchema.default('9:16'),
    output_format: FluxKontextMaxOutputFormatSchema.default('png'),
    safety_tolerance: z.number().int().min(0).max(6).default(2),
  })
  .refine(
    data => {
      // If aspect_ratio is 'match_input_image', input_image is required
      if (data.aspect_ratio === 'match_input_image') {
        return data.input_image !== undefined
      }
      return true
    },
    {
      message:
        "Input image is required when aspect_ratio is 'match_input_image'",
      path: ['input_image'],
    }
  )

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
    dimensions: z
      .object({
        width: z.number(),
        height: z.number(),
      })
      .optional(),
  }),
})

export const FluxKontextMaxErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
})

// Type exports
export type FluxKontextMaxInput = z.infer<typeof FluxKontextMaxInputSchema>
export type FluxKontextMaxResponse = z.infer<
  typeof FluxKontextMaxResponseSchema
>
export type FluxKontextMaxError = z.infer<typeof FluxKontextMaxErrorSchema>
export type FluxKontextMaxAspectRatio = z.infer<
  typeof FluxKontextMaxAspectRatioSchema
>
export type FluxKontextMaxOutputFormat = z.infer<
  typeof FluxKontextMaxOutputFormatSchema
>

// Utility function to get dimensions by aspect ratio
/**
 * Reported dimensions for a ratio. Derived, not tabulated: the switch here
 * listed two ratios and answered 1024x1024 for everything else, so widening
 * the enum above would have made it report a square for 9:16, 4:3 and the
 * nine others -- and this value is written into the response metadata the
 * rest of the code reads.
 *
 * ~1MP at the requested shape, rounded to a multiple of 16 the way image
 * models like it. 1:1 stays 1024x1024 and 16:9 stays 1920x1080, exactly as
 * before, so nothing that already worked moves.
 */
export function getFluxKontextMaxDimensions(
  aspectRatio: FluxKontextMaxAspectRatio
): { width: number; height: number } | null {
  if (aspectRatio === 'match_input_image') return null // matches the input
  if (aspectRatio === '1:1') return { width: 1024, height: 1024 }
  if (aspectRatio === '16:9') return { width: 1920, height: 1080 }

  const [w, h] = aspectRatio.split(':').map(Number)
  if (!w || !h) return { width: 1024, height: 1024 }
  const scale = Math.sqrt((1024 * 1024) / (w * h))
  const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16)
  return { width: round16(w * scale), height: round16(h * scale) }
}

// Default configuration for avatar transformation
// Portrait by default: a Telegram avatar is square, and
// `match_input_image` handed a square to everyone who asked for 9:16.
export const FLUX_KONTEXT_MAX_AVATAR_CONFIG: Partial<FluxKontextMaxInput> = {
  aspect_ratio: '9:16',
  output_format: 'png',
  safety_tolerance: 2,
}

// Safety tolerance levels description
export const FLUX_SAFETY_LEVELS = {
  0: 'Most permissive',
  1: 'Low restrictions',
  2: 'Moderate restrictions (default)',
  3: 'High restrictions',
  4: 'Very high restrictions',
  5: 'Maximum restrictions',
  6: 'Extreme restrictions',
} as const
