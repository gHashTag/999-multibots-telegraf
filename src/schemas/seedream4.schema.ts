import { z } from 'zod'

/**
 * SeeDream-4 (ByteDance) API Schema
 * Генерация изображений до 4K разрешения
 */

export const SeeDream4SizeSchema = z.enum(['1K', '2K', '4K', 'custom'])

export const SeeDream4InputSchema = z.object({
  prompt: z
    .string()
    .min(10, '🚨 Prompt must be at least 10 characters long')
    .max(2000, '🚨 Prompt too long')
    .refine(
      (prompt) => prompt.trim().length > 0,
      '🚨 Prompt cannot be empty or whitespace'
    ),
  size: SeeDream4SizeSchema.default('1K'),
  width: z.number().int().min(1024, '🚨 Width must be at least 1024px').max(4096, '🚨 Width cannot exceed 4096px').optional(),
  height: z.number().int().min(1024, '🚨 Height must be at least 1024px').max(4096, '🚨 Height cannot exceed 4096px').optional(),
  max_images: z.number().int().min(1, '🚨 Must generate at least 1 image').max(15, '🚨 Cannot generate more than 15 images').default(1),
  image_input: z.array(z.string().url('🚨 Invalid image URL')).min(1).max(10, '🚨 Cannot process more than 10 images').optional(),
  aspect_ratio: z.string().optional(),
  
  // 🛡️ USER VALIDATION FIELDS (не отправляются в API, но нужны для нашей системы)
  telegram_id: z
    .string()
    .min(1, '🚨 Telegram ID required')
    .refine((id) => /^\d+$/.test(id), '🚨 Invalid Telegram ID format')
    .optional(),
  username: z.string().optional(),
  is_ru: z.boolean().optional(),
}).strict().refine((data) => {
  // If size is 'custom', width and height are required
  if (data.size === 'custom') {
    return data.width !== undefined && data.height !== undefined
  }
  return true
}, {
  message: "🚨 Width and height are required when size is 'custom'",
  path: ['width', 'height']
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
      return { width: 1024, height: 1024 }
    case '2K':
      return { width: 2048, height: 2048 }
    case '4K':
      return { width: 4096, height: 4096 }
    case 'custom':
      throw new Error('Custom size requires explicit width and height')
    default:
      return { width: 2048, height: 2048 }
  }
}

// 🎯 СТРОГИЙ ВАЛИДАТОР С ЛОГИРОВАНИЕМ
export function validateSeeDream4Input(input: unknown) {
  try {
    const validated = SeeDream4InputSchema.parse(input)
    console.log('✅ [SeeDream4] Input validation successful:', {
      promptLength: validated.prompt.length,
      size: validated.size,
      hasImageInput: !!validated.image_input,
      telegram_id: validated.telegram_id || 'not_provided',
      max_images: validated.max_images
    })
    return { success: true, data: validated }
  } catch (error) {
    console.error('🚨 [SeeDream4] Input validation FAILED:', {
      error: error instanceof Error ? error.message : 'Unknown validation error',
      receivedData: typeof input === 'object' ? JSON.stringify(input).slice(0, 200) : String(input)
    })
    return { success: false, error }
  }
}

// Default configuration for avatar generation
export const SEEDREAM4_AVATAR_CONFIG: Partial<SeeDream4Input> = {
  size: '1K',
  max_images: 1,
  aspect_ratio: '9:16' // Vertical format for avatars
}