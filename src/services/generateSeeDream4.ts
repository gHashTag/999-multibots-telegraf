import { z } from 'zod'
import { ApiResponse, GenerationResult } from '@/interfaces'
import { replicate } from '@/core/replicate'
import { savePrompt } from '@/core/supabase'
import { downloadFile } from '@/helpers'
import { processApiResponse } from '@/helpers/error'
import { pulse } from '@/helpers/pulse'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { calculateFinalImageCostInStars } from '@/price/models/IMAGES_MODELS'
import { logger, logSessionSafely } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers'
import { refundUser } from '@/price/helpers/refundUser'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import fs from 'fs'
import { 
  SeeDream4InputSchema, 
  SeeDream4ResponseSchema, 
  SeeDream4Input,
  SeeDream4Response,
  SEEDREAM4_AVATAR_CONFIG,
  getSeeDream4Dimensions,
  validateSeeDream4Input
} from '@/schemas/seedream4.schema'

// Service parameters interface
export interface SeeDream4ServiceParams {
  prompt: string
  inputImageUrl?: string | string[] // ✅ Support both single URL and array of URLs
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  size?: '1K' | '2K' | '4K' | 'custom'
  width?: number
  height?: number
  max_images?: number
  aspect_ratio?: string
}

// SeeDream-4 model configuration
const SEEDREAM4_MODEL = {
  key: 'bytedance/seedream-4',
  costPerImage: calculateFinalImageCostInStars(0.05),
  name: 'SeeDream-4',
  description_en: 'ByteDance SeeDream-4 - Advanced image generation and transformation model',
  description_ru: 'ByteDance SeeDream-4 - Продвинутая модель генерации и трансформации изображений'
}

/**
 * Enhanced SeeDream-4 generation service with Zod validation
 * Supports both text-to-image and image-to-image generation
 */
