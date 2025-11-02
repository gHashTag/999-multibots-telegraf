/**
 * 🚨 🚨 🚨 CRITICAL WARNING 🚨 🚨 🚨
 * 
 * DO NOT MODIFY THIS FILE WITHOUT UNDERSTANDING!
 * 
 * Midjourney v7 configuration is protected by commit ae06c56e
 * 
 * REQUIREMENTS:
 * - Model MUST include version hash: adminconteudosflix/midjourney-allcraft:40ab9b32cc4584bc069e22027fffb97e79ed550d4e7c20ed6d5d7ef89e8f08f5
 * - Without version hash, model returns 404 and breaks Midjourney generation
 * - All parameters (go_fast, lora_scale, megapixels, etc.) are REQUIRED
 * 
 * PROTECTED FILES:
 * 1. generateMidjourneyImage.ts - DO NOT CHANGE MODEL URL
 * 2. IMAGES_MODELS.ts - previewImage URL must be valid
 * 3. imageModelPrices.ts - pricing config
 * 4. textToImageWizard/index.ts - Create new button logic
 * 5. generateTextToImageDirect.ts - octet-stream validation
 * 
 * Breaking these files will cause Midjourney v7 to fail in production!
 * 
 * 🤖 Generated with [Claude Code](https://claude.com/claude-code)
 * 
 */

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

    // Set aspect ratio for adminconteudosflix/midjourney-allcraft
    if (request.aspectRatio) {
      input.aspect_ratio = request.aspectRatio
      logger.info('[Midjourney v7] Using aspect_ratio parameter', {
        aspectRatio: request.aspectRatio,
        aspect_ratio: request.aspectRatio,
      })
    } else {
      input.aspect_ratio = '1:1'
      logger.info('[Midjourney v7] Using default aspect_ratio', {
        aspect_ratio: '1:1',
      })
    }

    // Set number of images
    input.num_outputs = request.numImages || 1

    // Set additional parameters for better quality (matching working example)
    input.go_fast = true
    input.lora_scale = 1
    input.megapixels = '1'
    input.num_outputs = request.numImages || 1
    input.output_format = 'webp'
    input.guidance_scale = 3
    input.output_quality = 100
    input.prompt_strength = 0.8
    input.extra_lora_scale = 1
    input.num_inference_steps = 38

    logger.info('[Midjourney v7] Final input params', {
      model: 'adminconteudosflix/midjourney-allcraft',
      aspect_ratio: input.aspect_ratio,
      num_outputs: input.num_outputs,
      hasImageUrl: !!input.image_url,
    })

    // Run Midjourney model via Replicate
    logger.info('[Midjourney v7] Calling replicate.run...')
    const output = await replicate.run(
      'adminconteudosflix/midjourney-allcraft:40ab9b32cc4584bc069e22027fffb97e79ed550d4e7c20ed6d5d7ef89e8f08f5',
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
        // Accept images or octet-stream (Replicate URLs sometimes return this initially)
        if (contentType.startsWith('image/') || contentType === 'application/octet-stream') {
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
