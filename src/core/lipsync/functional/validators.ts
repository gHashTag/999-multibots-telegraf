import { z } from 'zod'
import {
  UniversalLipSyncInputSchema,
  LipSyncModelConfigSchema,
  KlingLipSyncInputSchema,
  SyncLipSyncInputSchema,
  type UniversalLipSyncInput,
  type LipSyncModelConfig,
  type KlingLipSyncInput,
  type SyncLipSyncInput,
  type KlingParameters,
  type SyncParameters,
} from './types'

/**
 * Функциональные валидаторы для Lip-Sync
 * Чистые функции без побочных эффектов
 */

// ==================== КАСТОМНЫЕ ОШИБКИ ====================

export class LipSyncValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: z.ZodIssue[],
    public readonly inputData?: unknown
  ) {
    super(message)
    this.name = 'LipSyncValidationError'
  }
}

// ==================== ВАЛИДАТОРЫ ====================

/**
 * Валидирует универсальные входные данные
 */
export const validateLipSyncInput = (input: unknown): UniversalLipSyncInput => {
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
 * Валидирует конфигурацию модели
 */
export const validateModelConfig = (config: unknown): LipSyncModelConfig => {
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
 * Проверяет, являются ли данные входными данными для Kling
 */
export const isKlingInput = (
  input: UniversalLipSyncInput
): input is KlingLipSyncInput =>
  input.provider === 'replicate' && input.modelId === 'kwaivgi/kling-lip-sync'

/**
 * Проверяет, являются ли данные входными данными для Sync
 */
export const isSyncInput = (
  input: UniversalLipSyncInput
): input is SyncLipSyncInput =>
  input.provider === 'sync' && input.modelId === 'sync/lipsync-2'

/**
 * Валидирует URL
 */
export const validateUrl = (url: string): boolean => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Валидирует Telegram ID
 */
export const validateTelegramId = (telegramId: string): boolean =>
  /^\d+$/.test(telegramId) && telegramId.length > 0

/**
 * Безопасная валидация с Either-подобным результатом
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: LipSyncValidationError }

/**
 * Безопасная валидация входных данных
 */
export const safeValidateLipSyncInput = (
  input: unknown
): ValidationResult<UniversalLipSyncInput> => {
  try {
    const data = validateLipSyncInput(input)
    return { success: true, data }
  } catch (error) {
    if (error instanceof LipSyncValidationError) {
      return { success: false, error }
    }
    return {
      success: false,
      error: new LipSyncValidationError('Unknown validation error', [], input),
    }
  }
}

/**
 * Безопасная валидация конфигурации модели
 */
export const safeValidateModelConfig = (
  config: unknown
): ValidationResult<LipSyncModelConfig> => {
  try {
    const data = validateModelConfig(config)
    return { success: true, data }
  } catch (error) {
    if (error instanceof LipSyncValidationError) {
      return { success: false, error }
    }
    return {
      success: false,
      error: new LipSyncValidationError('Unknown validation error', [], config),
    }
  }
}

// ==================== БИЛДЕРЫ ====================

/**
 * Создает входные данные для Kling модели
 */
export const createKlingInput = (
  videoUrl: string,
  speechInput: string, // Теперь принимаем либо audioUrl, либо text
  telegramId: string,
  options: {
    botName?: string
    saveOutput?: boolean
    webhookUrl?: string
    isAudioUrl?: boolean // Флаг: true = speechInput это audioUrl, false = speechInput это text
  } = {}
): KlingLipSyncInput => {
  const { isAudioUrl = false } = options // По умолчанию считаем что это text

  const input = {
    videoUrl,
    ...(isAudioUrl ? { audioUrl: speechInput } : { text: speechInput }), // Условно добавляем audioUrl или text
    telegramId,
    provider: 'replicate' as const,
    modelId: 'kwaivgi/kling-lip-sync' as const,
    botName: options.botName,
    parameters: {
      saveOutput: options.saveOutput,
      webhookUrl: options.webhookUrl,
    } satisfies KlingParameters,
  }

  return KlingLipSyncInputSchema.parse(input)
}

/**
 * Создает входные данные для Sync модели
 */
export const createSyncInput = (
  videoUrl: string,
  speechInput: string, // Теперь принимаем либо audioUrl, либо text
  telegramId: string,
  options: {
    botName?: string
    isAudioUrl?: boolean // Флаг: true = speechInput это audioUrl, false = speechInput это text
    occlusion_detection_enabled?: boolean
    face_padding_top?: number
    face_padding_bottom?: number
    face_padding_left?: number
    face_padding_right?: number
    preserve_identity?: boolean
    enhance_quality?: boolean
  } = {}
): SyncLipSyncInput => {
  const { isAudioUrl = false } = options // По умолчанию считаем что это text

  const input = {
    videoUrl,
    ...(isAudioUrl ? { audioUrl: speechInput } : { text: speechInput }), // Условно добавляем audioUrl или text
    telegramId,
    provider: 'sync' as const,
    modelId: 'sync/lipsync-2' as const,
    botName: options.botName,
    parameters: {
      occlusion_detection_enabled: options.occlusion_detection_enabled,
      face_padding_top: options.face_padding_top,
      face_padding_bottom: options.face_padding_bottom,
      face_padding_left: options.face_padding_left,
      face_padding_right: options.face_padding_right,
      preserve_identity: options.preserve_identity,
      enhance_quality: options.enhance_quality,
    } satisfies SyncParameters,
  }

  return SyncLipSyncInputSchema.parse(input)
}

/**
 * Создает универсальные входные данные по провайдеру
 */
export function createInputByProvider(
  provider: 'replicate',
  videoUrl: string,
  audioUrl: string,
  telegramId: string,
  options?: Parameters<typeof createKlingInput>[3]
): KlingLipSyncInput

export function createInputByProvider(
  provider: 'sync',
  videoUrl: string,
  audioUrl: string,
  telegramId: string,
  options?: Parameters<typeof createSyncInput>[3]
): SyncLipSyncInput

export function createInputByProvider(
  provider: 'replicate' | 'sync',
  videoUrl: string,
  audioUrl: string,
  telegramId: string,
  options: any = {}
): UniversalLipSyncInput {
  switch (provider) {
    case 'replicate':
      return createKlingInput(videoUrl, audioUrl, telegramId, options)
    case 'sync':
      return createSyncInput(videoUrl, audioUrl, telegramId, options)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

// ==================== УТИЛИТЫ ====================

/**
 * Извлекает основные параметры из входных данных
 */
export const extractBaseParams = (input: UniversalLipSyncInput) => ({
  videoUrl: input.videoUrl, // Возвращено обратно на videoUrl
  audioUrl: input.audioUrl,
  telegramId: input.telegramId,
  botName: input.botName || 'unknown_bot',
})

/**
 * Проверяет корректность URL-ов в входных данных
 */
export const validateInputUrls = (input: UniversalLipSyncInput): boolean =>
  validateUrl(input.videoUrl) && validateUrl(input.audioUrl) // Возвращено обратно на videoUrl

/**
 * Генерирует уникальный ключ для входных данных (для кэширования)
 */
export const generateInputKey = (input: UniversalLipSyncInput): string => {
  const baseParams = extractBaseParams(input)
  const key = `${input.provider}:${input.modelId}:${baseParams.videoUrl}:${baseParams.audioUrl}:${baseParams.telegramId}` // Возвращено обратно на videoUrl

  // Добавляем параметры если они есть
  if (input.parameters) {
    const paramsString = JSON.stringify(
      input.parameters,
      Object.keys(input.parameters).sort()
    )
    return `${key}:${paramsString}`
  }

  return key
}
