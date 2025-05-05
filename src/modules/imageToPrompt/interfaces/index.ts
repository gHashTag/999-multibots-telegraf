import type { MyContext } from '@/interfaces'

/**
 * Dependencies interface for ImageToPrompt module.
 * This ensures that external services are injected rather than directly imported.
 */
export interface ImageToPromptDependencies {
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
  imageAnalysisApi: {
    run: (imageUrl: string) => Promise<any>
  }
  saveHelper: {
    savePrompt: (
      telegramId: string,
      prompt: string,
      imageUrl: string
    ) => Promise<any>
  }
  downloadFile: (url: string) => Promise<Buffer>
  logger: {
    info: (message: string, details?: any) => void
    error: (message: string, details?: any) => void
  }
  telegramSceneAdapter: {
    onAnalysisStart: (ctx: MyContext, telegramId: string) => Promise<void>
    onAnalysisComplete: (
      ctx: MyContext,
      telegramId: string,
      prompt: string
    ) => Promise<void>
    onError: (
      ctx: MyContext,
      telegramId: string,
      error: string
    ) => Promise<void>
  }
}
