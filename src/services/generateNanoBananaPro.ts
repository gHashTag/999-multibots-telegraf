import { fal } from '@fal-ai/client'
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
    // ✅ ИСПРАВЛЕНО: Используем process.env.FAL_KEY напрямую (как в generateNeuroPhotoDirect.ts)
    const FAL_KEY = process.env.FAL_KEY
    if (!FAL_KEY) {
      throw new Error(
        'FAL_KEY not found in environment. Ensure Infisical loaded secrets.'
      )
    }

    // Configure Fal client
    fal.config({
      credentials: FAL_KEY,
    })

    // Determine aspect ratio
    let aspectRatio = request.aspectRatio || '9:16'

    // If width/height provided, calculate aspect ratio
    if (request.width && request.height) {
      const ratio = request.width / request.height
      // Границы — СЕРЕДИНЫ между соседними соотношениями, иначе корзины
      // съезжают. Прежние пороги ошибались на 4 из 10 канонических форматов:
      // 9:16 (0.5625) попадало в '2:3', 2:3 (0.667) — в '3:4',
      // 3:4 (0.75) — в '4:5', 5:4 (1.25) — в '4:3'. То есть пользователь,
      // приславший вертикальные 1080×1920, получал 2:3.
      if (ratio > 2.0556)
        aspectRatio = '21:9' // 21:9=2.333 | 16:9=1.778
      else if (ratio > 1.6389)
        aspectRatio = '16:9' // 16:9=1.778 | 3:2=1.5
      else if (ratio > 1.4167)
        aspectRatio = '3:2' // 3:2=1.5 | 4:3=1.333
      else if (ratio > 1.2917)
        aspectRatio = '4:3' // 4:3=1.333 | 5:4=1.25
      else if (ratio > 1.125)
        aspectRatio = '5:4' // 5:4=1.25 | 1:1=1.0
      else if (ratio > 0.9)
        aspectRatio = '1:1' // 1:1=1.0 | 4:5=0.8
      else if (ratio > 0.775)
        aspectRatio = '4:5' // 4:5=0.8 | 3:4=0.75
      else if (ratio > 0.7083)
        aspectRatio = '3:4' // 3:4=0.75 | 2:3=0.667
      else if (ratio > 0.6146)
        aspectRatio = '2:3' // 2:3=0.667 | 9:16=0.5625
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
      onQueueUpdate: update => {
        if (update.status === 'IN_PROGRESS') {
          logger.info('[NANO BANANA PRO] Generation in progress', {
            logs: update.logs?.map(log => log.message),
          })
        }
      },
    })

    const duration = Date.now() - startTime

    // Validate response
    if (!result.data.images || result.data.images.length === 0) {
      throw new Error('No images generated')
    }

    logger.info('[NANO BANANA PRO] Generation completed', {
      duration: `${duration}ms`,
      imagesCount: result.data.images.length,
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
  return [
    '21:9',
    '16:9',
    '3:2',
    '4:3',
    '5:4',
    '1:1',
    '4:5',
    '3:4',
    '2:3',
    '9:16',
  ]
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
