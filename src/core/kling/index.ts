/**
 * Kling Morphing Video Module
 * Provides functions for creating morphing videos using Kling models via Replicate
 */

import { replicate } from '@/core/replicate'
import { logger } from '@/utils/logger'
export type MorphingType = 'seamless' | 'loop'
import { VIDEO_MODELS_CONFIG } from '@/config/unified-video-models.config'
import fs from 'fs'

// Kling models that support morphing (with start_image + end_image)
const KLING_MORPHING_MODELS = [
  'kling-v2.1-pro', // Primary model for morphing (1080p, supports end_image)
  'kling-v1.6-pro', // Fallback 1
  'kling-v1.6-standard', // Fallback 2
] as const

// Get model configurations from unified config
const getKlingModelConfig = (modelId: string) => {
  const config = VIDEO_MODELS_CONFIG[modelId]
  if (!config) {
    throw new Error(`Model config not found for morphing: ${modelId}`)
  }
  return {
    id: config.apiModel, // API model ID for Replicate (e.g., 'kwaivgi/kling-v2.1')
    configId: config.id, // ID from unified config (e.g., 'kling-v2.1-pro')
    name: config.name,
    variant: config.apiSettings?.baseInput?.model_variant || config.apiSettings?.baseInput?.mode || 'pro',
    baseInput: config.apiSettings?.baseInput || {},
  }
}

interface ImageFile {
  filename: string
  path: string
  order: number
}

interface MorphingResult {
  success: boolean
  video_url?: string
  error?: string
}

/**
 * Creates a morphing video from two images using Kling model
 * @param images - Array of two image files (with filename, path, order)
 * @param morphingType - Type of morphing (seamless or loop)
 * @param telegramId - Telegram user ID for logging
 * @returns Promise with morphing result
 */
export async function createKlingMorphingVideo(
  images: ImageFile[],
  morphingType: MorphingType,
  telegramId: string
): Promise<MorphingResult> {
  try {
    if (!images || images.length !== 2) {
      return {
        success: false,
        error: 'Exactly 2 images are required for morphing',
      }
    }

    const [image1, image2] = images

    // Validate image files exist
    if (!fs.existsSync(image1.path)) {
      return {
        success: false,
        error: `Image 1 file not found: ${image1.path}`,
      }
    }

    if (!fs.existsSync(image2.path)) {
      return {
        success: false,
        error: `Image 2 file not found: ${image2.path}`,
      }
    }

    logger.info('🧬 Starting Kling morphing video generation', {
      telegramId,
      image1: image1.filename,
      image2: image2.filename,
      morphingType,
    })

    // Read images and convert to base64
    const image1Base64 = fs.readFileSync(image1.path, 'base64')
    const image2Base64 = fs.readFileSync(image2.path, 'base64')

    // Default prompt for smooth morphing
    const defaultPrompt =
      'smooth cinematic transition, elegant morphing between frames, constant camera movement, soft cinematic lighting, professional cinematography, motion blur, 4k quality'

    // Try each model in order until one succeeds
    let lastError: string | undefined

    for (const modelId of KLING_MORPHING_MODELS) {
      try {
        const modelConfig = getKlingModelConfig(modelId)

        logger.info(`🔄 Trying Kling model: ${modelConfig.name}`, {
          telegramId,
          modelId: modelConfig.configId,
          apiModel: modelConfig.id,
        })

        // Prepare input for Replicate
        const input: any = {
          start_image: `data:image/jpeg;base64,${image1Base64}`,
          end_image: `data:image/jpeg;base64,${image2Base64}`,
          prompt: defaultPrompt,
          duration: 5, // 5 seconds
          ...modelConfig.baseInput,
        }

        // Add model_variant if variant is specified
        if (modelConfig.variant) {
          input.model_variant =
            modelConfig.variant === 'standard' ? 'std' : modelConfig.variant
          // Для обратной совместимости также передаем mode
          input.mode = input.model_variant
        }

        // Call Replicate API
        const output = await replicate.run(modelConfig.id, { input })

        // Result can be an array of URLs or a single URL
        const videoUrl = Array.isArray(output) ? output[0] : output

        if (!videoUrl || typeof videoUrl !== 'string') {
          throw new Error(`Empty or invalid output from Replicate`)
        }

        logger.info('✅ Kling morphing video generated successfully', {
          telegramId,
          model: modelConfig.name,
          videoUrl: videoUrl.substring(0, 100) + '...',
        })

        return {
          success: true,
          video_url: videoUrl,
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)

        logger.warn(`⚠️ Model ${modelId} failed, trying next...`, {
          telegramId,
          modelId,
          error: errorMessage,
        })

        lastError = errorMessage

        // If it's a content filter error, continue to next model
        if (
          errorMessage.includes('flagged as sensitive') ||
          errorMessage.includes('E005')
        ) {
          continue
        }

        // For other errors, also try next model
        continue
      }
    }

    // All models failed
    return {
      success: false,
      error: `All Kling models failed. Last error: ${lastError || 'Unknown error'}`,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    logger.error('❌ Kling morphing video generation failed', {
      telegramId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      error: errorMessage,
    }
  }
}








