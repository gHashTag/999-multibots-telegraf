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
  getAspectRatio,
  getUserBalance,
} from '@/core/supabase'
import { calculateFinalImageCostInStars } from '@/price/models/IMAGES_MODELS'
import { logger, logSessionSafely } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers'
import { refundUser } from '@/price/helpers/refundUser'
import { isBalanceRefusal } from '@/price/helpers/isBalanceRefusal'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import fs from 'fs'
import {
  SeeDream45InputSchema,
  SeeDream45ResponseSchema,
  SeeDream45Input,
  SeeDream45Response,
  SEEDREAM45_DEFAULT_CONFIG,
  getSeeDream45Dimensions,
  validateSeeDream45Input,
  SeeDream45Size,
  SequentialImageGeneration,
} from '@/schemas/seedream45.schema'
import { standardButtons } from '@/navigation/helpers/actionButtons'

// Service parameters interface
export interface SeeDream45ServiceParams {
  prompt: string
  inputImageUrl?: string | string[]
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  size?: '2K' | '4K' | 'custom' // Note: 1K NOT supported in 4.5
  width?: number
  height?: number
  max_images?: number
  aspect_ratio?: string
  sequential_image_generation?: 'disabled' | 'auto'
  suppressUserErrors?: boolean
  is_welcome_gift?: boolean // Skip payment for welcome generation
}

// SeeDream-4.5 model configuration
const SEEDREAM45_MODEL = {
  key: 'bytedance/seedream-4.5',
  costPerImage: calculateFinalImageCostInStars(0.035), // Slightly higher price for 4.5
  name: 'SeeDream-4.5',
  description_en:
    'ByteDance SeeDream-4.5 - Upgraded model with stronger spatial understanding and world knowledge',
  description_ru:
    'ByteDance SeeDream-4.5 - Улучшенная модель с продвинутым пониманием пространства и мира',
}

/**
 * SeeDream-4.5 generation service
 * Upgraded model with:
 * - Superior aesthetics (cinematic, film-like visuals)
 * - Higher consistency across multiple images
 * - Smarter instruction following
 * - Stronger spatial understanding
 * - Richer world knowledge
 */
