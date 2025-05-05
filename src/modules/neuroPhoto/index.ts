import type { MyContext } from '@/interfaces'
import { NeuroPhotoDependencies } from './interfaces'
import { generateNeuroPhotoService } from './services/generateNeuroPhotoService'

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
 * Main function for generating neuro photos.
 * @param prompt The prompt for image generation.
 * @param modelUrl The URL of the model to use.
 * @param numImages Number of images to generate.
 * @param telegramId User's Telegram ID.
 * @param ctx Telegram context for sending messages.
 * @param botName Name of the bot handling the request.
 * @param dependencies Injected dependencies for isolation.
 * @returns Promise with the result of the generation.
 */
export async function generateNeuroPhoto(
  prompt: string,
  modelUrl: string,
  numImages: number,
  telegramId: string,
  ctx: MyContext,
  botName: string,
  dependencies: NeuroPhotoDependencies
): Promise<{ success: boolean; urls?: string[] } | null> {
  return await generateNeuroPhotoService(
    prompt,
    modelUrl,
    numImages,
    telegramId,
    ctx,
    botName,
    dependencies
  )
}
