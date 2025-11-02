import { z } from 'zod'

/**
 * Функциональные типы и схемы для Lip-Sync
 * Основанные на чистых функциях без побочных эффектов
 */

// ==================== БАЗОВЫЕ ТИПЫ ====================

export type LipSyncProvider = 'replicate' | 'sync' | 'fal'

export type LipSyncStatus =
  | 'starting'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export type LipSyncQuality = 'standard' | 'high' | 'premium'

// ==================== ZOD СХЕМЫ ====================

export const LipSyncProviderSchema = z.enum(['replicate', 'sync', 'fal'])

export const LipSyncStatusSchema = z.enum([
  'starting',
  'processing',
  'succeeded',
  'failed',
  'canceled',
])

export const LipSyncQualitySchema = z.enum(['standard', 'high', 'premium'])

// Структура для Replicate API input
export const ReplicateInputSchema = z.object({
  input: z.object({
    video_url: z.string().url(),
    audio_url: z.string().url(),
  }),
  webhook: z.string().url().optional(), // webhook идет на верхнем уровне, не в input
})

export type ReplicateInput = z.infer<typeof ReplicateInputSchema>

// Базовые входные параметры - НОВАЯ УНИВЕРСАЛЬНАЯ СХЕМА
export const BaseLipSyncInputSchema = z
  .object({
    videoUrl: z.string().url('Video URL must be a valid URL'),
    telegramId: z.string().min(1, 'Telegram ID is required'),
    botName: z.string().optional().default('unknown_bot'),
    // Либо audioUrl, либо text (взаимоисключающие параметры)
    audioUrl: z.string().url('Audio URL must be a valid URL').optional(),
    text: z
      .string()
      .min(3, 'Text must be at least 3 characters')
      .max(1000, 'Text must be at most 1000 characters')
      .optional(),
  })
  .refine(data => Boolean(data.audioUrl) !== Boolean(data.text), {
    message: 'Either audioUrl or text must be provided, but not both',
    path: ['audioUrl', 'text'],
  })

// Параметры для Kling модели
export const KlingParametersSchema = z
  .object({
    saveOutput: z.boolean().optional().default(true),
    webhookUrl: z.string().url().optional(),
  })
  .optional()

// Параметры для Sync модели
export const SyncParametersSchema = z
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
    face_padding_right: z.number().int().min(0).max(100).optional().default(0),
    preserve_identity: z.boolean().optional().default(true),
    enhance_quality: z.boolean().optional().default(true),
  })
  .optional()

// Создаем базовую схему без .refine() для расширения
const BaseLipSyncSchema = z.object({
  videoUrl: z.string().url('Video URL must be a valid URL'),
  telegramId: z.string().min(1, 'Telegram ID is required'),
  botName: z.string().optional().default('unknown_bot'),
  audioUrl: z.string().url('Audio URL must be a valid URL').optional(),
  text: z
    .string()
    .min(3, 'Text must be at least 3 characters')
    .max(1000, 'Text must be at most 1000 characters')
    .optional(),
})

// Входные данные для конкретных провайдеров
export const KlingLipSyncInputSchema = BaseLipSyncSchema.extend({
  provider: z.literal('replicate'),
  modelId: z.literal('kwaivgi/kling-lip-sync'),
  parameters: KlingParametersSchema,
}).refine(data => Boolean(data.audioUrl) !== Boolean(data.text), {
  message: 'Either audioUrl or text must be provided, but not both',
  path: ['audioUrl', 'text'],
})

export const SyncLipSyncInputSchema = BaseLipSyncSchema.extend({
  provider: z.literal('sync'),
  modelId: z.literal('sync/lipsync-2'),
  parameters: SyncParametersSchema,
}).refine(data => Boolean(data.audioUrl) !== Boolean(data.text), {
  message: 'Either audioUrl or text must be provided, but not both',
  path: ['audioUrl', 'text'],
})

