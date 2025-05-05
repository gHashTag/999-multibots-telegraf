import type { MyContext } from '@/interfaces'

/**
 * Dependencies interface for NeuroPhoto module.
 * This ensures that external services are injected rather than directly imported.
 */
export interface NeuroPhotoDependencies {
  userHelper: {
    getUser: (telegramId: string) => Promise<any>
  }
  balanceHelper: {
    processBalance: (
      telegramId: string,
      cost: number,
      operationType: string,
      modelName: string
    ) => Promise<any>
  }
  imageGenerationApi: {
    run: (model: string, input: any) => Promise<any>
  }
  saveHelper: {
    saveImageUrl: (
      telegramId: string,
      url: string,
      modelName: string,
      prompt: string
    ) => Promise<any>
  }
  downloadFile: (url: string) => Promise<Buffer>
  logger: {
    info: (message: string, details?: any) => void
    error: (message: string, details?: any) => void
  }
  telegramSceneAdapter: {
    onGenerationStart: (ctx: MyContext, telegramId: string) => Promise<void>
    onGenerationComplete: (
      ctx: MyContext,
      telegramId: string,
      urls: string[]
    ) => Promise<void>
    onError: (
      ctx: MyContext,
      telegramId: string,
      error: string
    ) => Promise<void>
  }
}

/**
 * Input parameters for the generateNeuroPhoto function.
 */
export interface NeuroPhotoInput {
  prompt: string
  modelUrl: string
  numImages: number
  telegramId: string
  ctx: MyContext
  botName: string
}

/**
 * Output result from the generateNeuroPhoto function.
 */
export interface NeuroPhotoResult {
  success: boolean
  urls?: string[]
}
