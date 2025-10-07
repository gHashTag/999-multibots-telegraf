import { z } from 'zod'

/**
 * 🎯 SeedEdit 3.0 Zod Schema
 * Model: bytedance/seededit-3.0
 * Features: 4K image editing with superior detail preservation
 */

// ✅ Input schema for SeedEdit 3.0
export const SeedEdit3InputSchema = z.object({
  prompt: z.string()
    .min(1, 'Prompt cannot be empty')
    .max(1000, 'Prompt cannot exceed 1000 characters'),

  input_image: z.string()
    .url('Input image must be a valid URL')
    .describe('URL of the image to edit'),

  output_resolution: z.enum(['1024', '2048', '4096'])
    .optional()
    .default('2048')
    .describe('Output image resolution (1K, 2K, or 4K)'),

  editing_strength: z.number()
    .min(0)
    .max(1)
    .optional()
    .default(0.7)
    .describe('Strength of editing effect (0-1)'),

  preserve_background: z.boolean()
    .optional()
    .default(true)
    .describe('Preserve non-edited areas'),

  seed: z.number()
    .int()
    .optional()
    .describe('Random seed for reproducibility'),

  output_format: z.enum(['webp', 'jpg', 'png'])
    .optional()
    .default('png')
    .describe('Output image format'),
})

export type SeedEdit3Input = z.infer<typeof SeedEdit3InputSchema>

// ✅ Response schema for SeedEdit 3.0
export const SeedEdit3ResponseSchema = z.union([
  z.string().url(), // Single image URL
  z.array(z.string().url()), // Array of image URLs
])

export type SeedEdit3Response = z.infer<typeof SeedEdit3ResponseSchema>

// ✅ Configuration for SeedEdit 3.0
export const SEEDEDIT3_CONFIG = {
  modelKey: 'bytedance/seededit-3.0',
  costUSD: 0.05, // Replicate price: $0.05 per image
  maxPromptLength: 1000,
  supportsMultiImage: false, // Only single image input
  supports4K: true, // Can generate 4K images
  defaultResolution: '2048',
  supportedFormats: ['webp', 'jpg', 'png'] as const,
  usabilityRate: 0.561, // 56.1% usability rate (industry leading)
} as const

/**
 * Validate SeedEdit 3.0 input parameters
 */
export const validateSeedEdit3Input = (input: unknown): SeedEdit3Input => {
  return SeedEdit3InputSchema.parse(input)
}

/**
 * Validate SeedEdit 3.0 response
 */
export const validateSeedEdit3Response = (output: unknown): SeedEdit3Response => {
  return SeedEdit3ResponseSchema.parse(output)
}

/**
 * Map quality setting to resolution
 */
export const mapQualityToResolution = (quality: '1K' | '2K' | '4K'): '1024' | '2048' | '4096' => {
  const mapping = {
    '1K': '1024',
    '2K': '2048',
    '4K': '4096',
  } as const
  return mapping[quality]
}
