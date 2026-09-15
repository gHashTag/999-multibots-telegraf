import { z } from 'zod'

/**
 * Nano Banana (Google) API Schema via Replicate
 * Редактирование изображений с помощью Gemini 2.5
 */

export const NanoBananaOutputFormatSchema = z.enum(['jpg', 'png'])

/**
 * Read from Replicate's schema for `google/nano-banana` on 2026-09-15:
 * GET https://api.replicate.com/v1/models/google/nano-banana. The service
 * never sent this field at all, so every image came back at the model's own
 * default, `match_input_image` -- the square shape of a Telegram avatar.
 */
export const NanoBananaAspectRatioSchema = z.enum([
  'match_input_image',
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
])

export const NanoBananaInputSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(1000, 'Prompt too long'),
  image_input: z
    .array(z.string().url())
    .min(1, 'At least one input image is required')
    .max(10, 'Maximum 10 images allowed'),
  output_format: NanoBananaOutputFormatSchema.default('png'),
  aspect_ratio: NanoBananaAspectRatioSchema.default('9:16'),
})

export const NanoBananaResponseSchema = z.object({
  image: z.string().url(),
  metadata: z.object({
    prompt: z.string(),
    input_images_count: z.number(),
    output_format: z.string(),
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

export const NanoBananaErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
})

// Replicate-specific response schema (what we actually get from Replicate)
export const ReplicateNanoBananaResponseSchema = z.union([
  z.string().url(), // Direct URL string
  z.array(z.string().url()), // Array of URLs
  z.object({
    url: z.function().returns(z.string().url()),
  }), // Object with url() method
  z.object({
    output: z.string().url(),
  }), // Object with output property
  z.object({
    prediction: z.string().url(),
  }), // Object with prediction property
])

// Type exports
export type NanoBananaInput = z.infer<typeof NanoBananaInputSchema>
export type NanoBananaResponse = z.infer<typeof NanoBananaResponseSchema>
export type NanoBananaError = z.infer<typeof NanoBananaErrorSchema>
export type NanoBananaAspectRatio = z.infer<typeof NanoBananaAspectRatioSchema>
export type NanoBananaOutputFormat = z.infer<
  typeof NanoBananaOutputFormatSchema
>
export type ReplicateNanoBananaResponse = z.infer<
  typeof ReplicateNanoBananaResponseSchema
>

// Default configuration for avatar transformation
export const NANO_BANANA_AVATAR_CONFIG: Partial<NanoBananaInput> = {
  output_format: 'png',
}

// Utility function to extract image URL from Replicate response
export function extractImageUrlFromReplicateResponse(
  output: unknown
): string | null {
  try {
    // Validate the response structure
    const validatedOutput = ReplicateNanoBananaResponseSchema.parse(output)

    if (typeof validatedOutput === 'string') {
      return validatedOutput
    }

    if (Array.isArray(validatedOutput) && validatedOutput.length > 0) {
      return validatedOutput[0]
    }

    if (typeof validatedOutput === 'object' && validatedOutput !== null) {
      // Check for url() method
      if (
        'url' in validatedOutput &&
        typeof validatedOutput.url === 'function'
      ) {
        return validatedOutput.url()
      }

      // Check for output property
      if (
        'output' in validatedOutput &&
        typeof validatedOutput.output === 'string'
      ) {
        return validatedOutput.output
      }

      // Check for prediction property
      if (
        'prediction' in validatedOutput &&
        typeof validatedOutput.prediction === 'string'
      ) {
        return validatedOutput.prediction
      }
    }

    return null
  } catch (error) {
    console.error('Failed to extract image URL from Replicate response:', error)
    return null
  }
}

// Enhanced prompt templates for better avatar generation
export const NANO_BANANA_PROMPT_TEMPLATES = {
  headshot: (originalPrompt: string) =>
    `CLOSE-UP HEADSHOT PORTRAIT: ${originalPrompt}. MUST BE: 9:16 vertical aspect ratio, tight framing focused on face and upper chest only, professional headshot composition, sharp facial details, Instagram/Telegram profile picture style. NO full body shots. FOCUS: Face takes up 60-80% of the frame.`,

  fullBody: (originalPrompt: string) =>
    `FULL BODY PORTRAIT: ${originalPrompt}. MUST BE: Complete figure visible from head to feet, professional photography style, good composition and lighting.`,

  artistic: (originalPrompt: string) =>
    `ARTISTIC TRANSFORMATION: ${originalPrompt}. Creative and stylized interpretation while maintaining recognizable features.`,
}