// Универсальные входные данные
export const UniversalLipSyncInputSchema = z.union([
  KlingLipSyncInputSchema,
  SyncLipSyncInputSchema,
])

// Выходные данные
export const LipSyncOutputSchema = z.object({
  id: z.string(),
  status: LipSyncStatusSchema,
  output: z.string().url().optional(),
  error: z.string().optional(),
  modelUsed: z.string(),
  costEstimate: z.number().min(0),
  processingTime: z.number().optional(),
  metadata: z.record(z.any()).optional(),
})

// Ошибки
export const LipSyncErrorSchema = z.object({
  message: z.string(),
  error: z.string().optional(),
  code: z.string().optional(),
  provider: LipSyncProviderSchema.optional(),
  modelId: z.string().optional(),
})

// Конфигурация модели
export const LipSyncModelConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: LipSyncProviderSchema,
  modelId: z.string(),
  costPerSecond: z.number().min(0),
  maxDuration: z.number().int().min(1),
  quality: LipSyncQualitySchema,
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
      maxFileSize: z.number().optional(),
      maxResolution: z.string().optional(),
      minDuration: z.number().optional(),
      maxDuration: z.number().optional(),
    })
    .optional(),
})

// Результат операции
export const LipSyncResultSchema = z.object({
  success: z.boolean(),
  data: LipSyncOutputSchema.optional(),
  error: LipSyncErrorSchema.optional(),
  metadata: z
    .object({
      provider: LipSyncProviderSchema.optional(),
      modelId: z.string(),
      timestamp: z.date(),
      processingTime: z.number().optional(),
    })
    .optional(),
})

// ==================== ТИПЫ ====================

export type BaseLipSyncInput = z.infer<typeof BaseLipSyncInputSchema>
export type KlingLipSyncInput = z.infer<typeof KlingLipSyncInputSchema>
export type SyncLipSyncInput = z.infer<typeof SyncLipSyncInputSchema>
export type UniversalLipSyncInput = z.infer<typeof UniversalLipSyncInputSchema>
export type LipSyncOutput = z.infer<typeof LipSyncOutputSchema>
export type LipSyncError = z.infer<typeof LipSyncErrorSchema>
export type LipSyncModelConfig = z.infer<typeof LipSyncModelConfigSchema>
export type LipSyncResult = z.infer<typeof LipSyncResultSchema>

export type KlingParameters = z.infer<typeof KlingParametersSchema>
export type SyncParameters = z.infer<typeof SyncParametersSchema>

// ==================== ФУНКЦИОНАЛЬНЫЕ ТИПЫ ====================

// Функция провайдера
export type LipSyncProviderFunction = (
  input: UniversalLipSyncInput
) => Promise<LipSyncResult>

// Функция проверки статуса
export type StatusCheckFunction = (
  predictionId: string
) => Promise<LipSyncResult>

// Функция проверки доступности
export type AvailabilityCheckFunction = () => Promise<boolean>

// Функция расчета стоимости
export type CostCalculationFunction = (
  durationSeconds: number,
  modelId: string
) => number

// Конфигурация провайдера
export type ProviderConfig = {
  readonly providerId: LipSyncProvider
  readonly providerName: string
  readonly supportedModels: readonly string[]
  readonly modelsConfig: readonly LipSyncModelConfig[]
  readonly generateFn: LipSyncProviderFunction
  readonly getStatusFn: StatusCheckFunction
  readonly isAvailableFn: AvailabilityCheckFunction
  readonly calculateCostFn: CostCalculationFunction
  readonly cancelFn?: (predictionId: string) => Promise<boolean>
}

// Контекст генерации
export type GenerationContext = {
  readonly input: UniversalLipSyncInput
  readonly modelConfig: LipSyncModelConfig
  readonly provider: ProviderConfig
  readonly startTime: number
  readonly retryAttempts: number
  readonly enableCaching: boolean
}

// Результат с контекстом
export type ContextualResult<T = LipSyncOutput> = {
  readonly result: LipSyncResult
  readonly context: GenerationContext
}
