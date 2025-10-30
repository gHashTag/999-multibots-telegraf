import { z } from 'zod'

/**
 * SeeDream-4 (ByteDance) API Schema
 * Генерация изображений до 4K разрешения
 */

export const SeeDream4SizeSchema = z.enum(['1K', '2K', '4K', 'custom'])

export const SeeDream4InputSchema = z.object({
  prompt: z
    .string()
    .min(3, '🚨 Prompt must be at least 3 characters long')
    .max(2000, '🚨 Prompt too long (max 2000 characters)')
    .refine(
      (prompt) => prompt.trim().length > 0,
      '🚨 Prompt cannot be empty or whitespace'
    )
    .transform((prompt) => prompt.trim()), // Auto-trim whitespace
  size: SeeDream4SizeSchema.default('1K'),
  width: z.number().int().min(1024, '🚨 Width must be at least 1024px').max(4096, '🚨 Width cannot exceed 4096px').optional(),
  height: z.number().int().min(1024, '🚨 Height must be at least 1024px').max(4096, '🚨 Height cannot exceed 4096px').optional(),
  max_images: z.number().int().min(1, '🚨 Must generate at least 1 image').max(15, '🚨 Cannot generate more than 15 images').default(1),
  image_input: z.array(
    z.string().refine(
      (url) => {
        // Support HTTP/HTTPS URLs
        if (url.startsWith('http://') || url.startsWith('https://')) {
          try {
            new URL(url)
            return true
          } catch {
            return false
          }
        }
        // Support data URIs for images
        if (url.startsWith('data:image/')) {
          return true
        }
        return false
      },
      '🚨 Image URL must be valid HTTP/HTTPS URL or data URI'
    )
  ).min(1, '🚨 At least one image required').max(10, '🚨 Cannot process more than 10 images').optional(),
  aspect_ratio: z.string().regex(/^\d+:\d+$/, '🚨 Aspect ratio must be in format "width:height"').optional(),

  // 🛡️ USER VALIDATION FIELDS (internal use only)
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
}).refine((data) => {
  // Image input validation for multi-image scenarios
  if (data.image_input && data.image_input.length > 1 && data.max_images === 1) {
    return false // Multiple images provided but max_images is 1
  }
  return true
}, {
  message: "🚨 Multiple images provided but max_images is set to 1",
  path: ['max_images']
})

export const SeeDream4ResponseSchema = z.object({
  images: z.array(z.string().url()),
  metadata: z.object({
    prompt: z.string(),
    size: z.string(),
    dimensions: z.object({
      width: z.number(),
      height: z.number()
    }),
    generation_time: z.number().optional(),
    model_version: z.string().optional()
  })
})

export const SeeDream4ErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional()
})

// Type exports
export type SeeDream4Input = z.infer<typeof SeeDream4InputSchema>
export type SeeDream4Response = z.infer<typeof SeeDream4ResponseSchema>
export type SeeDream4Error = z.infer<typeof SeeDream4ErrorSchema>
export type SeeDream4Size = z.infer<typeof SeeDream4SizeSchema>

// Utility function to get dimensions by size
export function getSeeDream4Dimensions(size: SeeDream4Size): { width: number; height: number } {
  switch (size) {
    case '1K':
      return { width: 1024, height: 1536 } // 2:3 aspect ratio (portrait)
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

// 🎯 ENHANCED VALIDATOR WITH DETAILED LOGGING AND RECOVERY
export function validateSeeDream4Input(input: unknown) {
  try {
    const validated = SeeDream4InputSchema.parse(input)
    console.log('✅ [SeeDream4] Input validation successful:', {
      promptLength: validated.prompt.length,
      size: validated.size,
      hasImageInput: !!validated.image_input,
      imageInputCount: validated.image_input?.length || 0,
      telegram_id: validated.telegram_id || 'not_provided',
      max_images: validated.max_images,
      aspect_ratio: validated.aspect_ratio,
      dimensions: validated.width && validated.height ? `${validated.width}x${validated.height}` : 'auto'
    })
    return { success: true, data: validated }
  } catch (error) {
    const isZodError = error instanceof Error && error.name === 'ZodError'

    console.error('🚨 [SeeDream4] Input validation FAILED:', {
      error: error instanceof Error ? error.message : 'Unknown validation error',
      errorType: isZodError ? 'ZOD_VALIDATION' : 'GENERAL_ERROR',
      receivedData: typeof input === 'object' ?
        JSON.stringify(input, null, 2).slice(0, 300) + '...' :
        String(input),
      inputType: typeof input,
      hasPrompt: typeof input === 'object' && input !== null && 'prompt' in input,
      hasTelegramId: typeof input === 'object' && input !== null && 'telegram_id' in input
    })

    // ✅ AUTO-RECOVERY: Try to provide helpful suggestions
    if (isZodError && typeof input === 'object' && input !== null) {
      const inputObj = input as Record<string, any>
      const suggestions = []

      if (!inputObj.prompt || typeof inputObj.prompt !== 'string') {
        suggestions.push('Prompt is required and must be a string')
      }
      if (inputObj.prompt && inputObj.prompt.length < 3) {
        suggestions.push('Prompt must be at least 3 characters long')
      }
      if (inputObj.size === 'custom' && (!inputObj.width || !inputObj.height)) {
        suggestions.push('Width and height are required when size is "custom"')
      }
      if (inputObj.image_input && !Array.isArray(inputObj.image_input)) {
        suggestions.push('image_input must be an array of URLs')
      }

      console.warn('💡 [SeeDream4] Validation suggestions:', suggestions)
    }

    return { success: false, error, suggestions: isZodError ? 'Check validation requirements' : undefined }
  }
}

// Default configuration for avatar generation
export const SEEDREAM4_AVATAR_CONFIG: Partial<SeeDream4Input> = {
  size: '1K',
  max_images: 1,
  aspect_ratio: '9:16' // Vertical format for avatars
}