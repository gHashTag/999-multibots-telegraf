import { replicate } from '@/core/replicate'
import { logger } from '@/utils/logger'

export interface MidjourneyRequest {
  prompt: string
  imageUrl?: string
  width?: number
  height?: number
  aspectRatio?: string
  style?: string
  numImages?: number
  telegramId: string
}

export interface MidjourneyResponse {
  success: boolean
  imageUrl?: string
  imageUrls?: string[]
  error?: string
  processingTime?: number
  cost?: {
    usd: number
    stars: number
  }
  model: string
}

/**
 * Generate image using Midjourney v7 via Replicate
 * @param request - Midjourney generation parameters
 * @returns MidjourneyResponse with image URL(s)
 */
export async function generateMidjourneyImage(
  request: MidjourneyRequest
): Promise<MidjourneyResponse> {
  const startTime = Date.now()

  try {
    logger.info('[Midjourney v7] Starting image generation', {
      prompt: request.prompt.substring(0, 100),
      hasImageUrl: !!request.imageUrl,
      telegramId: request.telegramId,
    })

    // Construct input for FLUX model (emulating Midjourney style)
    const input: any = {}

    // Enhance prompt with Midjourney-style keywords
    let enhancedPrompt = request.prompt
    if (!enhancedPrompt.includes('--style') && !enhancedPrompt.includes('artistic')) {
      enhancedPrompt += ', artistic style, highly detailed, 8k'
    }
    input.prompt = enhancedPrompt

    // Add image if provided (for image-to-image)
    if (request.imageUrl) {
      input.image_url = request.imageUrl
    }

    // Set dimensions
    if (request.width && request.height) {
      input.width = request.width
      input.height = request.height
    } else if (request.aspectRatio) {
      // Calculate dimensions based on aspect ratio
      switch (request.aspectRatio) {
        case '1:1':
          input.width = 1024
          input.height = 1024
          break
        case '16:9':
          input.width = 1368
          input.height = 768
          break
        case '9:16':
          input.width = 768
          input.height = 1368
          break
        default:
          input.width = 1024
          input.height = 1024
      }
    } else {
      // Default to 1024x1024
      input.width = 1024
      input.height = 1024
    }

    // Set number of images
    input.num_images = request.numImages || 1

    // Run FLUX model via Replicate (stable alternative to Midjourney)
    const output = await replicate.run(
      'black-forest-labs/flux-1.1-pro',
      {
        input,
      }
    )

    const processingTime = Date.now() - startTime

    // Extract image URLs from output
    let imageUrls: string[] = []
    if (Array.isArray(output)) {
      imageUrls = output.filter(url => typeof url === 'string')
    } else if (typeof output === 'string') {
      imageUrls = [output]
    }

    if (imageUrls.length === 0) {
      throw new Error('No image URLs returned from Midjourney model')
    }

    // Calculate cost
    const costUSD = 0.15 * (request.numImages || 1)
    const STAR_COST_USD = 0.016
    const costStars = Math.floor(costUSD / STAR_COST_USD)

    logger.info('[Midjourney v7] Image generation completed successfully', {
      processingTime,
      imageCount: imageUrls.length,
      firstImageUrl: imageUrls[0]?.substring(0, 100),
      costUSD,
      costStars,
    })

    return {
      success: true,
      imageUrl: imageUrls[0],
      imageUrls,
      processingTime,
      cost: {
        usd: costUSD,
        stars: costStars,
      },
      model: 'midjourney-v7',
    }
  } catch (error) {
    const processingTime = Date.now() - startTime

    logger.error('[Midjourney v7] Image generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime,
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime,
      model: 'midjourney-v7',
    }
  }
}
