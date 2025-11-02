/**
 * Common Validators for Inngest Functions
 * Centralized Zod schemas and validation helpers
 */

import { z } from 'zod'

// ===== COMMON VALIDATION SCHEMAS =====

/**
 * Base schema for all Inngest events
 */
export const baseEventSchema = z.object({
  telegramId: z.string().min(1, 'Telegram ID is required'),
  timestamp: z.string().datetime().optional(),
})

/**
 * Schema for user-related events
 */
export const userEventSchema = baseEventSchema.extend({
  userId: z.string().min(1, 'User ID is required'),
  username: z.string().optional(),
  firstName: z.string().optional(),
})

/**
 * Schema for file/image related events
 */
export const fileEventSchema = baseEventSchema.extend({
  fileUrl: z.string().url('Valid file URL is required'),
  fileType: z.enum(['image', 'video', 'audio', 'document']).optional(),
  fileSize: z.number().positive().optional(),
})

/**
 * Schema for API response events
 */
export const apiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  processingTime: z.number().positive().optional(),
})

// ===== CONTENT VALIDATORS =====

/**
 * Schema for content generation events
 */
export const contentGenerationSchema = z.object({
  ...baseEventSchema.shape,
  prompt: z.string().min(1, 'Prompt is required'),
  style: z.string().optional(),
  language: z.string().default('ru'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
})

/**
 * Schema for Instagram-related events
 */
export const instagramEventSchema = baseEventSchema.extend({
  reelId: z.string().min(1, 'Reel ID is required'),
  reelUrl: z.string().url('Valid reel URL is required'),
  projectId: z.number().int().positive('Project ID must be positive'),
})

// ===== RENDER VALIDATORS =====

/**
 * Schema for render events
 */
export const renderEventSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  templateUrl: z.string().url('Valid template URL is required'),
  compositionName: z.string().min(1, 'Composition name is required'),
  renderType: z.enum(['create', 'update']).default('create'),
  serverUrl: z.string().min(1, 'Server URL is required'),
  serverPort: z.number().int().positive('Server port must be positive'),
  serverUser: z.string().min(1, 'Server user is required'),
  callbackUrl: z.string().url().optional(),
})

// ===== PAYMENT VALIDATORS =====

/**
 * Schema for payment events
 */
export const paymentEventSchema = baseEventSchema.extend({
  paymentId: z.string().min(1, 'Payment ID is required'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('RUB'),
  paymentMethod: z.enum(['card', 'sbp', 'bank']).optional(),
  metadata: z.record(z.unknown()).optional(),
})

// ===== MONITORING VALIDATORS =====

/**
 * Schema for monitoring events
 */
export const monitoringEventSchema = baseEventSchema.extend({
  error: z.string().min(1, 'Error message is required'),
  stack: z.string().optional(),
  endpoint: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  context: z.record(z.unknown()).optional(),
})

// ===== TRAINING VALIDATORS =====

/**
 * Schema for model training events
 */
export const trainingEventSchema = baseEventSchema.extend({
  modelId: z.string().min(1, 'Model ID is required'),
  trainingType: z.enum(['image', 'video', 'text']).default('image'),
  epochs: z.number().int().positive('Epochs must be positive').default(10),
  learningRate: z.number().positive('Learning rate must be positive').default(0.001),
})

// ===== VALIDATION HELPERS =====

/**
 * Helper to validate event data with custom error handling
 */
export function validateEventData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T {
  try {
    return schema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      throw new Error(`Validation failed for ${context}: ${errorMessages}`)
    }
    throw error
  }
}

/**
 * Helper to validate and extract common event fields
 */
export function validateBaseEvent(eventData: unknown) {
  return validateEventData(baseEventSchema, eventData, 'base event')
}

/**
 * Helper to validate user event
 */
export function validateUserEvent(eventData: unknown) {
  return validateEventData(userEventSchema, eventData, 'user event')
}

/**
 * Helper to validate file event
 */
export function validateFileEvent(eventData: unknown) {
  return validateEventData(fileEventSchema, eventData, 'file event')
}

// ===== TYPE GUARDS =====

/**
 * Type guard to check if event has base fields
 */
export function hasBaseEventFields(obj: any): obj is z.infer<typeof baseEventSchema> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.telegramId === 'string' &&
    obj.telegramId.length > 0
  )
}

/**
 * Type guard to check if event is a user event
 */
export function isUserEvent(obj: any): obj is z.infer<typeof userEventSchema> {
  return hasBaseEventFields(obj) && typeof obj.userId === 'string' && obj.userId.length > 0
}

/**
 * Type guard to check if event is a file event
 */
export function isFileEvent(obj: any): obj is z.infer<typeof fileEventSchema> {
  return hasBaseEventFields(obj) && typeof obj.fileUrl === 'string' && obj.fileUrl.startsWith('http')
}
