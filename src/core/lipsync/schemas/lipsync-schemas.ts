import { z } from 'zod'

/**
 * Базовые Zod схемы для валидации lip-sync параметров
 * Обеспечивают типобезопасность и валидацию данных на входе
 */

// Общие типы провайдеров
export const LipSyncProviderSchema = z.enum(['replicate', 'sync', 'kie'])

// Базовые входные параметры для всех моделей
export const BaseLipSyncInputSchema = z.object({
  videoUrl: z.string().url('Video URL must be a valid URL'),
  audioUrl: z.string().url('Audio URL must be a valid URL'),
  telegramId: z.string().min(1, 'Telegram ID is required'),
  botName: z.string().optional().default('unknown_bot'),
})

// Специфичные параметры для Kling модели (Replicate)
export const KlingLipSyncInputSchema = BaseLipSyncInputSchema.extend({
  provider: z.literal('replicate'),
  modelId: z.literal('kwaivgi/kling-lip-sync'),
  parameters: z
    .object({
      saveOutput: z.boolean().optional().default(true),
      webhookUrl: z.string().url().optional(),
    })
    .optional(),
})

// Специфичные параметры для Sync LipSync-2 модели
export const SyncLipSyncInputSchema = BaseLipSyncInputSchema.extend({
  provider: z.literal('sync'),
  modelId: z.literal('sync/lipsync-2'),
  parameters: z
    .object({
      occlusion_detection_enabled: z.boolean().optional().default(false),
      face_padding_top: z.number().int().min(0).max(100).optional().default(0),
      face_padding_bottom: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .default(10),
      face_padding_left: z.number().int().min(0).max(100).optional().default(0),
      face_padding_right: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .default(0),
      preserve_identity: z.boolean().optional().default(true),
      enhance_quality: z.boolean().optional().default(true),
    })
    .optional(),
})

// Специфичные параметры для Veed Fabric модели (Kie.ai)
export const VeedFabricInputSchema = z.object({
  provider: z.literal('kie'),
  modelId: z.literal('veed-fabric'),
  imageUrl: z.string().url('Image URL must be a valid URL'),
  text: z.string().optional(), // Опционально если есть audioUrl
  audioUrl: z.string().url('Audio URL must be a valid URL').optional(), // Опционально если есть text
  telegramId: z.string().min(1, 'Telegram ID is required'),
  botName: z.string().optional().default('unknown_bot'),
  resolution: z.enum(['480p', '720p']).optional().default('480p'),
}).refine(
  data => data.text || data.audioUrl,
  { message: 'Either text or audioUrl must be provided' }
)

// Универсальная схема для любой lip-sync модели
export const UniversalLipSyncInputSchema = z.discriminatedUnion('provider', [
  KlingLipSyncInputSchema,
  SyncLipSyncInputSchema,
  VeedFabricInputSchema,
])

// Схема для выходных данных
export const LipSyncOutputSchema = z.object({
  id: z.string(),
  status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
  output: z.string().url().optional(),
  error: z.string().optional(),
  modelUsed: z.string(),
  costEstimate: z.number().min(0),
  processingTime: z.number().optional(),
  metadata: z.record(z.any()).optional(),
})

// Схема для ошибок
export const LipSyncErrorSchema = z.object({
  message: z.string(),
  error: z.string().optional(),
  code: z.string().optional(),
  provider: LipSyncProviderSchema.optional(),
  modelId: z.string().optional(),
})

// Схема конфигурации модели
export const LipSyncModelConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: LipSyncProviderSchema,
  modelId: z.string(),
  costPerSecond: z.number().min(0),
  maxDuration: z.number().int().min(1),
  quality: z.enum(['standard', 'high', 'premium']),
  isAvailable: z.boolean(),
  features: z.array(z.string()),
  supportedFormats: z
    .object({
      video: z.array(z.string()).optional().default(['mp4', 'avi', 'mov']),
      audio: z.array(z.string()).optional().default(['mp3', 'wav', 'aac']),
    })
    .optional(),
  limitations: z
    .object({
      maxFileSize: z.number().optional(), // в байтах
      maxResolution: z.string().optional(), // например "1920x1080"
      minDuration: z.number().optional(), // в секундах
      maxDuration: z.number().optional(), // в секундах
    })
    .optional(),
})

// Схема для управления моделями
export const LipSyncModelManagerConfigSchema = z.object({
  defaultModel: z.string(),
  fallbackModel: z.string().optional(),
  retryAttempts: z.number().int().min(0).max(5).default(3),
  timeoutSeconds: z.number().int().min(30).max(300).default(120),
  enableCaching: z.boolean().default(true),
  cacheExpirationHours: z.number().min(1).max(168).default(24), // 1 час - 1 неделя
})

