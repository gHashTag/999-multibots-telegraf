/**
 * LipSync provider interface
 */

export interface ILipSyncProvider {
  generateLipSync(params: any): Promise<any>
  supportedModels: string[]
  generate(input: any): Promise<any>
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