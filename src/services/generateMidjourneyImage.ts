import { replicate } from '@/core/replicate'
import { logger } from '@/utils/logger'
import axios from 'axios'

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

    // Construct input for founderfeed/midjourney model
    const input: any = {
      prompt: request.prompt,
      version: '7', // Midjourney v7
      quality: '1', // Standard quality (0.25, 0.5, 1, 2)
      seed: -1, // Random seed
      chaos: 0, // Chaos level (0-100)
      stylize: 0, // Stylization level (0-1000)
      weird: 0, // Weirdness factor (0-3000)
      niji: 'close', // Not using Niji anime model
      enable_base64_output: false,
    }

    // Set aspect ratio for founderfeed/midjourney
    if (request.aspectRatio) {
      input.aspect_ratio = request.aspectRatio
      logger.info('[Midjourney v7] Using aspect_ratio parameter', {
        aspectRatio: request.aspectRatio,
      })
    } else {
      input.aspect_ratio = '1:1'
      logger.info('[Midjourney v7] Using default aspect_ratio', {
        aspect_ratio: '1:1',
      })
    }

    logger.info('[Midjourney v7] Final input params', {
      model: 'founderfeed/midjourney',
      aspect_ratio: input.aspect_ratio,
      prompt: input.prompt.substring(0, 100),
    })

    // Run Midjourney model via Replicate
    logger.info('[Midjourney v7] Calling replicate.run...')
    const output = await replicate.run(
      'founderfeed/midjourney',
      {
        input,
      }
    )

    const processingTime = Date.now() - startTime

    logger.info('[Midjourney v7] Processing output', {
      outputType: typeof output,
      isArray: Array.isArray(output),
      hasOutput: !!output,
    })

    // Extract image URLs from output with multiple formats support
    let imageUrls: string[] = []

    if (Array.isArray(output)) {
      logger.info('[Midjourney v7] Output is array', { length: output.length })
      imageUrls = output.filter(url => typeof url === 'string')
    } else if (typeof output === 'string') {
      logger.info('[Midjourney v7] Output is string', { length: output.length })
      imageUrls = [output]
    } else if (output && typeof output === 'object') {
      logger.info('[Midjourney v7] Output is object', { keys: Object.keys(output) })
      // Handle object format: { output: [...], ... }
      if (Array.isArray(output.output)) {
        imageUrls = output.output.filter(url => typeof url === 'string')
      } else if (typeof output.output === 'string') {
        imageUrls = [output.output]
      } else if (typeof output.url === 'string') {
        imageUrls = [output.url]
      }
    }

    logger.info('[Midjourney v7] Extracted URLs', {
      count: imageUrls.length,
      urls: imageUrls.map(url => url.substring(0, 100)),
    })

    if (imageUrls.length === 0) {
      logger.error('[Midjourney v7] No URLs extracted', {
        outputType: typeof output,
        isArray: Array.isArray(output),
        outputKeys: output ? Object.keys(output) : null,
      })
      throw new Error(`No image URLs returned from model. Output type: ${typeof output}, Output: ${JSON.stringify(output)}`)
    }

    // Validate that URLs are accessible and are images
    const validatedUrls: string[] = []
    for (const url of imageUrls) {
      try {
        const response = await axios.head(url, { timeout: 5000 })
        const contentType = response.headers['content-type'] || ''
        if (contentType.startsWith('image/')) {
          validatedUrls.push(url)
        } else {
          logger.warn('[Midjourney v7] Skipping URL - not an image', {
            url: url.substring(0, 100),
            contentType,
          })
        }
      } catch (error) {
        logger.warn('[Midjourney v7] Failed to validate URL', {
          url: url.substring(0, 100),
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }

    if (validatedUrls.length === 0) {
      throw new Error('All returned URLs are invalid or not images')
    }

    // Calculate cost
    const costUSD = 0.15 * (request.numImages || 1)
    const STAR_COST_USD = 0.016
    const costStars = Math.floor(costUSD / STAR_COST_USD)

    logger.info('[Midjourney v7] Image generation completed successfully', {
      processingTime,
      imageCount: validatedUrls.length,
      firstImageUrl: validatedUrls[0]?.substring(0, 100),
      costUSD,
      costStars,
    })

    return {
      success: true,
      imageUrl: validatedUrls[0],
      imageUrls: validatedUrls,
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
