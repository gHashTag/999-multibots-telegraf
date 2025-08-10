/**
 * Централизованное управление Lip-Sync моделями
 * Unified API для всех провайдеров с валидацией и мониторингом
 * ОБНОВЛЕНО: Функциональный подход вместо классов
 */

// ==================== ФУНКЦИОНАЛЬНЫЙ ПОДХОД (НОВЫЙ) ====================
// Экспортируем всё из функционального модуля
export * from './functional'

// ==================== LEGACY API (СТАРЫЙ, DEPRECATED) ====================
// Для обратной совместимости - будет удалено в будущих версиях

// Основные компоненты (DEPRECATED)
export { LipSyncModelManager } from './manager/lipsync-model-manager'
export {
  lipSyncProviderFactory,
  initializeDefaultProviders as initializeDefaultProvidersLegacy,
} from './providers/provider-factory'

// Провайдеры (DEPRECATED)
export { ReplicateKlingProvider } from './providers/replicate-kling-provider'
export { SyncLipSyncProvider } from './providers/sync-lipsync-provider'

// Билдеры для удобного создания входных данных (DEPRECATED)
export { LipSyncInputBuilder } from './schemas/lipsync-schemas'

// ==================== ПЕРЕХОДНЫЕ ФУНКЦИИ ====================
// Используют новый функциональный подход, но сохраняют старый API

import {
  generateLipSync as functionalGenerateLipSync,
  getLipSyncStatus as functionalGetLipSyncStatus,
  getAvailableModels as functionalGetAvailableModels,
  calculateCost as functionalCalculateCost,
  checkProvidersHealth as functionalCheckProvidersHealth,
  createKlingInput,
  createSyncInput,
  createConfig,
} from './functional'

// Создаем глобальную конфигурацию
const globalConfig = createConfig({
  defaultModelId: 'kling',
  retryAttempts: 3,
  timeoutSeconds: 120,
  enableCaching: true,
  cacheExpirationHours: 24,
})

/**
 * Быстрая генерация lip-sync с автоматическим выбором модели
 * ОБНОВЛЕНО: Использует функциональный подход
 */
export async function generateLipSyncVideo(
  videoUrl: string,
  audioUrl: string,
  telegramId: string,
  options?: {
    modelId?: string
    botName?: string
  }
) {
  // Используем Kling по умолчанию
  const input = createKlingInput(videoUrl, audioUrl, telegramId, {
    botName: options?.botName,
  })

  return functionalGenerateLipSync(input, options?.modelId, globalConfig)
}

/**
 * Получить статус генерации
 * ОБНОВЛЕНО: Использует функциональный подход
 */
export async function getLipSyncStatus(predictionId: string, modelId?: string) {
  return functionalGetLipSyncStatus(predictionId, modelId, globalConfig)
}

/**
 * Получить все доступные модели
 * ОБНОВЛЕНО: Использует функциональный подход
 */
export function getAvailableLipSyncModels() {
  return functionalGetAvailableModels()
}

/**
 * Рассчитать стоимость
 * ОБНОВЛЕНО: Использует функциональный подход
 */
export function calculateLipSyncCost(
  durationSeconds: number,
  modelId?: string
) {
  return functionalCalculateCost(durationSeconds, modelId, globalConfig)
}

/**
 * Проверить здоровье всех провайдеров
 * ОБНОВЛЕНО: Использует функциональный подход
 */
export async function checkProvidersHealth() {
  return functionalCheckProvidersHealth()
}

// ==================== LEGACY MANAGER (DEPRECATED) ====================
// Для совместимости с существующим кодом

import { LipSyncModelManager } from './manager/lipsync-model-manager'
import { initializeDefaultProviders } from './providers/provider-factory'

/**
 * @deprecated Используйте функциональный подход из ./functional
 */
let globalManager: LipSyncModelManager | null = null

/**
 * @deprecated Используйте функциональный подход из ./functional
 */
export function getLipSyncManager(): LipSyncModelManager {
  if (!globalManager) {
    const providers = initializeDefaultProviders()
    globalManager = new LipSyncModelManager({
      defaultModel: 'kling',
      retryAttempts: 3,
      timeoutSeconds: 120,
      enableCaching: true,
      cacheExpirationHours: 24,
    })

    // Регистрируем все провайдеры
    providers.forEach(provider => {
      globalManager!.registerProvider(provider)
    })
  }

  return globalManager
}

/**
 * @deprecated Используйте функциональный подход из ./functional
 */
export function resetLipSyncManager(): void {
  globalManager = null
}
