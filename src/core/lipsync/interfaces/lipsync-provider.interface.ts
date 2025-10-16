/**
 * LipSync provider interface
 */

export interface ILipSyncProvider {
  generateLipSync(params: any): Promise<any>
  supportedModels: string[]
  generate(input: any): Promise<any>
  getStatus(taskId: string): Promise<any> // ✅ FALLBACK POLLING: Для проверки статуса задачи
}

export interface ProviderOperationResult {
  [key: string]: any
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