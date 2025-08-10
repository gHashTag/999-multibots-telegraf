import type {
  LipSyncOutput,
  LipSyncError,
  LipSyncModelConfig,
  UniversalLipSyncInput,
  LipSyncProvider,
} from '../schemas/lipsync-schemas'

/**
 * Абстрактный интерфейс для всех провайдеров lip-sync
 * Обеспечивает единообразное API для всех моделей
 */
export interface ILipSyncProvider {
  /**
   * Уникальный идентификатор провайдера
   */
  readonly providerId: LipSyncProvider

  /**
   * Название провайдера для отображения
   */
  readonly providerName: string

  /**
   * Поддерживаемые модели этим провайдером
   */
  readonly supportedModels: string[]

  /**
   * Генерирует lip-sync видео
   * @param input - Валидированные входные параметры
   * @returns Promise с результатом или ошибкой
   */
  generate(input: UniversalLipSyncInput): Promise<LipSyncOutput | LipSyncError>

  /**
   * Получает статус обработки по ID
   * @param predictionId - ID предсказания/задачи
   * @returns Promise с актуальным статусом
   */
  getStatus(predictionId: string): Promise<LipSyncOutput | LipSyncError>

  /**
   * Проверяет доступность провайдера
   * @returns Promise<boolean> - true если провайдер доступен
   */
  isAvailable(): Promise<boolean>

  /**
   * Валидирует поддержку модели
   * @param modelId - ID модели для проверки
   * @returns boolean - true если модель поддерживается
   */
  supportsModel(modelId: string): boolean

  /**
   * Получает конфигурацию поддерживаемых моделей
   * @returns Массив конфигураций моделей
   */
  getModelsConfig(): LipSyncModelConfig[]

  /**
   * Рассчитывает стоимость обработки
   * @param durationSeconds - Длительность видео в секундах
   * @param modelId - ID модели
   * @returns Стоимость в долларах
   */
  calculateCost(durationSeconds: number, modelId: string): number

  /**
   * Отменяет обработку (если поддерживается)
   * @param predictionId - ID предсказания для отмены
   * @returns Promise<boolean> - true если отмена успешна
   */
  cancel?(predictionId: string): Promise<boolean>
}

/**
 * Результат операции провайдера
 */
export interface ProviderOperationResult<T = any> {
  success: boolean
  data?: T
  error?: LipSyncError
  metadata?: {
    provider: LipSyncProvider
    modelId: string
    timestamp: Date
    processingTime?: number
  }
}

/**
 * Конфигурация провайдера
 */
export interface ProviderConfig {
  provider: LipSyncProvider
  apiKey?: string
  baseUrl?: string
  timeout?: number
  retryAttempts?: number
  webhookUrl?: string
  customHeaders?: Record<string, string>
}

/**
 * Статистика использования провайдера
 */
export interface ProviderUsageStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageProcessingTime: number
  totalCost: number
  lastUsed: Date
}

/**
 * Менеджер кэша для результатов
 */
export interface ICacheManager {
  get(key: string): Promise<LipSyncOutput | null>
  set(
    key: string,
    value: LipSyncOutput,
    expirationHours?: number
  ): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  generateKey(input: UniversalLipSyncInput): string
}

/**
 * Интерфейс для мониторинга и логирования
 */
export interface ILipSyncMonitor {
  logRequest(input: UniversalLipSyncInput): void
  logResponse(output: LipSyncOutput | LipSyncError): void
  logError(error: Error, context?: any): void
  getUsageStats(provider?: LipSyncProvider): Promise<ProviderUsageStats>
}

/**
 * Типы событий для системы событий
 */
export interface LipSyncEvents {
  'generation.started': {
    provider: LipSyncProvider
    modelId: string
    telegramId: string
    timestamp: Date
  }
  'generation.completed': {
    provider: LipSyncProvider
    modelId: string
    telegramId: string
    result: LipSyncOutput
    duration: number
  }
  'generation.failed': {
    provider: LipSyncProvider
    modelId: string
    telegramId: string
    error: LipSyncError
    duration: number
  }
  'provider.unavailable': {
    provider: LipSyncProvider
    reason: string
    timestamp: Date
  }
}

/**
 * Интерфейс для системы событий
 */
export interface IEventEmitter {
  emit<K extends keyof LipSyncEvents>(event: K, data: LipSyncEvents[K]): void
  on<K extends keyof LipSyncEvents>(
    event: K,
    listener: (data: LipSyncEvents[K]) => void
  ): void
  off<K extends keyof LipSyncEvents>(
    event: K,
    listener: (data: LipSyncEvents[K]) => void
  ): void
}
