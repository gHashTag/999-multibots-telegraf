import { replicate } from '@/core/replicate'
import { logger } from '@/utils/logger'

/**
 * Result of avatar analysis
 */
export interface AvatarAnalysisResult {
  hasFace: boolean
  gender: 'male' | 'female' | 'unknown'
  confidence: number
  avatarUrl: string | null
  error?: string
}

/**
 * Analyze avatar image using Replicate vision model
 * Detects if there's a human face and determines gender
 *
 * Uses Moondream2 - fast and efficient vision model
 * Model: vikhyatk/moondream2
 * Cost: ~$0.0001 per image (very cheap)
 */
export async function analyzeAvatar(
  imageUrl: string
): Promise<AvatarAnalysisResult> {
  const defaultResult: AvatarAnalysisResult = {
    hasFace: false,
    gender: 'unknown',
    confidence: 0,
    avatarUrl: imageUrl,
  }

  if (!imageUrl) {
    logger.warn('[AnalyzeAvatar] No image URL provided')
    return { ...defaultResult, error: 'No image URL' }
  }

  try {
    logger.info('[AnalyzeAvatar] Starting analysis', {
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // Use Moondream2 - fast vision model for image analysis
    // Model: lucataco/moondream2 (updated from vikhyatk/moondream2)
    // Prompt designed to get structured response about face and gender
    const output = await replicate.run(
      'lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31' as any,
      {
        input: {
          image: imageUrl,
          prompt:
            'Analyze this image. Answer these questions:\n1. Is there a human face clearly visible in this image? (yes/no)\n2. If yes, what is the apparent gender of the person? (male/female/unclear)\nAnswer in format: FACE:yes/no GENDER:male/female/unclear',
        },
      }
    )

    logger.info('[AnalyzeAvatar] Raw response', { output })

    // Parse the response
    const response = String(output).toLowerCase()

    // Detect face presence
    const hasFace =
      response.includes('face:yes') ||
      (response.includes('yes') && !response.includes('no face')) ||
      response.includes('human face') ||
      response.includes('person')

    // Detect gender
    let gender: 'male' | 'female' | 'unknown' = 'unknown'
    let confidence = 0

    if (hasFace) {
      if (
        response.includes('gender:male') ||
        (response.includes('male') && !response.includes('female'))
      ) {
        gender = 'male'
        confidence = 80
      } else if (
        response.includes('gender:female') ||
        response.includes('female') ||
        response.includes('woman')
      ) {
        gender = 'female'
        confidence = 80
      } else if (response.includes('man') && !response.includes('woman')) {
        gender = 'male'
        confidence = 70
      } else {
        // Couldn't determine gender
        gender = 'unknown'
        confidence = 50
      }
    }

    const result: AvatarAnalysisResult = {
      hasFace,
      gender,
      confidence,
      avatarUrl: imageUrl,
    }

    logger.info('[AnalyzeAvatar] Analysis complete', result)
    return result
  } catch (error) {
    logger.error('[AnalyzeAvatar] Analysis failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    return {
      ...defaultResult,
      error: error instanceof Error ? error.message : 'Analysis failed',
    }
  }
}

/**
 * Quick check if image has a face (without gender detection)
 * Uses simpler prompt for faster response
 */
export async function quickFaceCheck(imageUrl: string): Promise<boolean> {
  try {
    const output = await replicate.run(
      'lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31' as any,
      {
        input: {
          image: imageUrl,
          prompt: 'Is there a human face in this image? Answer only yes or no.',
        },
      }
    )

    const response = String(output).toLowerCase()
    return response.includes('yes')
  } catch (error) {
    logger.error('[QuickFaceCheck] Failed', { error })
    return false
  }
}