export const generateSeeDream45 = async (
  params: SeeDream45ServiceParams
): Promise<GenerationResult> => {
  console.log('🎭 [SeeDream4.5] Service called with params:', {
    telegram_id: params.telegram_id,
    promptLength: params.prompt?.length,
    hasInputImage: !!params.inputImageUrl,
    size: params.size,
    sequential_mode: params.sequential_image_generation,
    username: params.username,
    is_ru: params.is_ru,
  })

  let imageCount = 1
  let totalCost = SEEDREAM45_MODEL.costPerImage
  // Set once the user has actually been charged, so the outer catch can refund
  // them if delivery (or anything after the charge) then throws.
  let refundOnFailure = false
  // The downloaded temp PNG is unlinked on the success path; track it here so
  // the outer catch can remove it too when delivery fails, instead of orphaning
  // it on disk (#1029 class).
  let tempFileToCleanup: string | null = null

  try {
    const {
      prompt,
      inputImageUrl,
      telegram_id,
      username,
      is_ru,
      ctx,
      size = '2K', // Default to 2K (1K not supported in 4.5)
      width,
      height,
      max_images = 1,
      aspect_ratio,
      sequential_image_generation = 'disabled',
    } = params

    // Prepare image input - support both single URL and arrays
    const prepareImageInput = (
      imageUrl?: string | string[]
    ): string[] | undefined => {
      if (!imageUrl) return undefined
      if (Array.isArray(imageUrl)) {
        logger.info('SeeDream4.5 multi-image input detected', {
          telegram_id,
          imageCount: imageUrl.length,
        })
        return imageUrl.slice(0, 14) // Limit to max 14 images for 4.5
      } else {
        logger.info('SeeDream4.5 single image input detected', {
          telegram_id,
        })
        return [imageUrl]
      }
    }

    const imageInput = prepareImageInput(inputImageUrl)

    // Get centralized aspect_ratio from database
    const dbAspectRatio = await getAspectRatio(Number(telegram_id))
    // Support 'match_input_image' for auto-matching input image aspect ratio
    const finalAspectRatio = imageInput?.length
      ? aspect_ratio || 'match_input_image'
      : dbAspectRatio || aspect_ratio || '9:16'

    logger.info('SeeDream4.5 aspect_ratio resolved', {
      telegram_id,
      dbAspectRatio,
      paramAspectRatio: aspect_ratio,
      finalAspectRatio,
      hasImageInput: !!imageInput,
    })

    // Validate and prepare input for SeeDream-4.5 API
    const seeDream45Input = {
      prompt,
      size,
      max_images,
      aspect_ratio: finalAspectRatio,
      sequential_image_generation,
      telegram_id,
      username,
      is_ru,
      ...(width && height && size === 'custom' ? { width, height } : {}),
      ...(imageInput ? { image_input: imageInput } : {}),
    }

    // Strict validation with detailed logging
    const validation = validateSeeDream45Input(seeDream45Input)

    if (!validation.success) {
      logger.error('SeeDream4.5 validation failed', {
        telegram_id,
        error: validation.error,
        hasPrompt: !!seeDream45Input.prompt,
        size: seeDream45Input.size,
      })
      throw new Error(`SeeDream4.5 validation failed: ${validation.error}`)
    }

    const validatedInput = validation.data

    logger.info('SeeDream4.5 input validated', {
      telegram_id,
      size: validatedInput.size,
      max_images: validatedInput.max_images,
      sequential_mode: validatedInput.sequential_image_generation,
      hasImageInput: !!validatedInput.image_input?.length,
      imageInputCount: validatedInput.image_input?.length || 0,
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

    // Calculate total cost based on number of images
    imageCount = validatedInput.image_input?.length || 1
    totalCost = SEEDREAM45_MODEL.costPerImage * imageCount

    logger.info('SeeDream4.5 multi-image pricing calculation', {
      telegram_id,
      costPerImage: SEEDREAM45_MODEL.costPerImage,
      imageCount,
      totalCost,
    })

    // Balance check (no deduction yet)
    const currentBalance = await getUserBalance(telegram_id)

    logger.info('SeeDream4.5 balance check', {
      telegram_id,
      currentBalance,
      requiredCost: totalCost,
      hasEnough: currentBalance >= totalCost,
      isWelcomeGift: params.is_welcome_gift,
    })

    // Skip balance check for welcome gift
    if (!params.is_welcome_gift && currentBalance < totalCost) {
      if (!params.suppressUserErrors) {
        const message = is_ru
          ? `❌ Недостаточно звезд на балансе.\n\n💰 Требуется: ${totalCost}⭐\n💎 У вас: ${currentBalance}⭐\n\n📱 Пополните — и продолжим.`
          : `❌ Insufficient stars balance.\n\n💰 Required: ${totalCost}⭐\n💎 You have: ${currentBalance}⭐\n\n📱 Top up and we continue.`

        // The refusal carries the way to pay: standardButtons puts top-up first.
        // Rationale in price/helpers/sendInsufficientStarsMessage.ts.
        await ctx.reply(message, standardButtons(is_ru))
      }

      /*
       * `warn`, not `error`: the winston transport forwards every logger.error
       * to the owner's alert group, and this line is not an incident -- the
       * customer was already told, with the way to pay under the message.
       * Seven sibling generators (NanoBanana, GptImage25, Gemini,
       * Seedream45Replicate, NanoBananaPro, NanoBananaKie) already use warn
       * here; these two were the odd ones out, and they were alerts 1 and 2 of
       * the four the owner got at 08:56 on 2026-09-15 for one empty wallet.
       * The numbers stay in the log file, where they are still readable.
       */
      logger.warn('SeeDream4.5 insufficient balance', {
        telegram_id,
        currentBalance,
        requiredCost: totalCost,
      })

      throw new Error('Insufficient balance')
    }

    // Send status message
    const statusMessage = is_ru
      ? '🎭 Генерирую изображение через SeeDream-4.5 (ByteDance)...\n\n⏱ Это займет 15-45 секунд'
      : '🎭 Generating image via SeeDream-4.5 (ByteDance)...\n\n⏱ This will take 15-45 seconds'

    const status = await ctx.reply(statusMessage)

    logger.info('[SeeDream4.5] Starting generation', {
      telegram_id,
      model: SEEDREAM45_MODEL.key,
      promptLength: validatedInput.prompt.length,
      inputSize: validatedInput.size,
      sequential_mode: validatedInput.sequential_image_generation,
    })

    // Call SeeDream-4.5 API through Replicate
    const replicateInput: Record<string, any> = {
      prompt: validatedInput.prompt,
      max_images: validatedInput.max_images,
      sequential_image_generation: validatedInput.sequential_image_generation,
      aspect_ratio: finalAspectRatio,
    }

    // Handle size vs custom dimensions
    if (validatedInput.size !== 'custom') {
      replicateInput.size = validatedInput.size
    } else {
      replicateInput.width = validatedInput.width
      replicateInput.height = validatedInput.height
    }

    // Add image input if present
    if (validatedInput.image_input) {
      replicateInput.image_input = validatedInput.image_input
    }

    logger.info('SeeDream4.5 calling Replicate API', {
      telegram_id,
      model: SEEDREAM45_MODEL.key,
      inputKeys: Object.keys(replicateInput),
    })

    const output = await replicate.run(SEEDREAM45_MODEL.key as any, {
      input: replicateInput,
    })

    logger.info('SeeDream4.5 response received', {
      telegram_id,
      outputType: typeof output,
      isArray: Array.isArray(output),
      length: Array.isArray(output) ? output.length : 'N/A',
    })

    // Process and validate the response
    let imageUrl: string
    let processedOutput: SeeDream45Response

    if (Array.isArray(output) && output.length > 0) {
      imageUrl = output[0]
      processedOutput = {
        images: output,
        metadata: {
          prompt: validatedInput.prompt,
          size: validatedInput.size,
          dimensions:
            validatedInput.size === 'custom'
              ? { width: validatedInput.width!, height: validatedInput.height! }
              : getSeeDream45Dimensions(validatedInput.size as SeeDream45Size),
          sequential_mode: validatedInput.sequential_image_generation,
        },
      }
    } else if (typeof output === 'string') {
      imageUrl = output
      processedOutput = {
        images: [output],
        metadata: {
          prompt: validatedInput.prompt,
          size: validatedInput.size,
          dimensions:
            validatedInput.size === 'custom'
              ? { width: validatedInput.width!, height: validatedInput.height! }
              : getSeeDream45Dimensions(validatedInput.size as SeeDream45Size),
          sequential_mode: validatedInput.sequential_image_generation,
        },
      }
    } else {
      throw new Error('Invalid response format from SeeDream-4.5 API')
    }

    // Validate response with Zod schema
    const validatedResponse = SeeDream45ResponseSchema.parse(processedOutput)

    console.log('🎭 [SeeDream4.5] Response validated successfully:', {
      telegram_id,
      imageCount: validatedResponse.images.length,
      dimensions: validatedResponse.metadata.dimensions,
    })

    // Delete status message
    try {
      await ctx.deleteMessage(status.message_id)
    } catch (err) {
      logger.warn('[SeeDream4.5] Failed to delete status message', { err })
    }

    // Download and save the image
    let savedImagePath: string
    try {
      const imageBuffer = await downloadFile(imageUrl)
      const filename = `seedream45_${telegram_id}_${Date.now()}.png`
      savedImagePath = await saveFileLocally(
        String(telegram_id),
        imageUrl,
        'ai-generation',
        '.png'
      )
      tempFileToCleanup = savedImagePath

      console.log('🎭 [SeeDream4.5] Image saved locally:', {
        telegram_id,
        savedImagePath,
        fileSize: imageBuffer.length,
      })
    } catch (downloadError) {
      const originalMsg =
        downloadError instanceof Error
          ? downloadError.message
          : String(downloadError)
      console.error(
        '🚨 [SeeDream4.5] Failed to download/save image:',
        downloadError
      )
      throw new Error(`Failed to process generated image: ${originalMsg}`)
    }

    // Deduct stars AFTER successful generation (skip for welcome gift)
    const balanceDeduction = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: totalCost,
      is_ru,
      bot_name: ctx?.botInfo?.username,
      is_welcome_gift: params.is_welcome_gift,
    })

    logger.info('SeeDream4.5 stars deducted after success', {
      telegram_id,
      deductedAmount: totalCost,
      newBalance: balanceDeduction.newBalance,
      success: balanceDeduction.success,
    })

    if (!balanceDeduction.success) {
      logger.error('SeeDream4.5 failed to deduct stars after generation', {
        telegram_id,
        totalCost,
      })
    }

    // From here on the user has paid; if delivery throws we must refund.
    // (welcome gifts are never charged, so they must not be refunded.)
    if (balanceDeduction.success && !params.is_welcome_gift) {
      refundOnFailure = true
    }

    // Save prompt to database
    try {
      const promptId = await savePrompt(
        validatedInput.prompt,
        SEEDREAM45_MODEL.name,
        imageUrl,
        Number(telegram_id),
        'success'
      )

      console.log('🎭 [SeeDream4.5] Prompt saved to database:', {
        telegram_id,
        promptId,
      })

      // Send success message with image
      const caption = is_ru
        ? `✨ Изображение создано через SeeDream-4.5!\n\n🎨 Модель: ${SEEDREAM45_MODEL.name}\n💫 Размер: ${validatedInput.size}\n🖼️ Изображений: ${validatedResponse.images.length}\n💰 Потрачено: ${totalCost}⭐\n\n🤖 Создано ботом @${ctx.botInfo?.username || 'unknown'}`
        : `✨ Image created with SeeDream-4.5!\n\n🎨 Model: ${SEEDREAM45_MODEL.name}\n💫 Size: ${validatedInput.size}\n🖼️ Images: ${validatedResponse.images.length}\n💰 Spent: ${totalCost}⭐\n\n🤖 Created by @${ctx.botInfo?.username || 'unknown'}`

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
          serviceType: 'SeeDream-4.5 (ByteDance)',
          prompt: validatedInput.prompt,
          botName: ctx.botInfo?.username || 'unknown',
          additionalInfo: {
            Model: SEEDREAM45_MODEL.name,
            Size: validatedInput.size,
            'Sequential Mode': validatedInput.sequential_image_generation,
            Price: `${SEEDREAM45_MODEL.costPerImage} stars`,
            Type: 'AI Image Generation',
          },
        })

        logger.info('[SeeDream4.5] Sent to pulse channel', {
          telegram_id,
          imageUrl,
        })
      } catch (pulseError) {
        logger.error(
          '[SeeDream4.5] Failed to send to pulse channel:',
          pulseError
        )
      }

      // Clean up local file
      try {
        fs.unlinkSync(savedImagePath)
      } catch (cleanupError) {
        logger.warn('[SeeDream4.5] Failed to cleanup local file:', cleanupError)
      }

      return {
        image: imageUrl,
        prompt_id: promptId,
      }
    } catch (saveError) {
      const originalMsg =
        saveError instanceof Error ? saveError.message : String(saveError)
      console.error('🚨 [SeeDream4.5] Failed to save prompt:', saveError)
      throw new Error(`Failed to save generation record: ${originalMsg}`)
    }
  } catch (error) {
    // Remove the downloaded temp PNG if we failed before the success-path
    // cleanup ran, so a failed delivery does not orphan it on disk (#1029).
    if (tempFileToCleanup) {
      try {
        fs.unlinkSync(tempFileToCleanup)
      } catch {
        /* already gone or never created */
      }
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    const errorMsgLower = errorMessage.toLowerCase()

    // Classify error for better logging
    let errorType = 'UNKNOWN'
    let isRetriable = false

    if (
      errorMsgLower.includes('e005') ||
      errorMsgLower.includes('flagged as sensitive') ||
      errorMsgLower.includes('nsfw') ||
      errorMsgLower.includes('safety')
    ) {
      errorType = 'NSFW_DETECTED'
      isRetriable = true
    } else if (
      errorMsgLower.includes('rate') ||
      errorMsgLower.includes('limit') ||
      errorMsgLower.includes('429') ||
      errorMsgLower.includes('too many')
    ) {
      errorType = 'RATE_LIMIT'
      isRetriable = true
    } else if (
      errorMsgLower.includes('timeout') ||
      errorMsgLower.includes('etimedout') ||
      errorMsgLower.includes('econnreset') ||
      errorMsgLower.includes('socket')
    ) {
      errorType = 'TIMEOUT'
      isRetriable = true
    } else if (
      errorMsgLower.includes('balance') ||
      errorMsgLower.includes('insufficient') ||
      errorMsgLower.includes('funds') ||
      errorMsgLower.includes('not enough')
    ) {
      errorType = 'INSUFFICIENT_BALANCE'
      isRetriable = false
    } else if (
      errorMsgLower.includes('user') &&
      errorMsgLower.includes('not') &&
      errorMsgLower.includes('exist')
    ) {
      errorType = 'USER_NOT_FOUND'
      isRetriable = false
    } else if (
      errorMsgLower.includes('invalid') ||
      errorMsgLower.includes('validation') ||
      errorMsgLower.includes('parse')
    ) {
      errorType = 'VALIDATION_ERROR'
      isRetriable = false
    } else if (
      errorMsgLower.includes('download') ||
      errorMsgLower.includes('fetch') ||
      errorMsgLower.includes('enotfound')
    ) {
      errorType = 'DOWNLOAD_ERROR'
      isRetriable = true
    } else if (
      errorMsgLower.includes('api') ||
      errorMsgLower.includes('500') ||
      errorMsgLower.includes('502') ||
      errorMsgLower.includes('503')
    ) {
      errorType = 'API_ERROR'
      isRetriable = true
    } else if (errorMsgLower.includes('cancel')) {
      errorType = 'CANCELLED'
      isRetriable = false
    } else if (
      errorMsgLower.includes('1k') ||
      errorMsgLower.includes('resolution not supported')
    ) {
      errorType = 'UNSUPPORTED_RESOLUTION'
      isRetriable = false
    }

    console.error('🚨 [SeeDream4.5] Generation failed:', {
      telegram_id: params.telegram_id,
      errorType,
      isRetriable,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Add error detail for UNKNOWN type
    const errorDetail =
      errorType === 'UNKNOWN' ? ` | ${errorMessage.substring(0, 100)}` : ''
    const logMessage = isRetriable
      ? `[SeeDream4.5] ${errorType} - автоматический retry через fallback`
      : `[SeeDream4.5] ${errorType} - требует внимания`

    /*
     * WHO IS THIS FAILURE ABOUT?
     *
     * Every logger.error reaches the owner's alert group. A customer with no
     * stars is not something the owner can act on, and the guard above has
     * already told the customer. Note that the decision is NOT taken on
     * `errorType`: that classifier matches the bare word 'balance', so
     * "Failed to fetch user balance" -- a real outage -- lands in the same
     * branch. `isBalanceRefusal` requires the money word next to the thing
     * there is not enough of, and anything it cannot recognise stays an alert.
     */
    const isCustomerWallet = isBalanceRefusal(errorMessage)
    logger[isCustomerWallet ? 'warn' : 'error'](`${logMessage}${errorDetail}`, {
      telegram_id: params.telegram_id,
      errorType,
      isRetriable,
      error: errorMessage,
    })

    // The charge happens after a successful generation, but delivery (saving
    // the record, sending the photo) can still throw afterwards. When it does,
    // the user has paid for an image they never received — refund them.
    // refundUser checks the ledger, so it only returns real, already-charged
    // stars (never a welcome gift, never more than was paid).
    if (refundOnFailure) {
      try {
        await refundUser(params.ctx, totalCost, {
          reason: 'generation_failed',
          service: 'SeeDream-4.5',
        })
      } catch (refundError) {
        logger.error(
          '[SeeDream4.5] Failed to refund after post-charge failure',
          {
            telegram_id: params.telegram_id,
            totalCost,
            refundError,
          }
        )
      }
    }

    // Only notify user if not in fallback mode
    if (!params.suppressUserErrors) {
      const userErrorMessage = params.is_ru
        ? '❌ Произошла ошибка при генерации изображения. Попробуйте позже.'
        : '❌ An error occurred during image generation. Please try later.'

      await params.ctx.reply(userErrorMessage)
    }

    throw error
  }
}

// Export model info for external use
export const SEEDREAM45_MODEL_INFO = SEEDREAM45_MODEL
