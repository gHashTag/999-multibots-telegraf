import { z } from 'zod'

// Qwen Image Edit Plus Input Schema
export const QwenImageEditPlusInputSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(1000, 'Prompt too long'),
  image: z.array(z.string().url()).min(1, 'At least one image is required').max(10, 'Maximum 10 images allowed'),
  seed: z.number().int().min(0).max(2147483647).optional(),
  aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21']).default('1:1'),
  output_format: z.enum(['webp', 'jpg', 'png']).default('webp'),
  output_quality: z.number().int().min(1).max(100).default(90),
  disable_safety_checker: z.boolean().default(false)
})

// Qwen Image Edit Plus Response Schema
export const QwenImageEditPlusResponseSchema = z.object({
  images: z.array(z.string().url()),
  metadata: z.object({
    prompt: z.string(),
    input_images_count: z.number(),
    aspect_ratio: z.string(),
    output_format: z.string(),
    seed: z.number().optional()
  })
})

// TypeScript types
export type QwenImageEditPlusInput = z.infer<typeof QwenImageEditPlusInputSchema>
export type QwenImageEditPlusResponse = z.infer<typeof QwenImageEditPlusResponseSchema>

// Configuration for Qwen Image Edit Plus
export const QWEN_IMAGE_EDIT_PLUS_CONFIG = {
  name: 'Qwen Image Edit Plus',
  description: 'Advanced multi-image editing with improved consistency and ControlNet support',
  maxImages: 10,
  supportsMultiImage: true,
  supportsTextOnly: false,
  requiresInputImage: true,
  supportedFormats: ['webp', 'jpg', 'png'] as const,
  supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'] as const
}

// Validation function
export function validateQwenImageEditPlusInput(input: any): { success: true; data: QwenImageEditPlusInput } | { success: false; error: string } {
  try {
    const validatedData = QwenImageEditPlusInputSchema.parse(input)
    return { success: true, data: validatedData }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0]
      return { success: false, error: `${firstError.path.join('.')}: ${firstError.message}` }
    }
    return { success: false, error: 'Invalid input format' }
  }
}

// Utility function to extract image URLs from Replicate response
export function extractImageUrlsFromQwenResponse(output: any): string[] {
  if (Array.isArray(output)) {
    return output.filter(url => typeof url === 'string' && url.startsWith('http'))
  }
  if (typeof output === 'string' && output.startsWith('http')) {
    return [output]
  }
  if (output && typeof output === 'object' && Array.isArray(output.images)) {
    return output.images.filter((url: any) => typeof url === 'string' && url.startsWith('http'))
  }
  return []
}