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
  timeout: number
  cacheExpirationHours: number
}

/**
 * ЗАГЛУШКА. Падает вместо того, чтобы возвращать `true`.
 *
 * Раньше тело было `return true // Упрощенная валидация`, и это значение
 * использовалось НЕ как признак валидности, а КАК САМИ ДАННЫЕ:
 * lipsync-model-manager.ts:120 кладёт результат в `validatedInput`, а затем
 *   :131 logRequest(validatedInput)            → в лог уходит `true`
 *   :136 (validatedInput as any).telegramId    → undefined
 *   :141 cacheManager.generateKey(validatedInput) → ОДИН ключ на всех
 *   :186 provider.generate(validatedInput)     → провайдер получает `true`
 * Компилятор молчал: у провайдера сигнатура `generate(input: any)`.
 *
 * Общий ключ кэша означал бы, что один пользователь получает результат другого.
 * Сегодня это НЕ происходит: LipSyncModelManager создаётся только внутри
 * getLipSyncManager() (core/lipsync/index.ts:121), у которой ноль вызовов —
 * проверено. То есть мина, а не пожар.
 *
 * Настоящий валидатор в проекте есть: `validateLipSyncInput` в
 * core/lipsync/functional/validators.ts — он возвращает разобранный вход и
 * бросает LipSyncValidationError. Именно его и ждёт код менеджера.
 *
 * Пока подключение не сделано, эта функция обязана падать: тот, кто оживит
 * менеджер, узнает об этом сразу, а не через чужие результаты в кэше.
 */
export function validateLipSyncInput(input: any): never {
  throw new LipSyncValidationError(
    'validateLipSyncInput из schemas — заглушка. Используйте валидатор из ' +
      'core/lipsync/functional/validators.ts: он возвращает разобранный вход, ' +
      'а не булево, и код менеджера рассчитан именно на это.'
  )
}

export class LipSyncValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LipSyncValidationError'
  }
}

export const LipSyncModelManagerConfigSchema = {
  parse: (config: any) => config,
}

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

export interface LipSyncOperationResult {
  [key: string]: any
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
        provider: 'fal',
        modelId: 'fal-veed-fabric-1.0-fast',
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
    return LipSyncInputBuilder.forVeedFabric(imageUrl, audioUrl, telegramId, {
      ...options,
      isAudioUrl: true, // всегда audioUrl для этого метода
    })
  },

  /**
   * Создать входные данные для LatentSync (ByteDance) модели через Fal.ai
   * Требует VIDEO + AUDIO (не image!)
   * @param videoUrl - URL видео для lip-sync
   * @param audioUrl - URL аудиофайла
   * @param telegramId - ID пользователя Telegram
   * @param options - Дополнительные опции
   * @returns Объект входных данных для LatentSync
   */
  forLatentSync: (
    videoUrl: string,
    audioUrl: string,
    telegramId: string,
    options?: {
      botName?: string
      guidanceScale?: number
    }
  ): UniversalLipSyncInput => {
    return {
      videoUrl,
      audioUrl,
      telegramId,
      provider: 'fal',
      modelId: 'fal-ai/latentsync',
      botName: options?.botName || 'unknown_bot',
      guidanceScale: options?.guidanceScale || 1.5,
    }
  },

  /**
   * Создать входные данные для Hummingbird-0 (Tavus) модели через Fal.ai
   * Требует VIDEO + AUDIO (не image!)
   * @param videoUrl - URL видео для lip-sync
   * @param audioUrl - URL аудиофайла
   * @param telegramId - ID пользователя Telegram
   * @param options - Дополнительные опции
   * @returns Объект входных данных для Hummingbird
   */
  forHummingbird: (
    videoUrl: string,
    audioUrl: string,
    telegramId: string,
    options?: {
      botName?: string
    }
  ): UniversalLipSyncInput => {
    return {
      videoUrl,
      audioUrl,
      telegramId,
      provider: 'fal',
      modelId: 'fal-ai/tavus/hummingbird-lipsync/v0',
      botName: options?.botName || 'unknown_bot',
    }
  },

  /**
   * Универсальный метод build для обратной совместимости
   */
  build() {
    return {}
  },
}
