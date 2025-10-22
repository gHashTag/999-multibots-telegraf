import { logger } from '@/utils/logger'
import { lipSyncProviderFactory } from './providers/provider-factory'
import type {
  UniversalLipSyncInput,
  LipSyncOutput,
  LipSyncError,
} from './schemas/lipsync-schemas'
import type { ILipSyncProvider } from './interfaces/lipsync-provider.interface'

/**
 * Unified Lip Sync Orchestrator
 * Управляет выполнением lip-sync через различные провайдеры
 */
export class LipSyncOrchestrator {
  private static instance: LipSyncOrchestrator

  private constructor() {}

  static getInstance(): LipSyncOrchestrator {
    if (!LipSyncOrchestrator.instance) {
      LipSyncOrchestrator.instance = new LipSyncOrchestrator()
    }
    return LipSyncOrchestrator.instance
  }

  /**
   * Генерирует lip-sync видео используя указанный провайдер
   */
  async generate(
    input: UniversalLipSyncInput
  ): Promise<LipSyncOutput | LipSyncError> {
    try {
      logger.info('🎭 Запуск lip-sync генерации', {
        provider: input.provider,
        modelId: input.modelId,
        telegramId: input.telegramId,
      })

      // Получаем провайдер из factory
      const provider: ILipSyncProvider =
        lipSyncProviderFactory.createProvider(input.provider)

      // Проверяем поддержку модели
      if (!provider.supportedModels.includes(input.modelId)) {
        return {
          message: `Model ${input.modelId} is not supported by provider ${input.provider}`,
          error: `Supported models: ${provider.supportedModels.join(', ')}`,
          code: 'UNSUPPORTED_MODEL',
          provider: input.provider,
          modelId: input.modelId,
        }
      }

      // Запускаем генерацию
      const result = await provider.generate(input)

      // Проверяем на ошибки
      if ('message' in result && 'error' in result) {
        logger.error('❌ Ошибка генерации lip-sync', {
          provider: input.provider,
          modelId: input.modelId,
          error: result.message,
        })
        return result
      }

      logger.info('✅ Lip-sync видео успешно сгенерировано', {
        provider: input.provider,
        modelId: input.modelId,
        output: (result as LipSyncOutput).output,
      })

      return result
    } catch (error) {
      logger.error('❌ Критическая ошибка в orchestrator', {
        error: error instanceof Error ? error.message : String(error),
        provider: input.provider,
        modelId: input.modelId,
      })

      return {
        message: 'Critical error in lip-sync orchestrator',
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'ORCHESTRATOR_ERROR',
        provider: input.provider,
        modelId: input.modelId,
      }
    }
  }

  /**
   * Получает список доступных провайдеров
   */
  getAvailableProviders(): string[] {
    return lipSyncProviderFactory.getSupportedProviderTypes()
  }

  /**
   * Проверяет доступность провайдера
   */
  isProviderAvailable(provider: string): boolean {
    return lipSyncProviderFactory.isProviderTypeSupported(provider)
  }

  /**
   * ✅ FALLBACK POLLING: Проверяет статус задачи через провайдер
   * Используется когда webhook не приходит
   */
  async checkStatus(
    providerType: string,
    modelId: string,
    taskId: string
  ): Promise<LipSyncOutput | LipSyncError> {
    try {
      logger.info('🔍 [ORCHESTRATOR] Проверка статуса задачи', {
        providerType,
        modelId,
        taskId,
      })

      // Получаем провайдер из factory
      const provider: ILipSyncProvider =
        lipSyncProviderFactory.createProvider(providerType)

      // Вызываем getStatus провайдера
      const result = await provider.getStatus(taskId)

      logger.info('📥 [ORCHESTRATOR] Получен статус от провайдера', {
        providerType,
        modelId,
        taskId,
        hasError: 'error' in result,
        status: 'status' in result ? result.status : 'unknown',
      })

      // ✅ Проверяем, есть ли ошибка в результате
      if ('error' in result && result.error) {
        logger.error('❌ [ORCHESTRATOR] Провайдер вернул ошибку', {
          providerType,
          modelId,
          taskId,
          error: result.error,
          code: result.code,
        })
        return result
      }

      return result
    } catch (error) {
      logger.error('❌ [ORCHESTRATOR] Ошибка проверки статуса', {
        error: error instanceof Error ? error.message : String(error),
        providerType,
        modelId,
        taskId,
      })

      return {
        message: 'Failed to check task status',
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'STATUS_CHECK_ERROR',
        provider: providerType,
        modelId: modelId,
      }
    }
  }
}

/**
 * Singleton экземпляр orchestrator для удобного доступа
 */
export const lipSyncOrchestrator = LipSyncOrchestrator.getInstance()
