import { replicate } from '@/core/replicate'
import { logger } from '@/utils/logger'

export interface FaceSwapRequest {
  targetImageUrl: string // input_image - the person whose face will be replaced
  swapImageUrl: string // swap_image - the face to swap in
}

export interface FaceSwapResponse {
  success: boolean
  resultUrl?: string
  error?: string
  processingTime?: number
  cost?: {
    usd: number
    stars: number
  }
}

/**
 * Generate face-swapped image using Replicate's codeplugtech/face-swap model
 * @param request - Face swap parameters
 * @returns FaceSwapResponse with result URL
 */
export async function generateFaceSwap(
  request: FaceSwapRequest
): Promise<FaceSwapResponse> {
  const startTime = Date.now()

  try {
    logger.info('[FaceSwap] Starting face swap generation', {
      targetImageUrl: request.targetImageUrl.substring(0, 100),
      swapImageUrl: request.swapImageUrl.substring(0, 100),
    })

    const output = await replicate.run(
      'codeplugtech/face-swap:278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34',
      {
        input: {
          input_image: request.targetImageUrl,
          swap_image: request.swapImageUrl,
        },
      }
    )

    const processingTime = Date.now() - startTime

    // Output is a single URL string
    const resultUrl =
      typeof output === 'string' ? output : (output as any)?.[0] || ''

    if (!resultUrl) {
      throw new Error('No result URL returned from face-swap model')
    }

    // Calculate cost (estimated at $0.01 per face swap based on Replicate pricing)
    const costUSD = 0.01
    const STAR_COST_USD = 0.016
    const costStars = Math.floor(costUSD / STAR_COST_USD)

    logger.info('[FaceSwap] Face swap completed successfully', {
      processingTime,
      resultUrl: resultUrl.substring(0, 100),
      costUSD,
      costStars,
    })

    return {
      success: true,
      resultUrl,
      processingTime,
      cost: {
        usd: costUSD,
        stars: costStars,
      },
    }
  } catch (error) {
    const processingTime = Date.now() - startTime

    logger.error('[FaceSwap] Face swap failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      targetImageUrl: request.targetImageUrl,
      swapImageUrl: request.swapImageUrl,
      processingTime,
    })

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error occurred during face swap',
      processingTime,
    }
  }
}
