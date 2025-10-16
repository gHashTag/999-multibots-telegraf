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
   * Универсальный метод build для обратной совместимости
   */
  build() {
    return {}
  }
}