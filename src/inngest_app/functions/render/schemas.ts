/**
 * Zod Schemas for Render Functions Runtime Validation
 *
 * Обеспечивает type-safe валидацию входных данных всех render функций
 */

import { z } from 'zod'
import { NonRetriableError } from 'inngest'

// ========================
// Base Schemas - matching template #1 format (3 coordinates for backwards compatibility)
// ========================

const CirclePositionSchema = z.tuple([z.number(), z.number(), z.number()])

const TextSettingsSchema = z.object({
  text: z.string(),
  position: z.tuple([z.number(), z.number()]), // Template #1 uses 2 coords [x, y]
  font_size: z.number(),
})

const AvatarSettingsSchema = z.object({
  avatar_speech: z.string().min(1, 'Avatar speech cannot be empty'),
  voice_id: z.string().optional(),
  avatar_photo_url: z.string().url().optional(), // For Hedra
  avatar_id: z.string().optional(), // For HeyGen
  api_key: z.string().min(10, 'Invalid API key'), // Hedra API key
})

// ========================
// Render Function Schema
// ========================

export const RenderEventDataSchema = z.object({
  job_id: z.string().min(1, 'job_id is required'),
  template_url: z.string().url('Invalid template URL'),
  job_json_url: z.string().url('Invalid job JSON URL'),
  composition_name: z.string().min(1, 'Composition name required'),
  render_type: z.enum(['create', 'update'], {
    errorMap: () => ({ message: 'render_type must be "create" or "update"' }),
  }),
  server_url: z.string().min(1, 'Server URL required'),
  server_port: z.number().int().min(1).max(65535, 'Invalid port number'),
  server_user: z.string().min(1, 'Server user required'),
  callback_url: z.string().url('Invalid callback URL').optional(),
})

export type ValidatedRenderEventData = z.infer<typeof RenderEventDataSchema>

// ========================
// Render Riddle Function Schema
// ========================

export const RenderRiddleEventDataSchema = z
  .object({
    job_id: z.string().min(1, 'job_id is required'),
    kie_api_key: z.string().min(10, 'Invalid KIE API key'),
    eleven_labs_api_key: z.string().min(10, 'Invalid ElevenLabs API key'),
    heygen_api_key: z.string().min(10, 'Invalid HeyGen API key').optional(),
    avatar_gen_service: z.enum(['hedra', 'heygen'], {
      errorMap: () => ({
        message: 'avatar_gen_service must be "hedra" or "heygen"',
      }),
    }),
    avatar_settings: AvatarSettingsSchema,
    cover_url: z.string().url('Invalid cover URL'),
    intro_text_1: TextSettingsSchema,
    intro_text_2: TextSettingsSchema,
    upper_intro_text: z.union([z.string(), TextSettingsSchema]).optional(), // Accept string OR object for backwards compatibility
    circle_position: CirclePositionSchema,
    circle_scale: CirclePositionSchema,
    callback_url: z.string().url('Invalid callback URL').optional(),
  })
  .refine(
    data => {
      // Hedra требует avatar_photo_url и api_key в settings
      if (data.avatar_gen_service === 'hedra') {
        return (
          data.avatar_settings.avatar_photo_url !== undefined &&
          data.avatar_settings.api_key !== undefined
        )
      }
      // HeyGen требует heygen_api_key на верхнем уровне
      if (data.avatar_gen_service === 'heygen') {
        return data.heygen_api_key !== undefined
      }
      return true
    },
    {
      message:
        'Hedra requires avatar_settings.avatar_photo_url and avatar_settings.api_key; HeyGen requires heygen_api_key',
    }
  )

export type ValidatedRenderRiddleEventData = z.infer<
  typeof RenderRiddleEventDataSchema
>

// ========================
// Render Avatar Video Function Schema
// ========================

export const RenderAvatarVideoEventDataSchema = z
  .object({
    job_id: z.string().min(1, 'job_id is required').optional(),
    user_id: z.string().min(1, 'User ID required'),
    avatar_text: z.string().min(1, 'Avatar text cannot be empty'),
    avatar_gen_service: z.enum(['hedra', 'heygen'], {
      errorMap: () => ({
        message: 'avatar_gen_service must be "hedra" or "heygen"',
      }),
    }),
    avatar_settings: AvatarSettingsSchema,
    kie_api_key: z.string().min(10, 'Invalid KIE API key').optional(),
    voice_id: z.string().optional(),
    eleven_labs_api_key: z
      .string()
      .min(10, 'Invalid ElevenLabs API key')
      .optional(),
    hedra_api_key: z.string().min(10, 'Invalid Hedra API key').optional(),
    heygen_api_key: z.string().min(10, 'Invalid HeyGen API key').optional(),
    avatar_id: z.string().optional(), // For HeyGen
    avatar_photo_url: z.string().url('Invalid avatar photo URL').optional(), // For Hedra
  })
  .refine(
    data => {
      // Hedra требует avatar_photo_url, voice_id, eleven_labs_api_key, hedra_api_key
      if (data.avatar_gen_service === 'hedra') {
        return (
          data.avatar_photo_url !== undefined &&
          data.voice_id !== undefined &&
          data.eleven_labs_api_key !== undefined &&
          data.hedra_api_key !== undefined
        )
      }
      // HeyGen требует avatar_id, voice_id, heygen_api_key
      if (data.avatar_gen_service === 'heygen') {
        return (
          data.avatar_id !== undefined &&
          data.voice_id !== undefined &&
          data.heygen_api_key !== undefined
        )
      }
      return true
    },
    {
      message:
        'Hedra requires: avatar_photo_url, voice_id, eleven_labs_api_key, hedra_api_key; HeyGen requires: avatar_id, voice_id, heygen_api_key',
    }
  )

export type ValidatedRenderAvatarVideoEventData = z.infer<
  typeof RenderAvatarVideoEventDataSchema
>

// ========================
// Validation Helper Functions
// ========================

/**
 * Validates render event data with detailed error messages
 */
export function validateRenderEventData(
  data: unknown
): ValidatedRenderEventData {
  const result = RenderEventDataSchema.safeParse(data)

  if (!result.success) {
    const errors = result.error.errors.map(
      err => `${err.path.join('.')}: ${err.message}`
    )
    // Schema failures never heal on retry — terminal.
    throw new NonRetriableError(`Render event validation failed:\n${errors.join('\n')}`)
  }

  return result.data
}

/**
 * Validates render-riddle event data with detailed error messages
 */
export function validateRenderRiddleEventData(
  data: unknown
): ValidatedRenderRiddleEventData {
  const result = RenderRiddleEventDataSchema.safeParse(data)

  if (!result.success) {
    const errors = result.error.errors.map(
      err => `${err.path.join('.')}: ${err.message}`
    )
    // Schema failures never heal on retry — terminal.
    throw new NonRetriableError(
      `Render-riddle event validation failed:\n${errors.join('\n')}`
    )
  }

  return result.data
}

/**
 * Validates render-avatar-video event data with detailed error messages
 */
export function validateRenderAvatarVideoEventData(
  data: unknown
): ValidatedRenderAvatarVideoEventData {
  const result = RenderAvatarVideoEventDataSchema.safeParse(data)

  if (!result.success) {
    const errors = result.error.errors.map(
      err => `${err.path.join('.')}: ${err.message}`
    )
    // Schema failures never heal on retry — terminal.
    throw new NonRetriableError(
      `Render-avatar-video event validation failed:\n${errors.join('\n')}`
    )
  }

  return result.data
}
