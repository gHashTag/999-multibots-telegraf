import { z } from 'zod'
import { logger } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { refundUser } from '@/price/helpers/refundUser'
import { MyContext } from '@/interfaces'
import { GenerationResult } from '@/interfaces'
import { savePrompt } from '@/core/supabase'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { calculateFinalImageCostInStars } from '@/price/models/IMAGES_MODELS'
import Replicate from 'replicate'
import {
  NanoBananaInputSchema,
  NanoBananaResponseSchema,
  NanoBananaInput,
  NanoBananaAspectRatio,
  NanoBananaResponse,
  NANO_BANANA_AVATAR_CONFIG,
  NANO_BANANA_PROMPT_TEMPLATES,
  extractImageUrlFromReplicateResponse,
} from '@/schemas/nanoBanana.schema'
import { standardButtons } from '@/navigation/helpers/actionButtons'

// Service parameters interface
export interface NanoBananaServiceParams {
  telegram_id: string | number
  promptText: string
  inputImageUrl: string | string[]
  ctx: MyContext
  username?: string
  is_ru?: boolean
  output_format?: 'jpg' | 'png'
  aspect_ratio?: NanoBananaAspectRatio
  promptStyle?: 'headshot' | 'fullBody' | 'artistic'
  silent?: boolean // If true, don't send photo to user (for ALL_MODELS mode)
  skipBalanceCheck?: boolean // If true, skip balance check (already checked before loop)
  suppressUserErrors?: boolean // ✅ Don't notify user of errors (for fallback chains)
}

// Nano Banana model configuration
const NANO_BANANA_MODEL = {
  key: 'google/nano-banana',
  costPerImage: 5, // Cost in stars - fixed to match AI_PHOTOSHOP_PRICING (was incorrectly 12)
  name: 'Google Nano Banana',
  description_en:
    'Google Nano Banana - Advanced image editing powered by Gemini 2.5',
  description_ru:
    'Google Nano Banana - Продвинутое редактирование изображений на базе Gemini 2.5',
}

/**
 * Enhanced Nano Banana generation service with Zod validation
 * Генерация изображения через Google Nano Banana (Replicate)
 * Трансформирует входное изображение в стиле персонажа
 */
