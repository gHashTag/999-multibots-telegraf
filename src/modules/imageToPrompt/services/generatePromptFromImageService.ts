import type { MyContext } from '@/interfaces'
import { ImageToPromptDependencies } from '../interfaces'

/**
 * Core service for generating a textual prompt from an image in the ImageToPrompt module.
 * This service handles the business logic for image analysis, interacting with injected dependencies.
 * @param imageUrl URL of the image to analyze.
 * @param telegramId User's Telegram ID.
 * @param ctx Telegram context for sending messages.
 * @param botName Name of the bot handling the request.
 * @param dependencies Injected dependencies for isolation.
 * @returns Promise with the result of the prompt generation.
 */
export async function generatePromptFromImageService(
  imageUrl: string,
  telegramId: string,
  ctx: MyContext,
  botName: string,
  dependencies: ImageToPromptDependencies
): Promise<{ success: boolean; prompt?: string } | null> {
  // Validate inputs
  if (!imageUrl) {
    dependencies.logger.error('No image URL provided for prompt generation', {
      telegramId,
    })
    await dependencies.telegramSceneAdapter.onError(
      ctx,
      telegramId,
      'Image URL not provided'
    )
    return null
  }

  // Get user data
  const user = await dependencies.userHelper.getUser(telegramId)
  if (!user) {
    dependencies.logger.error('User not found for prompt generation', {
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
  const cost = 5 // Placeholder cost for image analysis

  // Process balance
  const balanceResult = await dependencies.balanceHelper.processBalance(
    telegramId,
    cost,
    'image_to_prompt',
    'image-analysis-model'
  )
  if (!balanceResult.success) {
    dependencies.logger.error('Insufficient funds for prompt generation', {
      telegramId,
      cost,
    })
    await dependencies.telegramSceneAdapter.onError(
      ctx,
      telegramId,
      'Insufficient funds'
    )
    return { success: false }
  }

  // Notify user of start
  await dependencies.telegramSceneAdapter.onAnalysisStart(ctx, telegramId)
  dependencies.logger.info('Starting image analysis for prompt generation', {
    telegramId,
    imageUrl,
  })

  // Analyze image to generate prompt
  let generatedPrompt: string = ''
  try {
    const result = await dependencies.imageAnalysisApi.run(imageUrl)
    if (result && result.prompt) {
      generatedPrompt = result.prompt
      dependencies.logger.info('Generated prompt from image', {
        telegramId,
        prompt: generatedPrompt,
      })
    } else {
      throw new Error('No prompt returned from analysis')
    }
  } catch (error) {
    dependencies.logger.error('Error during image analysis', {
      telegramId,
      error,
    })
    await dependencies.telegramSceneAdapter.onError(
      ctx,
      telegramId,
      'Analysis error'
    )
    return { success: false }
  }

  // Save the generated prompt
  await dependencies.saveHelper.savePrompt(
    telegramId,
    generatedPrompt,
    imageUrl
  )

  // Notify user of completion
  await dependencies.telegramSceneAdapter.onAnalysisComplete(
    ctx,
    telegramId,
    generatedPrompt
  )
  dependencies.logger.info('Prompt generation from image completed', {
    telegramId,
    generatedPrompt,
  })

  return { success: true, prompt: generatedPrompt }
}
