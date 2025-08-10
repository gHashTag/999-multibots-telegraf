import type { ILipSyncProvider } from '../interfaces/lipsync-provider.interface'
import type { LipSyncProvider } from '../schemas/lipsync-schemas'
import { ReplicateKlingProvider } from './replicate-kling-provider'
import { SyncLipSyncProvider } from './sync-lipsync-provider'
import { logger } from '@/utils/logger'

/**
 * Фабрика для создания провайдеров lip-sync моделей
 * Centralizes provider instantiation and configuration
 */
export class LipSyncProviderFactory {
  private static instance: LipSyncProviderFactory
  private providerCache = new Map<LipSyncProvider, ILipSyncProvider>()

  private constructor() {}

  /**
   * Получить единственный экземпляр фабрики (Singleton)
   */
  static getInstance(): LipSyncProviderFactory {
    if (!LipSyncProviderFactory.instance) {
      LipSyncProviderFactory.instance = new LipSyncProviderFactory()
    }
    return LipSyncProviderFactory.instance
  }

  /**
   * Создает провайдер по его типу
   */
  createProvider(
    providerType: LipSyncProvider,
    config?: any
  ): ILipSyncProvider {
    // Проверяем кэш
    const cachedProvider = this.providerCache.get(providerType)
    if (cachedProvider) {
      return cachedProvider
    }

    let provider: ILipSyncProvider

    switch (providerType) {
      case 'replicate':
        provider = new ReplicateKlingProvider(config)
        break

      case 'sync':
        provider = new SyncLipSyncProvider(config)
        break

      default:
        throw new Error(`Unknown provider type: ${providerType}`)
    }

    // Кэшируем созданный провайдер
    this.providerCache.set(providerType, provider)

    logger.info('🏭 Создан провайдер lip-sync', {
      providerType,
      providerName: provider.providerName,
      supportedModels: provider.supportedModels,
    })

    return provider
  }

  /**
   * Создает все доступные провайдеры
   */
  createAllProviders(
    configs?: Record<LipSyncProvider, any>
  ): ILipSyncProvider[] {
    const providers: ILipSyncProvider[] = []
    const availableProviders: LipSyncProvider[] = ['replicate', 'sync']

    for (const providerType of availableProviders) {
      try {
        const config = configs?.[providerType]
        const provider = this.createProvider(providerType, config)
        providers.push(provider)
      } catch (error) {
        logger.error(`❌ Не удалось создать провайдер ${providerType}`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    logger.info('🏭 Создано провайдеров lip-sync', {
      count: providers.length,
      providers: providers.map(p => p.providerId),
    })

    return providers
  }

  /**
   * Получает провайдер из кэша
   */
  getCachedProvider(
    providerType: LipSyncProvider
  ): ILipSyncProvider | undefined {
    return this.providerCache.get(providerType)
  }

  /**
   * Очищает кэш провайдеров
   */
  clearCache(): void {
    this.providerCache.clear()
    logger.info('🧹 Кэш провайдеров lip-sync очищен')
  }

  /**
   * Получает список поддерживаемых типов провайдеров
   */
  getSupportedProviderTypes(): LipSyncProvider[] {
    return ['replicate', 'sync']
  }

  /**
   * Проверяет, поддерживается ли тип провайдера
   */
  isProviderTypeSupported(
    providerType: string
  ): providerType is LipSyncProvider {
    return this.getSupportedProviderTypes().includes(
      providerType as LipSyncProvider
    )
  }
}

/**
 * Синглтон фабрики для удобного доступа
 */
export const lipSyncProviderFactory = LipSyncProviderFactory.getInstance()

/**
 * Конфигурации по умолчанию для провайдеров
 */
export const DEFAULT_PROVIDER_CONFIGS = {
  replicate: {
    timeout: 300000, // 5 минут
    retryAttempts: 3,
    webhookUrl: process.env.REPLICATE_WEBHOOK_URL,
  },
  sync: {
    timeout: 600000, // 10 минут
    retryAttempts: 2,
    baseUrl: 'https://api.sync.so',
  },
} as const

/**
 * Автоматическая инициализация провайдеров с конфигурациями по умолчанию
 */
export function initializeDefaultProviders(): ILipSyncProvider[] {
  return lipSyncProviderFactory.createAllProviders(DEFAULT_PROVIDER_CONFIGS)
}
