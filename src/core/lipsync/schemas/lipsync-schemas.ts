/**
 * LipSync schemas
 */

// Заглушка для схем lipsync
export const LipSyncRequestSchema = {}
export const LipSyncResponseSchema = {}
export const LipSyncConfigSchema = {}

// Дополнительные экспорты
export interface UniversalLipSyncInput {
  [key: string]: any
}

export interface LipSyncOutput {
  [key: string]: any
}

export interface LipSyncError {
  [key: string]: any
}

export interface LipSyncModelConfig {
  [key: string]: any
}

// Типы провайдеров
export type LipSyncProvider = 'replicate' | 'sync' | 'kie' | 'fal'

// Входные данные для различных провайдеров
export interface SyncLipSyncInput extends UniversalLipSyncInput {
  provider: 'sync'
  modelId: 'sync/lipsync-2'
  videoUrl: string
  audioUrl: string
  telegramId: string
  parameters?: any
}

export interface KlingLipSyncInput extends UniversalLipSyncInput {
  provider: 'replicate'
  modelId: 'kwaivgi/kling-lip-sync'
  videoUrl: string
  audioUrl: string
  telegramId: string
}

export interface VeedFabricInput extends UniversalLipSyncInput {
  provider: 'kie'
  modelId: 'veed-fabric'
  imageUrl: string
  text?: string
  audioUrl?: string
  telegramId: string
  resolution?: '480p' | '720p'
}

// Менеджер конфигурации
export interface LipSyncModelManagerConfig {
  defaultModel: string
  enableCaching: boolean
  retryAttempts: number
  cacheExpirationHours: number
}

// Валидация
export function validateLipSyncInput(input: any): boolean {
  return true // Упрощенная валидация
}

export class LipSyncValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LipSyncValidationError'
  }
}

import { z } from 'zod'

export const LipSyncModelManagerConfigSchema = z.object({
  defaultModel: z.string().default('fal/lip-sync'),
  enableCaching: z.boolean().default(true),
  retryAttempts: z.number().min(1).default(3),
  cacheExpirationHours: z.number().min(0).default(24),
})

export interface LipSyncModelManagementStrategy {
  [key: string]: any
}

export interface LipSyncCacheEntry {
  [key: string]: any
}

export interface LipSyncMetrics {
  [key: string]: any
}

export interface LipSyncModelInfo {
  [key: string]: any
}

export interface ProviderOperationResult<T> {
  success: boolean
  data?: T
  error?: LipSyncError
  metadata?: {
    provider?: string
    modelId?: string
    timestamp: Date
    processingTime?: number
  }
}

// ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Восстановление LipSyncInputBuilder с методом forVeedFabric
// Этот метод вызывается в veed-fabric-wizard.ts и ai-reels-wizard.ts
export const LipSyncInputBuilder = {
  /**
   * Создать входные данные для Veed Fabric модели (Kie.ai)
   * @param imageUrl - URL изображения для lip-sync
   * @param textOrAudioUrl - Текст для озвучки ИЛИ URL аудиофайла
   * @param telegramId - ID пользователя Telegram
   * @param options - Дополнительные опции
   * @returns Объект входных данных для Veed Fabric
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
  ): UniversalLipSyncInput => {
    try {
      return {
        imageUrl,
        text: options?.isAudioUrl ? undefined : textOrAudioUrl,
        audioUrl: options?.isAudioUrl ? textOrAudioUrl : undefined,
        telegramId,
        provider: 'kie',
        modelId: 'veed-fabric',
        botName: options?.botName || 'unknown_bot',
        resolution: options?.resolution || '480p',
      }
    } catch (error) {
      // ✅ УЛУЧШЕНО: Детальное логирование ошибок создания input
      throw new Error(
        `Failed to create Veed Fabric input: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        `Input data: imageUrl=${imageUrl?.substring(0, 50)}, ` +
        `textOrAudioUrl length=${textOrAudioUrl?.length}, ` +
        `telegramId=${telegramId}, ` +
        `isAudioUrl=${options?.isAudioUrl}`
      )
    }
  },

  /**
   * Создать входные данные для Fal.ai Veed Fabric 1.0 Fast модели
   * @param imageUrl - URL изображения для lip-sync
   * @param audioUrl - URL аудиофайла
   * @param telegramId - ID пользователя Telegram
   * @param options - Дополнительные опции
   * @returns Объект входных данных для Fal.ai Veed Fabric
   */
  forFalVeedFabric: (
    imageUrl: string,
    audioUrl: string,
    telegramId: string,
    options?: {
      botName?: string
      resolution?: '480p' | '720p'
    }
  ): UniversalLipSyncInput => {
    try {
      return {
        imageUrl,
        audioUrl,
        telegramId,
  provider: 'fal'
  modelId: 'fal-veed-fabric-1.0-fast'
        botName: options?.botName || 'unknown_bot',
        resolution: options?.resolution || '720p',
      }
    } catch (error) {
      throw new Error(
        `Failed to create Fal.ai Veed Fabric input: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        `Input data: imageUrl=${imageUrl?.substring(0, 50)}, ` +
        `audioUrl=${audioUrl?.substring(0, 50)}, ` +
        `telegramId=${telegramId}, ` +
        `resolution=${options?.resolution}`
      )
    }
  },

  /**
   * Alias для forVeedFabric() - для обратной совместимости
   * @deprecated Используйте forVeedFabric() вместо этого
   */
  forKieVeedFabric: (
    imageUrl: string,
    audioUrl: string,
    telegramId: string,
    options?: {
      botName?: string
      resolution?: '480p' | '720p'
    }
  ): UniversalLipSyncInput => {
    // Используем forVeedFabric() с флагом isAudioUrl=true
    return LipSyncInputBuilder.forVeedFabric(
      imageUrl,
      audioUrl,
      telegramId,
      {
        ...options,
        isAudioUrl: true, // всегда audioUrl для этого метода
      }
    )
  },

  /**
   * Универсальный метод build для обратной совместимости
   */
  build() {
    return {}
  }
}