import type { MyContext } from '@/interfaces'
import { NeuroPhotoDependencies } from '../interfaces'

/**
 * Core service for generating neuro photos in the NeuroPhoto module.
 * This service handles the business logic for image generation, interacting with injected dependencies.
 * @param prompt The prompt for image generation.
 * @param modelUrl The URL of the model to use.
 * @param numImages Number of images to generate.
 * @param telegramId User's Telegram ID.
 * @param ctx Telegram context for sending messages.
 * @param botName Name of the bot handling the request.
 * @param dependencies Injected dependencies for isolation.
 * @returns Promise with the result of the generation.
 */
export async function generateNeuroPhotoService(
  prompt: string,
  modelUrl: string,
  numImages: number,
  telegramId: string,
  ctx: MyContext,
  botName: string,
  dependencies: NeuroPhotoDependencies
): Promise<{ success: boolean; urls?: string[] } | null> {
  // Validate inputs
  if (!prompt) {
    dependencies.logger.error('No prompt provided for neuro photo generation', {
      telegramId,
    })
    await dependencies.telegramSceneAdapter.onError(
      ctx,
      telegramId,
      'Prompt not provided'
    )
    return null
  }
  if (!modelUrl) {
    dependencies.logger.error(
      'No model URL provided for neuro photo generation',
      { telegramId }
    )
    await dependencies.telegramSceneAdapter.onError(
      ctx,
      telegramId,
      'Model URL not provided'
    )
    return null
  }

  // Get user data
  const user = await dependencies.userHelper.getUser(telegramId)
  if (!user) {
    dependencies.logger.error('User not found for neuro photo generation', {
      telegramId,
    })
    await dependencies.telegramSceneAdapter.onError(
      ctx,
      telegramId,
      'User not found'
    )
    return null
  }

  // Calculate cost (simplified for now)
  const costPerImage = 10 // Placeholder cost
  const totalCost = costPerImage * numImages

  // Process balance
  const balanceResult = await dependencies.balanceHelper.processBalance(
    telegramId,
    totalCost,
    'neuro_photo',
    modelUrl
  )
  if (!balanceResult.success) {
    dependencies.logger.error('Insufficient funds for neuro photo generation', {
      telegramId,
      totalCost,
    })
    await dependencies.telegramSceneAdapter.onError(
      ctx,
      telegramId,
      'Insufficient funds'
    )
    return { success: false }
  }

  // Notify user of start
  await dependencies.telegramSceneAdapter.onGenerationStart(ctx, telegramId)
  dependencies.logger.info('Starting neuro photo generation', {
    telegramId,
    prompt,
    modelUrl,
    numImages,
  })

  // Generate images
  const generatedUrls: string[] = []
  try {
    for (let i = 0; i < numImages; i++) {
      const result = await dependencies.imageGenerationApi.run(modelUrl, {
        prompt,
      })
      if (result && result.length > 0) {
        generatedUrls.push(result[0])
        dependencies.logger.info(`Generated image ${i + 1}/${numImages}`, {
          telegramId,
          url: result[0],
        })
      }
    }
  } catch (error) {
    dependencies.logger.error('Error during neuro photo generation', {
      telegramId,
      error,
    })
    await dependencies.telegramSceneAdapter.onError(
      ctx,
      telegramId,
      'Generation error'
    )
    return { success: false }
  }

  // Save URLs (simplified for now)
  for (const url of generatedUrls) {
    await dependencies.saveHelper.saveImageUrl(
      telegramId,
      url,
      modelUrl,
      prompt
    )
  }

  // Notify user of completion
  await dependencies.telegramSceneAdapter.onGenerationComplete(
    ctx,
    telegramId,
    generatedUrls
  )
  dependencies.logger.info('Neuro photo generation completed', {
    telegramId,
    generatedUrls,
  })

  return { success: true, urls: generatedUrls }
}