export async function generateNanoBanana(
  params: NanoBananaServiceParams
): Promise<string | null> {
  // Declare variables for wider scope
  let imageCount = 1
  let totalCost = NANO_BANANA_MODEL.costPerImage

  try {
    console.log('🍌 [NanoBanana] Service called with params:', {
      telegram_id: params.telegram_id,
      promptLength: params.promptText?.length,
      hasInputImage: !!params.inputImageUrl,
      promptStyle: params.promptStyle,
      username: params.username,
      is_ru: params.is_ru,
    })

    const {
      telegram_id,
      promptText,
      inputImageUrl,
      ctx,
      username,
      is_ru = true,
      output_format = 'png',
      // Portrait by default. Without this field Replicate used its own
      // default, `match_input_image` -- the shape of the input picture --
      // and a Telegram avatar is square.
      aspect_ratio = '9:16',
      promptStyle = 'headshot',
    } = params

    // Prepare input images array
    const imageInputArray = Array.isArray(inputImageUrl)
      ? inputImageUrl
      : [inputImageUrl]

    // 🚨 CRITICAL: Truncate prompt to 1000 chars to avoid validation errors
    const MAX_PROMPT_LENGTH = 1000
    let truncatedPrompt = promptText
    if (promptText.length > MAX_PROMPT_LENGTH) {
      console.log(
        `⚠️ [NanoBanana] Prompt too long (${promptText.length} chars), truncating to ${MAX_PROMPT_LENGTH}`
      )
      // Truncate to 997 chars so that adding '...' results in exactly 1000
      truncatedPrompt = promptText.substring(0, 997) + '...'
    }

    // Validate and prepare input for Nano Banana API
    const nanoBananaInput: NanoBananaInput = {
      prompt: truncatedPrompt,
      image_input: imageInputArray,
      output_format,
      aspect_ratio,
    }

    // ✅ ENHANCED VALIDATION: Validate input with Zod schema and detailed error handling
    let validatedInput: NanoBananaInput
    try {
      validatedInput = NanoBananaInputSchema.parse(nanoBananaInput)
    } catch (validationError) {
      console.error('🚨 [NanoBanana] Input validation failed:', {
        telegram_id,
        error:
          validationError instanceof Error
            ? validationError.message
            : 'Unknown validation error',
        inputData: {
          promptLength: nanoBananaInput.prompt?.length || 0,
          imageInputCount: nanoBananaInput.image_input?.length || 0,
          output_format: nanoBananaInput.output_format,
        },
      })

      throw new Error(
        `Input validation failed: ${validationError instanceof Error ? validationError.message : 'Invalid input format'}`
      )
    }

    console.log('🍌 [NanoBanana] Input validated successfully:', {
      telegram_id,
      validatedInput: {
        prompt: validatedInput.prompt.substring(0, 50) + '...',
        imageCount: validatedInput.image_input.length,
        output_format: validatedInput.output_format,
      },
    })

    // Check user existence and level
    const userExists = await getUserByTelegramIdString(String(telegram_id))
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }

    const level = userExists.level
    if (level === 10) {
      await updateUserLevelPlusOne(String(telegram_id), level)
    }

    // ✅ ENHANCED COST CALCULATION: Calculate total cost with validation
    imageCount = validatedInput.image_input.length
    totalCost = NANO_BANANA_MODEL.costPerImage * imageCount

    console.log('💰 [NanoBanana] Cost calculation:', {
      telegram_id,
      imageCount,
      costPerImage: NANO_BANANA_MODEL.costPerImage,
      totalCost,
      maxSupportedImages: 3, // Nano Banana limit
    })

    // Validate image count against Nano Banana limits
    if (imageCount > 3) {
      console.warn('⚠️ [NanoBanana] Too many images for model:', {
        telegram_id,
        imageCount,
        maxSupported: 3,
      })
      throw new Error(
        `Nano Banana supports maximum 3 images, but ${imageCount} were provided`
      )
    }

    // Проверяем баланс и списываем звезды (skip if already checked before loop)
    if (!params.skipBalanceCheck) {
      console.log('🔵 [NanoBanana] Processing balance operation...', {
        telegram_id,
        costPerImage: NANO_BANANA_MODEL.costPerImage,
        imageCount,
        totalCost,
      })

      const balanceCheck = await processBalanceOperation({
        telegram_id:
          typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id,
        paymentAmount: totalCost,
        is_ru,
        bot_name: ctx.botInfo?.username,
        ctx,
      })

      console.log('🟢 [NanoBanana] Balance check result:', {
        telegram_id,
        balanceCheckSuccess: balanceCheck?.success,
      })

      if (!balanceCheck.success) {
        logger.warn('[NanoBanana] Insufficient balance', {
          telegram_id,
          required: totalCost,
        })

        await ctx.reply(
          is_ru
            ? `❌ Недостаточно звезд для генерации\n\nТребуется: ${totalCost}⭐ (за ${imageCount} фото)\nВаш баланс: ${balanceCheck.currentBalance || 0}⭐\n\nПополните баланс через /start → 💎 Пополнить баланс`
            : `❌ Insufficient stars for generation\n\nRequired: ${totalCost}⭐ (for ${imageCount} photos)\nYour balance: ${balanceCheck.currentBalance || 0}⭐\n\nTop up via /start → 💎 Top up balance`,
          // The refusal hands over the way to pay; standardButtons puts top-up first.
          // Reached the moment the balance runs out, which is the only moment a
          // price is worth showing at all.
          standardButtons(is_ru)
        )
        return null
      }
    } else {
      console.log('⏭️ [NanoBanana] Skipping balance check (already verified)', {
        telegram_id,
      })
    }

    // Отправляем статус ONLY if NOT in silent mode
    let statusMessage: any = null
    if (!params.silent) {
      console.log('📤 [NanoBanana] Sending status message...', { telegram_id })

      statusMessage = await ctx.reply(
        is_ru
          ? '🍌 Генерирую ваш образ через Google Nano Banana...\n\n⏱ Это займет 10-20 секунд'
          : '🍌 Generating your image via Google Nano Banana...\n\n⏱ This will take 10-20 seconds'
      )

      console.log('✅ [NanoBanana] Status message sent!', {
        telegram_id,
        messageId: statusMessage.message_id,
      })
    } else {
      console.log('🔇 [NanoBanana] Silent mode - skipping status message', {
        telegram_id,
      })
    }

    // Enhance prompt based on style
    const enhancedPrompt = NANO_BANANA_PROMPT_TEMPLATES[promptStyle](
      validatedInput.prompt
    )

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    })

    logger.info('[NanoBanana] Starting generation', {
      telegram_id,
      model: NANO_BANANA_MODEL.key,
      originalPrompt: validatedInput.prompt.substring(0, 50),
      enhancedPrompt: enhancedPrompt.substring(0, 150),
      imageCount: validatedInput.image_input.length,
    })

    // Call Nano Banana model with retry logic for reliability
    console.log('🍌 [NanoBanana] Calling Replicate.run...', {
      telegram_id,
      model: NANO_BANANA_MODEL.key,
      inputImageCount: validatedInput.image_input.length,
    })

    const maxRetries = 2
    let output: any = null
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [NanoBanana] Attempt ${attempt}/${maxRetries}`, {
          telegram_id,
        })

        output = await replicate.run(NANO_BANANA_MODEL.key as any, {
          input: {
            prompt: enhancedPrompt,
            image_input: validatedInput.image_input,
            output_format: validatedInput.output_format,
          },
        })

        // Success - break out of retry loop
        console.log(`✅ [NanoBanana] Success on attempt ${attempt}`, {
          telegram_id,
        })
        break
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        console.warn(`⚠️ [NanoBanana] Attempt ${attempt} failed:`, {
          telegram_id,
          error: lastError.message,
          attemptsRemaining: maxRetries - attempt,
        })

        // If this was the last attempt, we'll throw the error after the loop
        if (attempt === maxRetries) {
          console.error(`❌ [NanoBanana] All ${maxRetries} attempts failed`, {
            telegram_id,
          })
          break
        }

        // Wait 1 second before retry to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // If all retries failed, throw the last error
    if (!output && lastError) {
      throw lastError
    }

    console.log('🖼️ [NanoBanana] Replicate output received:', {
      telegram_id,
      outputType: typeof output,
      isArray: Array.isArray(output),
      outputValue: output,
    })

    // Extract image URL using schema utility
    const imageUrl = extractImageUrlFromReplicateResponse(output)

    if (!imageUrl) {
      console.error('❌ [NanoBanana] No image URL found in response!', {
        telegram_id,
        output,
      })
      throw new Error('No image URL in Nano Banana response')
    }

    console.log('✨ [NanoBanana] Image URL extracted successfully!', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // Create validated response object
    const processedOutput: NanoBananaResponse = {
      image: imageUrl,
      metadata: {
        prompt: validatedInput.prompt,
        input_images_count: validatedInput.image_input.length,
        output_format: validatedInput.output_format,
      },
    }

    // Validate the response with Zod schema
    const validatedResponse = NanoBananaResponseSchema.parse(processedOutput)

    logger.info('[NanoBanana] Response validated successfully', {
      telegram_id,
      imageUrl: validatedResponse.image.substring(0, 50) + '...',
    })

    // Delete status message (only if it was sent)
    if (statusMessage) {
      try {
        await ctx.deleteMessage(statusMessage.message_id)
      } catch (err) {
        logger.warn('[NanoBanana] Failed to delete status message', { err })
      }
    }

    // Save prompt to database
    let promptId: number
    try {
      promptId = await savePrompt(
        validatedInput.prompt,
        NANO_BANANA_MODEL.name,
        imageUrl,
        typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id,
        'success'
      )

      console.log('🍌 [NanoBanana] Prompt saved to database:', {
        telegram_id,
        promptId,
      })
    } catch (saveError) {
      console.error('🚨 [NanoBanana] Failed to save prompt:', saveError)
      // Continue execution, but log the error
      promptId = 0
    }

    console.log('📮 [NanoBanana] Preparing to send photo...', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // Send image to user ONLY if NOT in silent mode
    if (!params.silent) {
      const botUsername = ctx.botInfo?.username || 'neuro_blogger_bot'
      const caption = is_ru
        ? `✨ Ваш образ готов!\n\n💫 Стоимость: ${totalCost}⭐\n🎨 Изображений: ${validatedInput.image_input.length}`
        : `✨ Your image is ready!\n\n💫 Cost: ${totalCost}⭐\n🎨 Images: ${validatedInput.image_input.length}`

      console.log('🚀 [NanoBanana] About to call sendPhotoWithFallback', {
        telegram_id,
        imageUrl: imageUrl.substring(0, 50) + '...',
        captionLength: caption.length,
      })

      const sendResult = await sendPhotoWithFallback(ctx, imageUrl, {
        caption,
      })

      console.log('🎯 [NanoBanana] sendPhotoWithFallback result:', {
        telegram_id,
        sendResult,
      })

      if (!sendResult) {
        console.error('❌ [NanoBanana] Failed to send photo!', {
          telegram_id,
          imageUrl: imageUrl.substring(0, 50) + '...',
        })
        throw new Error('Failed to send photo to user')
      }

      console.log('📬 [NanoBanana] Photo sent successfully!', {
        telegram_id,
      })
    } else {
      console.log('🔇 [NanoBanana] Silent mode - skipping photo send', {
        telegram_id,
      })
    }

    // Send to pulse channel
    try {
      console.log('🔵 [NanoBanana] Attempting pulse channel send...', {
        telegram_id,
        imageUrl: imageUrl.substring(0, 50) + '...',
      })

      const { sendMediaToPulse } = await import('@/helpers/pulse')
      await sendMediaToPulse({
        mediaType: 'photo',
        mediaSource: imageUrl,
        telegramId: telegram_id,
        username: username,
        language: is_ru ? 'ru' : 'en',
        serviceType: 'Google Nano Banana',
        prompt: validatedInput.prompt,
        botName: ctx.botInfo?.username || 'unknown',
        additionalInfo: {
          Model: NANO_BANANA_MODEL.name,
          'Input Images': validatedInput.image_input.length.toString(),
          'Output Format': validatedInput.output_format,
          Price: `${NANO_BANANA_MODEL.costPerImage} stars`,
          Type: 'Avatar Transform (Lead Magnet)',
        },
      })

      console.log('✅ [NanoBanana] Pulse channel send SUCCESS!', {
        telegram_id,
      })

      logger.info('[NanoBanana] Photo sent to pulse channel', {
        telegram_id,
        imageUrl,
      })
    } catch (pulseError) {
      console.error('❌ [NanoBanana] Pulse channel ERROR:', {
        telegram_id,
        error: pulseError?.message || pulseError,
      })
      logger.error('[NanoBanana] Error sending to pulse channel:', pulseError)
    }

    return imageUrl
  } catch (error) {
    console.error('🔴 [NanoBanana] CRITICAL ERROR:', {
      telegram_id: params.telegram_id,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
    })

    logger.error('[NanoBanana] Generation failed', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // ✅ Only notify user if not in fallback mode
    if (!params.suppressUserErrors) {
      const errorMessage = params.is_ru
        ? '❌ Произошла ошибка при генерации. Попробуйте позже.'
        : '❌ An error occurred during generation. Please try later.'

      await params.ctx.reply(errorMessage)
    }

    // Refund user
    await refundUser(params.ctx, totalCost, { reason: 'generation_failed' })

    // Send notification to admins
    try {
      const adminIds = process.env.ADMIN_IDS?.split(',') || []
      const adminMessage = `🚨 Ошибка в generateNanoBanana

👤 User: ${params.telegram_id} (@${params.username})
❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}
🎯 Prompt: ${params.promptText.substring(0, 100)}...

Проверьте логи для деталей.`

      for (const adminId of adminIds) {
        await params.ctx.telegram
          .sendMessage(adminId, adminMessage, {
            parse_mode: undefined, // ✅ Отключаем парсинг для технических сообщений с промптами
          })
          .catch(err => {
            // Only log errors that aren't "chat not found" (invalid admin IDs)
            if (!err.message?.includes('chat not found')) {
              console.error('Failed to notify admin:', err)
            }
          })
      }
    } catch (notifyError) {
      console.error('Failed to send admin notification:', notifyError)
    }

    return null
  }
}

/**
 * Compatibility function to maintain backward compatibility
 * with existing NanoBanana interface
 */
export interface NanoBananaParams {
  telegram_id: string | number
  promptText: string
  inputImageUrl: string
  ctx: MyContext
  username?: string
  is_ru?: boolean
}

export const generateNanoBananaLegacy = async (
  params: NanoBananaParams
): Promise<string | null> => {
  return generateNanoBanana({
    ...params,
    promptStyle: 'headshot', // Default to headshot for backward compatibility
  })
}
