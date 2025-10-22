/**
 * LipSync provider interface
 */

export interface ILipSyncProvider {
  readonly providerId: string
  readonly providerName: string
  readonly supportedModels: string[]
  generateLipSync(params: any): Promise<any>
  generate(input: any): Promise<any>
  getStatus(taskId: string): Promise<any>
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