export const generateSeeDream4 = async (
  params: SeeDream4ServiceParams
): Promise<GenerationResult> => {
  console.log('🎭 [SeeDream4] Service called with params:', {
    telegram_id: params.telegram_id,
    promptLength: params.prompt?.length,
    hasInputImage: !!params.inputImageUrl,
    size: params.size,
    username: params.username,
    is_ru: params.is_ru,
  })

  try {
    const {
      prompt,
      inputImageUrl,
      telegram_id,
      username,
      is_ru,
      ctx,
      size = '2K',
      width,
      height,
      max_images = 1,
      aspect_ratio = '9:16'
    } = params

    // ✅ PREPARE IMAGE INPUT - SUPPORT BOTH SINGLE URL AND ARRAYS
    const prepareImageInput = (imageUrl?: string | string[]): string[] | undefined => {
      if (!imageUrl) return undefined
      if (Array.isArray(imageUrl)) {
        console.log('🎨 [SeeDream4] Multi-image input detected:', {
          telegram_id,
          imageCount: imageUrl.length,
          urls: imageUrl.map((url, i) => `${i + 1}: ${url.substring(0, 50)}...`)
        })
        return imageUrl.slice(0, 10) // Limit to max 10 images per schema
      } else {
        console.log('🎨 [SeeDream4] Single image input detected:', {
          telegram_id,
          url: imageUrl.substring(0, 50) + '...'
        })
        return [imageUrl]
      }
    }

    const imageInput = prepareImageInput(inputImageUrl)

    // Validate and prepare input for SeeDream-4 API
    const seeDream4Input = {
      prompt,
      size,
      max_images,
      aspect_ratio,
      telegram_id,
      username,
      is_ru,
      ...(width && height && size === 'custom' ? { width, height } : {}),
      ...(imageInput ? { image_input: imageInput } : {})
    }

    // 🛡️ СТРОГАЯ ВАЛИДАЦИЯ С ДЕТАЛЬНЫМ ЛОГИРОВАНИЕМ
    const validation = validateSeeDream4Input(seeDream4Input)
    
    if (!validation.success) {
      console.error('🚨 [SeeDream4] CRITICAL VALIDATION ERROR:', {
        telegram_id,
        error: validation.error,
        receivedInput: seeDream4Input
      })
      throw new Error(`SeeDream4 validation failed: ${validation.error}`)
    }
    
    const validatedInput = validation.data
    
    console.log('🎭 [SeeDream4] Input validated successfully:', {
      telegram_id,
      validatedInput: {
        prompt: validatedInput.prompt.substring(0, 50) + '...',
        size: validatedInput.size,
        max_images: validatedInput.max_images,
        hasImageInput: !!validatedInput.image_input?.length,
        imageInputCount: validatedInput.image_input?.length || 0
      }
    })

    // Check user existence and level
    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }

    const level = userExists.level
    if (level === 10) {
      await updateUserLevelPlusOne(telegram_id, level)
    }

    // Process balance operation
    const balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: SEEDREAM4_MODEL.costPerImage,
      is_ru,
    })

    console.log('🎭 [SeeDream4] Balance check completed:', {
      success: balanceCheck.success,
      telegram_id,
    })

    if (!balanceCheck.success) {
      console.error('🚨 [SeeDream4] Balance check failed:', {
        telegram_id,
        balanceCheck,
      })
      throw new Error('Not enough stars')
    }

    // Send status message
    const statusMessage = is_ru
      ? '🎭 Генерирую изображение через SeeDream-4 (ByteDance)...\n\n⏱ Это займет 15-30 секунд'
      : '🎭 Generating image via SeeDream-4 (ByteDance)...\n\n⏱ This will take 15-30 seconds'

    const status = await ctx.reply(statusMessage)

    logger.info('[SeeDream4] Starting generation', {
      telegram_id,
      model: SEEDREAM4_MODEL.key,
      promptLength: validatedInput.prompt.length,
      inputSize: validatedInput.size,
    })

    // Call SeeDream-4 API through Replicate
    const replicateInput = {
      prompt: validatedInput.prompt,
      ...(validatedInput.size !== 'custom' ? { 
        size: validatedInput.size 
      } : {
        width: validatedInput.width,
        height: validatedInput.height
      }),
      max_images: validatedInput.max_images,
      ...(validatedInput.image_input ? { image_input: validatedInput.image_input } : {}),
      ...(validatedInput.aspect_ratio ? { aspect_ratio: validatedInput.aspect_ratio } : {})
    }

    console.log('🎭 [SeeDream4] Calling Replicate API:', {
      telegram_id,
      model: SEEDREAM4_MODEL.key,
      inputKeys: Object.keys(replicateInput)
    })

    const output = await replicate.run(SEEDREAM4_MODEL.key as any, {
      input: replicateInput
    })

    console.log('🎭 [SeeDream4] Replicate response received:', {
      telegram_id,
      outputType: typeof output,
      isArray: Array.isArray(output),
      length: Array.isArray(output) ? output.length : 'N/A'
    })

    // Process and validate the response
    let imageUrl: string
    let processedOutput: SeeDream4Response

    if (Array.isArray(output) && output.length > 0) {
      // Multiple images returned
      imageUrl = output[0]
      processedOutput = {
        images: output,
        metadata: {
          prompt: validatedInput.prompt,
          size: validatedInput.size,
          dimensions: validatedInput.size === 'custom' 
            ? { width: validatedInput.width!, height: validatedInput.height! }
            : getSeeDream4Dimensions(validatedInput.size)
        }
      }
    } else if (typeof output === 'string') {
      // Single image URL
      imageUrl = output
      processedOutput = {
        images: [output],
        metadata: {
          prompt: validatedInput.prompt,
          size: validatedInput.size,
          dimensions: validatedInput.size === 'custom' 
            ? { width: validatedInput.width!, height: validatedInput.height! }
            : getSeeDream4Dimensions(validatedInput.size)
        }
      }
    } else {
      throw new Error('Invalid response format from SeeDream-4 API')
    }

    // Validate the response with Zod schema
    const validatedResponse = SeeDream4ResponseSchema.parse(processedOutput)

    console.log('🎭 [SeeDream4] Response validated successfully:', {
      telegram_id,
      imageCount: validatedResponse.images.length,
      dimensions: validatedResponse.metadata.dimensions
    })

    // Delete status message
    try {
      await ctx.deleteMessage(status.message_id)
    } catch (err) {
      logger.warn('[SeeDream4] Failed to delete status message', { err })
    }

    // Download and save the image
    let savedImagePath: string
    try {
      const imageBuffer = await downloadFile(imageUrl)
      const filename = `seedream4_${telegram_id}_${Date.now()}.png`
      savedImagePath = await saveFileLocally(String(telegram_id), imageUrl, 'ai-generation', '.png')
      
      console.log('🎭 [SeeDream4] Image saved locally:', {
        telegram_id,
        savedImagePath,
        fileSize: imageBuffer.length
      })
    } catch (downloadError) {
      console.error('🚨 [SeeDream4] Failed to download/save image:', downloadError)
      throw new Error('Failed to process generated image')
    }

    // Save prompt to database
    try {
      const promptId = await savePrompt(
        validatedInput.prompt,
        SEEDREAM4_MODEL.name,
        imageUrl,
        Number(telegram_id)
      )

      console.log('🎭 [SeeDream4] Prompt saved to database:', {
        telegram_id,
        promptId
      })

      // Send success message with image
      const caption = is_ru
        ? `✨ Изображение создано через SeeDream-4!\n\n🎨 Модель: ${SEEDREAM4_MODEL.name}\n💫 Размер: ${validatedInput.size}\n💰 Потрачено: ${SEEDREAM4_MODEL.costPerImage}⭐\n\n🤖 Создано ботом @${ctx.botInfo?.username || 'unknown'}`
        : `✨ Image created with SeeDream-4!\n\n🎨 Model: ${SEEDREAM4_MODEL.name}\n💫 Size: ${validatedInput.size}\n💰 Spent: ${SEEDREAM4_MODEL.costPerImage}⭐\n\n🤖 Created by @${ctx.botInfo?.username || 'unknown'}`

      // Send the image using local file
      await ctx.replyWithPhoto({ source: savedImagePath }, { caption })

      // Send to pulse channel
      try {
        const { sendMediaToPulse } = await import('@/helpers/pulse')
        await sendMediaToPulse({
          mediaType: 'photo',
          mediaSource: imageUrl,
          telegramId: telegram_id,
          username: username,
          language: is_ru ? 'ru' : 'en',
          serviceType: 'SeeDream-4 (ByteDance)',
          prompt: validatedInput.prompt,
          botName: ctx.botInfo?.username || 'unknown',
          additionalInfo: {
            'Model': SEEDREAM4_MODEL.name,
            'Size': validatedInput.size,
            'Price': `${SEEDREAM4_MODEL.costPerImage} stars`,
            'Type': 'AI Image Generation'
          }
        })
        
        logger.info('[SeeDream4] Sent to pulse channel', { telegram_id, imageUrl })
      } catch (pulseError) {
        logger.error('[SeeDream4] Failed to send to pulse channel:', pulseError)
      }

      // Clean up local file
      try {
        fs.unlinkSync(savedImagePath)
      } catch (cleanupError) {
        logger.warn('[SeeDream4] Failed to cleanup local file:', cleanupError)
      }

      return {
        image: imageUrl,
        prompt_id: promptId
      }

    } catch (saveError) {
      console.error('🚨 [SeeDream4] Failed to save prompt:', saveError)
      // Refund user if database save fails
      await refundUser(ctx, SEEDREAM4_MODEL.costPerImage)
      throw new Error('Failed to save generation record')
    }

  } catch (error) {
    console.error('🚨 [SeeDream4] Generation failed:', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    logger.error('[SeeDream4] Generation failed', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    // Send error message to user
    const errorMessage = params.is_ru
      ? '❌ Произошла ошибка при генерации изображения. Попробуйте позже.'
      : '❌ An error occurred during image generation. Please try later.'

    await params.ctx.reply(errorMessage)

    // Refund user
    await refundUser(params.ctx, SEEDREAM4_MODEL.costPerImage)

    throw error
  }
}