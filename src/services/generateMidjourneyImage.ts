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

    // Construct input for tstramer/midjourney-diffusion model
    // Map aspect ratio to width/height
    let width = 768
    let height = 768

    if (request.aspectRatio) {
      const aspectRatioMap: Record<string, { width: number; height: number }> = {
        '1:1': { width: 768, height: 768 },
        '16:9': { width: 1024, height: 576 },
        '9:16': { width: 576, height: 1024 },
        '4:3': { width: 1024, height: 768 },
        '3:4': { width: 768, height: 1024 },
      }

      if (aspectRatioMap[request.aspectRatio]) {
        width = aspectRatioMap[request.aspectRatio].width
        height = aspectRatioMap[request.aspectRatio].height
        logger.info('[Midjourney v7] Using aspect_ratio mapping', {
          aspectRatio: request.aspectRatio,
          width,
          height,
        })
      }
    }

    const input: any = {
      prompt: request.prompt,
      width,
      height,
      num_outputs: 1,
      guidance_scale: 7.5, // Creativity control (1-20)
      num_inference_steps: 50, // Denoising steps (max 500)
      scheduler: 'DPMSolverMultistep', // Sampling method
    }

    logger.info('[Midjourney v7] Final input params', {
      model: 'tstramer/midjourney-diffusion',
      width,
      height,
      prompt: input.prompt.substring(0, 100),
    })

    // Run Midjourney model via Replicate
    logger.info('[Midjourney v7] Calling replicate.run...')
    const output = await replicate.run(
      'tstramer/midjourney-diffusion',
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
