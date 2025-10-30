import { z } from 'zod'

/**
 * 🎨 FLUX Kontext Pro Zod Schema
 * Model: black-forest-labs/flux-kontext-pro
 * Features: Fast single-image editing with context preservation
 */

// ✅ Input schema for FLUX Kontext Pro
export const FluxKontextProInputSchema = z.object({
  prompt: z.string()
    .min(1, 'Prompt cannot be empty')
    .max(1000, 'Prompt cannot exceed 1000 characters'),

  input_image: z.string()
    .url('Input image must be a valid URL')
    .describe('URL of the image to edit'),

  aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'])
    .optional()
    .default('9:16')
    .describe('Output image aspect ratio'),

  seed: z.number()
    .int()
    .optional()
    .describe('Random seed for reproducibility'),

  output_format: z.enum(['webp', 'jpg', 'png'])
    .optional()
    .default('png')
    .describe('Output image format'),

  output_quality: z.number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(80)
    .describe('Quality of output image (1-100)'),
})

export type FluxKontextProInput = z.infer<typeof FluxKontextProInputSchema>

// ✅ Response schema for FLUX Kontext Pro
export const FluxKontextProResponseSchema = z.union([
  z.string().url(), // Single image URL
  z.array(z.string().url()), // Array of image URLs
])

export type FluxKontextProResponse = z.infer<typeof FluxKontextProResponseSchema>

// ✅ Configuration for FLUX Kontext Pro
export const FLUX_KONTEXT_PRO_CONFIG = {
  modelKey: 'black-forest-labs/flux-kontext-pro',
  costUSD: 0.05, // Replicate price: $0.05 per image
  maxPromptLength: 1000,
  supportsMultiImage: false, // Only single image input
  defaultAspectRatio: '9:16',
  supportedFormats: ['webp', 'jpg', 'png'] as const,
} as const

/**
 * Validate FLUX Kontext Pro input parameters
 */
export const validateFluxKontextProInput = (input: unknown): FluxKontextProInput => {
  return FluxKontextProInputSchema.parse(input)
}

/**
 * Validate FLUX Kontext Pro response
 */
export const validateFluxKontextProResponse = (output: unknown): FluxKontextProResponse => {
  return FluxKontextProResponseSchema.parse(output)
}
