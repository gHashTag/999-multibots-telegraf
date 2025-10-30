import { z } from 'zod'

/**
 * 🔥 Qwen Image Edit Zod Schema
 * Model: Alibaba Qwen-Image-Edit (via Replicate or direct API)
 * Features: SOTA image editing with bilingual text support
 */

// ✅ Input schema for Qwen Image Edit
export const QwenImageEditInputSchema = z.object({
  prompt: z.string()
    .min(1, 'Prompt cannot be empty')
    .max(1000, 'Prompt cannot exceed 1000 characters')
    .describe('Editing instruction in English or Chinese'),

  image: z.string()
    .url('Input image must be a valid URL')
    .describe('URL of the image to edit'),

  editing_mode: z.enum(['semantic', 'appearance', 'auto'])
    .optional()
    .default('auto')
    .describe('Editing mode: semantic (restructure), appearance (local), auto (detect)'),

  preserve_quality: z.boolean()
    .optional()
    .default(true)
    .describe('Preserve original image quality'),

  seed: z.number()
    .int()
    .optional()
    .describe('Random seed for reproducibility'),

  output_format: z.enum(['webp', 'jpg', 'png'])
    .optional()
    .default('png')
    .describe('Output image format'),
})

export type QwenImageEditInput = z.infer<typeof QwenImageEditInputSchema>

// ✅ Response schema for Qwen Image Edit
export const QwenImageEditResponseSchema = z.union([
  z.string().url(), // Single image URL
  z.array(z.string().url()), // Array of image URLs
])

export type QwenImageEditResponse = z.infer<typeof QwenImageEditResponseSchema>

// ✅ Configuration for Qwen Image Edit
export const QWEN_IMAGE_EDIT_CONFIG = {
  modelKey: 'qwen/qwen-image-edit', // Placeholder - будет уточнено при интеграции
  costUSD: 0.025, // Alibaba Cloud price: $0.045, but lower on some platforms
  maxPromptLength: 1000,
  supportsMultiImage: false, // Only single image input
  supportsBilingual: true, // Supports Chinese and English
  defaultMode: 'auto',
  supportedFormats: ['webp', 'jpg', 'png'] as const,
  modelSize: '20B', // 20 billion parameters
  license: 'Apache 2.0',
} as const

/**
 * Validate Qwen Image Edit input parameters
 */
export const validateQwenImageEditInput = (input: unknown): QwenImageEditInput => {
  return QwenImageEditInputSchema.parse(input)
}

/**
 * Validate Qwen Image Edit response
 */
export const validateQwenImageEditResponse = (output: unknown): QwenImageEditResponse => {
  return QwenImageEditResponseSchema.parse(output)
}

/**
 * Detect if prompt is in Chinese and adjust mode
 */
export const detectLanguageAndAdjustMode = (prompt: string): 'semantic' | 'appearance' | 'auto' => {
  // Check if prompt contains Chinese characters
  const hasChinese = /[\u4e00-\u9fa5]/.test(prompt)

  // Chinese prompts often benefit from semantic mode
  // English prompts work well with auto mode
  return hasChinese ? 'semantic' : 'auto'
}
