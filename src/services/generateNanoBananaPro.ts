import { fal } from '@fal-ai/client'
import { FAL_KEY } from '@/config'
import { logger } from '@/utils/logger'

interface NanoBananaProRequest {
  prompt: string
  numImages?: number
  aspectRatio?: string
  width?: number
  height?: number
  telegramId?: string
  resolution?: '1K' | '2K' | '4K'
  outputFormat?: 'jpeg' | 'png' | 'webp'
}

interface NanoBananaProResponse {
  images: Array<{
    url: string
    width: number
    height: number
    content_type: string
  }>
  description?: string
}

/**
 * Generate images using Fal.ai's Nano Banana Pro model
 * Google's state-of-the-art image generation with excellent realism and typography
 * 
 * Pricing: $0.0398 per image (25 images per $1)
 * Provider: Fal.ai
 * Model: fal-ai/nano-banana-pro
 */
export async function generateNanoBananaPro(
  request: NanoBananaProRequest
): Promise<NanoBananaProResponse> {
  const startTime = Date.now()

  logger.info('[NANO BANANA PRO] Starting image generation', {
    prompt: request.prompt.substring(0, 100),
    numImages: request.numImages,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    telegramId: request.telegramId,
  })

  try {
    // Configure Fal client
    fal.config({
      credentials: FAL_KEY,
    })

    // Determine aspect ratio
    let aspectRatio = request.aspectRatio || '1:1'
    
    // If width/height provided, calculate aspect ratio
    if (request.width && request.height) {
      const ratio = request.width / request.height
      if (ratio > 2.2) aspectRatio = '21:9'
      else if (ratio > 1.7) aspectRatio = '16:9'
      else if (ratio > 1.4) aspectRatio = '3:2'
      else if (ratio > 1.2) aspectRatio = '4:3'
      else if (ratio > 1.1) aspectRatio = '5:4'
      else if (ratio > 0.9) aspectRatio = '1:1'
      else if (ratio > 0.7) aspectRatio = '4:5'
      else if (ratio > 0.6) aspectRatio = '3:4'
      else if (ratio > 0.5) aspectRatio = '2:3'
      else aspectRatio = '9:16'
    }

    // Determine resolution based on dimensions
    let resolution: '1K' | '2K' | '4K' = request.resolution || '1K'
    if (request.width && request.width > 2048) {
      resolution = '4K'
    } else if (request.width && request.width > 1024) {
      resolution = '2K'
    }

    const input = {
      prompt: request.prompt,
      num_images: request.numImages || 1,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      output_format: (request.outputFormat || 'png') as 'jpeg' | 'png' | 'webp',
    }

    logger.info('[NANO BANANA PRO] Submitting request to Fal.ai', { input })

    // Submit request to Fal.ai
    const result = await fal.subscribe('fal-ai/nano-banana-pro', {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          logger.info('[NANO BANANA PRO] Generation in progress', {
            logs: update.logs?.map((log) => log.message),
          })
        }
      },
    })

    const duration = Date.now() - startTime

    logger.info('[NANO BANANA PRO] Generation completed', {
      duration: `${duration}ms`,
      imagesCount: result.data.images?.length || 0,
      requestId: result.requestId,
    })

    // Transform response to match expected format
    const images = result.data.images.map((img: any) => ({
      url: img.url,
      width: img.width || 1024,
      height: img.height || 1024,
      content_type: img.content_type || 'image/png',
    }))

    return {
      images,
      description: result.data.description,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    
    logger.error('[NANO BANANA PRO] Generation failed', {
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
      telegramId: request.telegramId,
    })

    throw new Error(
      `Nano Banana Pro generation failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/**
 * Helper function to get supported aspect ratios
 */
export function getSupportedAspectRatios(): string[] {
  return ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16']
}

/**
 * Helper function to get supported resolutions
 */
export function getSupportedResolutions(): Array<'1K' | '2K' | '4K'> {
  return ['1K', '2K', '4K']
}

/**
 * Helper function to get supported output formats
 */
export function getSupportedOutputFormats(): Array<'jpeg' | 'png' | 'webp'> {
  return ['jpeg', 'png', 'webp']
}
