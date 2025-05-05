import type { MyContext } from '@/interfaces'
import { ImageToPromptDependencies } from './interfaces'
import { generatePromptFromImageService } from './services/generatePromptFromImageService'

/**
 * Main function for generating a prompt from an image.
 * @param imageUrl URL of the image to analyze.
 * @param telegramId User's Telegram ID.
 * @param ctx Telegram context for sending messages.
 * @param botName Name of the bot handling the request.
 * @param dependencies Injected dependencies for isolation.
 * @returns Promise with the result of the prompt generation.
 */
export async function generatePromptFromImage(
  imageUrl: string,
  telegramId: string,
  ctx: MyContext,
  botName: string,
  dependencies: ImageToPromptDependencies
): Promise<{ success: boolean; prompt?: string } | null> {
  return await generatePromptFromImageService(
    imageUrl,
    telegramId,
    ctx,
    botName,
    dependencies
  )
}
