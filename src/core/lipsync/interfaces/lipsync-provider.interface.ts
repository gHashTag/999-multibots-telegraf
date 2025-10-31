/**
 * LipSync provider interface
 */

import type { LipSyncModelConfig } from '../schemas/lipsync-schemas'

export interface ILipSyncProvider {
  readonly providerId: string
  readonly providerName: string
  readonly supportedModels: string[]
  generateLipSync(params: any): Promise<any>
  generate(input: any): Promise<any>
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