// Типы, выведенные из схем
export type LipSyncProvider = z.infer<typeof LipSyncProviderSchema>
export type BaseLipSyncInput = z.infer<typeof BaseLipSyncInputSchema>
export type KlingLipSyncInput = z.infer<typeof KlingLipSyncInputSchema>
export type SyncLipSyncInput = z.infer<typeof SyncLipSyncInputSchema>
export type VeedFabricInput = z.infer<typeof VeedFabricInputSchema>
export type UniversalLipSyncInput = z.infer<typeof UniversalLipSyncInputSchema>
export type LipSyncOutput = z.infer<typeof LipSyncOutputSchema>
export type LipSyncError = z.infer<typeof LipSyncErrorSchema>
export type LipSyncModelConfig = z.infer<typeof LipSyncModelConfigSchema>
export type LipSyncModelManagerConfig = z.infer<
  typeof LipSyncModelManagerConfigSchema
>

/**
 * Валидаторы с улучшенной обработкой ошибок
 */
export class LipSyncValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: z.ZodIssue[],
    public readonly inputData?: any
  ) {
    super(message)
    this.name = 'LipSyncValidationError'
  }
}

/**
 * Безопасная валидация с детальными ошибками
 */
export function validateLipSyncInput(input: unknown): UniversalLipSyncInput {
  const result = UniversalLipSyncInputSchema.safeParse(input)

  if (!result.success) {
    throw new LipSyncValidationError(
      'Invalid lip-sync input parameters',
      result.error.issues,
      input
    )
  }

  return result.data
}

/**
 * Валидация конфигурации модели
 */
export function validateModelConfig(config: unknown): LipSyncModelConfig {
  const result = LipSyncModelConfigSchema.safeParse(config)

  if (!result.success) {
    throw new LipSyncValidationError(
      'Invalid model configuration',
      result.error.issues,
      config
    )
  }

  return result.data
}

/**
 * Помощники для создания валидированных входных данных
 */
export const LipSyncInputBuilder = {
  /**
   * Создать входные данные для Kling модели
   */
  forKling: (
    videoUrl: string,
    audioUrl: string,
    telegramId: string,
    options?: {
      botName?: string
      saveOutput?: boolean
      webhookUrl?: string
    }
  ): KlingLipSyncInput => {
    return KlingLipSyncInputSchema.parse({
      videoUrl,
      audioUrl,
      telegramId,
      provider: 'replicate',
      modelId: 'kwaivgi/kling-lip-sync',
      botName: options?.botName,
      parameters: {
        saveOutput: options?.saveOutput,
        webhookUrl: options?.webhookUrl,
      },
    })
  },

  /**
   * Создать входные данные для Sync модели
   */
  forSync: (
    videoUrl: string,
    audioUrl: string,
    telegramId: string,
    options?: {
      botName?: string
      occlusion_detection_enabled?: boolean
      face_padding_top?: number
      face_padding_bottom?: number
      face_padding_left?: number
      face_padding_right?: number
      preserve_identity?: boolean
      enhance_quality?: boolean
    }
  ): SyncLipSyncInput => {
    return SyncLipSyncInputSchema.parse({
      videoUrl,
      audioUrl,
      telegramId,
      provider: 'sync',
      modelId: 'sync/lipsync-2',
      botName: options?.botName,
      parameters: {
        occlusion_detection_enabled: options?.occlusion_detection_enabled,
        face_padding_top: options?.face_padding_top,
        face_padding_bottom: options?.face_padding_bottom,
        face_padding_left: options?.face_padding_left,
        face_padding_right: options?.face_padding_right,
        preserve_identity: options?.preserve_identity,
        enhance_quality: options?.enhance_quality,
      },
    })
  },

  /**
   * Создать входные данные для Veed Fabric модели
   */
  forVeedFabric: (
    imageUrl: string,
    textOrAudioUrl: string, // может быть text или audioUrl
    telegramId: string,
    options?: {
      botName?: string
      resolution?: '480p' | '720p'
      isAudioUrl?: boolean // флаг: true = audioUrl, false = text
    }
  ): VeedFabricInput => {
    return VeedFabricInputSchema.parse({
      imageUrl,
      text: options?.isAudioUrl ? undefined : textOrAudioUrl,
      audioUrl: options?.isAudioUrl ? textOrAudioUrl : undefined,
      telegramId,
      provider: 'kie',
      modelId: 'veed-fabric',
      botName: options?.botName,
      resolution: options?.resolution,
    })
  },
}
