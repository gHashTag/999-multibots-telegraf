import { replicate } from '@/core/replicate' // Import replicate client
import { VIDEO_MODELS_CONFIG } from './VIDEO_MODELS_CONFIG' // Import model config
import { downloadFile, DownloadFunction } from './downloadFile' // Use relative path
import {
  ImageToVideoRequest,
  ImageToVideoResponse,
  ImageToVideoDependencies,
  MinimalLogger,
} from './types' // Use relative path

/**
 * Generates video from image using Replicate API.
 * @param request - Request parameters including imageUrl, prompt, videoModel (ID).
 * @param dependencies - Service dependencies (logger, downloadFile, replicateClient).
 */
export async function generateImageToVideo(
  request: ImageToVideoRequest,
  dependencies: ImageToVideoDependencies
): Promise<ImageToVideoResponse> {
  // Default to dependencies injected, but allow using global/local ones if not provided
  const logger = dependencies.logger
  const replicateToUse = dependencies.replicateClient || replicate
  const dlFile = dependencies.downloadFile || downloadFile

  const { imageUrl, prompt, videoModel, metadata, locale } = request

  try {
    logger.info('Starting Replicate image-to-video generation...', {
      imageUrl: imageUrl,
      videoModel,
      userId: metadata?.userId,
    })

    // 1. Validate input
    if (!imageUrl) throw new Error('Image URL is required')
    if (!prompt) throw new Error('Prompt is required') // Keep prompt for models that might use it
    if (!videoModel) throw new Error('Video model ID is required')

    // 2. Get Model Config
    const modelConfig = VIDEO_MODELS_CONFIG[videoModel]
    if (!modelConfig) {
      throw new Error(`Unsupported video model ID: ${videoModel}`)
    }
    if (!modelConfig.inputType.includes('image')) {
      throw new Error(`Model ${videoModel} does not support image input.`)
    }
    logger.info(`Using model config for: ${videoModel}`, {
      modelId: modelConfig.api.model,
    })

    // 3. Download the image
    logger.info(`Downloading image from ${imageUrl}...`)
    let imageBuffer: Buffer
    try {
      imageBuffer = await dlFile(imageUrl)
    } catch (downloadError) {
      logger.error('Failed to download image:', downloadError)
      throw new Error('Failed to download source image')
    }
    logger.info(`Image downloaded successfully (${imageBuffer.length} bytes).`)

    // 4. Prepare Input for Replicate
    const modelInput: Record<string, any> = {
      ...modelConfig.api.input, // Base input params from config
      prompt, // Include prompt even if model primarily uses image
      // Add aspect_ratio if needed by the specific model or use a default/user setting
      // aspect_ratio: '16:9', // Example - this might need to come from user or request
    }

    // Dynamically add the image buffer using the correct key from config
    const imageKey = modelConfig.imageKey || 'image' // Default to 'image' if not specified
    // Replicate client expects a data URI or a publicly accessible URL.
    // Convert buffer to data URI (Base64).
    const imageMime = 'image/jpeg' // Assuming JPEG, might need detection later
    const imageDataUri = `data:${imageMime};base64,${imageBuffer.toString('base64')}`
    modelInput[imageKey] = imageDataUri // Pass data URI to Replicate
    logger.info('Prepared Replicate input:', {
      inputKeys: Object.keys(modelInput),
      imageKeyUsed: imageKey,
    })

    // 5. Call Replicate API
    logger.info(`Calling Replicate model: ${modelConfig.api.model}`)
    const output = await replicateToUse.run(
      modelConfig.api.model as `${string}/${string}:${string}`,
      { input: modelInput }
    )

    // 6. Process Output
    let videoUrl: string | undefined
    if (
      Array.isArray(output) &&
      output.length > 0 &&
      typeof output[0] === 'string'
    ) {
      videoUrl = output[0]
    } else if (typeof output === 'string') {
      videoUrl = output
    } else {
      logger.error('Unexpected output format from Replicate:', { output })
      throw new Error('Unexpected output format from video generation API')
    }

    if (!videoUrl || !videoUrl.startsWith('http')) {
      logger.error('Invalid video URL received from Replicate:', { videoUrl })
      throw new Error('Invalid video URL received from API')
    }

    logger.info(`Generated video URL via Replicate: ${videoUrl}`)

    // 7. Return success response with the Replicate URL
    return {
      success: true,
      videoUrl: videoUrl, // Return the direct URL from Replicate
      message: 'Video generated successfully via Replicate.',
    }
  } catch (error) {
    logger.error('Error during Replicate image-to-video generation:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      videoModel,
      telegram_id: metadata?.userId,
    })
    const errorMessage =
      locale?.language === 'ru'
        ? 'Произошла ошибка при генерации видео через Replicate.'
        : 'An error occurred during Replicate video generation.'

    if (error instanceof Error) {
      throw new Error(`${errorMessage} Details: ${error.message}`)
    } else {
      throw new Error(`${errorMessage} Unknown error.`)
    }
  }
}
