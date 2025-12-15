import { z } from 'zod'

/**
 * SeeDream-4.5 (ByteDance) API Schema
 * Upgraded model with stronger spatial understanding and world knowledge
 * Note: 1K resolution is NOT supported in Seedream 4.5
 */

// SeeDream 4.5 only supports 2K and 4K (NOT 1K)
export const SeeDream45SizeSchema = z.enum(['2K', '4K', 'custom'])

// Sequential image generation mode
export const SequentialImageGenerationSchema = z.enum(['disabled', 'auto'])

export const SeeDream45InputSchema = z.object({
  prompt: z
    .string()
    .min(3, '🚨 Prompt must be at least 3 characters long')
    .max(2000, '🚨 Prompt too long (max 2000 characters)')
    .refine(
      (prompt) => prompt.trim().length > 0,
      '🚨 Prompt cannot be empty or whitespace'
    )
    .transform((prompt) => prompt.trim()),

  // SeeDream 4.5: 2K (2048px), 4K (4096px), or 'custom' - NO 1K support!
  size: SeeDream45SizeSchema.default('2K'),

  // Aspect ratio (used when size is not 'custom')
  // Use 'match_input_image' to automatically match input image's aspect ratio
  aspect_ratio: z.string().optional(),

  // Custom dimensions (only when size='custom')
  // Range: 1024-4096 pixels
  width: z.number().int().min(1024, '🚨 Width must be at least 1024px').max(4096, '🚨 Width cannot exceed 4096px').optional(),
  height: z.number().int().min(1024, '🚨 Height must be at least 1024px').max(4096, '🚨 Height cannot exceed 4096px').optional(),

  // Sequential image generation (new in 4.5)
  // 'disabled' generates a single image
  // 'auto' lets model decide whether to generate multiple related images
  sequential_image_generation: SequentialImageGenerationSchema.default('disabled'),

  // Max images when sequential_image_generation='auto' (1-15)
  // Total images (input + generated) cannot exceed 15
  max_images: z.number().int().min(1, '🚨 Must generate at least 1 image').max(15, '🚨 Cannot generate more than 15 images').default(1),

  // Input images for image-to-image generation (1-14 images)
  image_input: z.array(
    z.string().refine(
      (url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          try {
            new URL(url)
            return true
          } catch {
            return false
          }
        }
        if (url.startsWith('data:image/')) {
          return true
        }
        return false
      },
      '🚨 Image URL must be valid HTTP/HTTPS URL or data URI'
    )
  ).min(1, '🚨 At least one image required').max(14, '🚨 Cannot process more than 14 images').optional(),

  // Internal fields
  telegram_id: z
    .string()
    .min(1, '🚨 Telegram ID required')
    .refine((id) => /^\d+$/.test(id), '🚨 Invalid Telegram ID format - must be numeric')
    .optional(),
  username: z.string().max(100, '🚨 Username too long').optional(),
  is_ru: z.boolean().optional(),
}).strict().refine((data) => {
  // Custom size validation
  if (data.size === 'custom') {
    return data.width !== undefined && data.height !== undefined
  }
  return true
}, {
  message: "🚨 Width and height are required when size is 'custom'",
  path: ['width', 'height']
})

export const SeeDream45ResponseSchema = z.object({
  images: z.array(z.string().url()),
  metadata: z.object({
    prompt: z.string(),
    size: z.string(),
    dimensions: z.object({
      width: z.number(),
      height: z.number()
    }),
    generation_time: z.number().optional(),
    model_version: z.string().optional(),
    sequential_mode: z.string().optional()
  })
})

export const SeeDream45ErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional()
})

// Type exports
export type SeeDream45Input = z.infer<typeof SeeDream45InputSchema>
export type SeeDream45Response = z.infer<typeof SeeDream45ResponseSchema>
export type SeeDream45Error = z.infer<typeof SeeDream45ErrorSchema>
export type SeeDream45Size = z.infer<typeof SeeDream45SizeSchema>
export type SequentialImageGeneration = z.infer<typeof SequentialImageGenerationSchema>

// Utility function to get dimensions by size (SeeDream 4.5)
export function getSeeDream45Dimensions(size: SeeDream45Size): { width: number; height: number } {
  switch (size) {
    case '2K':
      return { width: 1365, height: 2048 } // 2:3 aspect ratio (portrait)
    case '4K':
      return { width: 2731, height: 4096 } // 2:3 aspect ratio (portrait)
    case 'custom':
      throw new Error('Custom size requires explicit width and height')
    default:
      return { width: 1365, height: 2048 }
  }
}

// Validator with detailed logging
export function validateSeeDream45Input(input: unknown) {
  try {
    const validated = SeeDream45InputSchema.parse(input)
    console.log('✅ [SeeDream4.5] Input validation successful:', {
      promptLength: validated.prompt.length,
      size: validated.size,
      hasImageInput: !!validated.image_input,
      imageInputCount: validated.image_input?.length || 0,
      telegram_id: validated.telegram_id || 'not_provided',
      max_images: validated.max_images,
      sequential_mode: validated.sequential_image_generation,
      aspect_ratio: validated.aspect_ratio,
      dimensions: validated.width && validated.height ? `${validated.width}x${validated.height}` : 'auto'
    })
    return { success: true, data: validated }
  } catch (error) {
    const isZodError = error instanceof Error && error.name === 'ZodError'

    console.error('🚨 [SeeDream4.5] Input validation FAILED:', {
      error: error instanceof Error ? error.message : 'Unknown validation error',
      errorType: isZodError ? 'ZOD_VALIDATION' : 'GENERAL_ERROR',
      receivedData: typeof input === 'object' ?
        JSON.stringify(input, null, 2).slice(0, 300) + '...' :
        String(input),
    })

    if (isZodError && typeof input === 'object' && input !== null) {
      const inputObj = input as Record<string, any>
      const suggestions = []

      if (!inputObj.prompt || typeof inputObj.prompt !== 'string') {
        suggestions.push('Prompt is required and must be a string')
      }
      if (inputObj.size === '1K') {
        suggestions.push('SeeDream 4.5 does NOT support 1K resolution - use 2K or 4K')
      }
      if (inputObj.size === 'custom' && (!inputObj.width || !inputObj.height)) {
        suggestions.push('Width and height are required when size is "custom"')
      }

      console.warn('💡 [SeeDream4.5] Validation suggestions:', suggestions)
    }

    return { success: false, error, suggestions: isZodError ? 'Check validation requirements' : undefined }
  }
}

// Default configuration for SeeDream 4.5
export const SEEDREAM45_DEFAULT_CONFIG: Partial<SeeDream45Input> = {
  size: '2K',
  max_images: 1,
  sequential_image_generation: 'disabled',
  aspect_ratio: '9:16' // Vertical format
}
