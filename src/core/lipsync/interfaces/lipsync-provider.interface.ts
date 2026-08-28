import type { UniversalLipSyncInput } from '../schemas/lipsync-schemas'
/**
 * LipSync provider interface
 */

import type { LipSyncModelConfig } from '../schemas/lipsync-schemas'

export interface ILipSyncProvider {
  readonly providerId: string
  readonly providerName: string
  readonly supportedModels: string[]
  generateLipSync(params: any): Promise<any>
  // input: UniversalLipSyncInput, а НЕ any.
  //
  // Пока здесь стояло `any`, компилятор не мог возразить против
  // `provider.generate(validatedInput)` в lipsync-model-manager.ts:186, где
  // validatedInput был булевым `true` — результатом заглушки-валидатора.
  // Тип слабый (`{ [key: string]: any }`), но булево ему уже не соответствует,
  // и именно этого достаточно, чтобы такая ошибка не прошла молча снова.
  generate(input: UniversalLipSyncInput): Promise<any>
  getStatus(taskId: string): Promise<any>
  getModelsConfig(): LipSyncModelConfig[]
  supportsModel(modelId: string): boolean
  isAvailable(): Promise<boolean>
  calculateCost(durationSeconds: number, modelId: string): number
}

export interface ProviderOperationResult<T> {
  success: boolean
  data?: T
  error?: any
  metadata?: any
}

export interface ICacheManager {
  [key: string]: any
}

export interface ILipSyncMonitor {
  [key: string]: any
}

export interface ILipSyncProviderFactory {
  [key: string]: any
}
