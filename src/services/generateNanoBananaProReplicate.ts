import { z } from 'zod'
import { logger } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { refundUser } from '@/price/helpers/refundUser'
import { MyContext } from '@/interfaces'
import { savePrompt } from '@/core/supabase'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import Replicate from 'replicate'
import { standardButtons } from '@/navigation/helpers/actionButtons'

/**
 * Nano Banana Pro (Google Gemini 3 Pro) API Schema via Replicate
 * Advanced image generation with text rendering, multi-image blending, up to 4K
 */

// Input validation schema
export const NanoBananaProInputSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000, 'Prompt too long'),
  image_input: z
    .array(z.string().url())
    .max(14, 'Maximum 14 images allowed')
    .optional(),
  aspect_ratio: z
    .enum(['1:1', '3:4', '4:3', '9:16', '16:9', '9:21', '21:9'])
    .default('9:16'),
  resolution: z.enum(['1K', '2K', '4K']).default('1K'),
  output_format: z.enum(['jpg', 'png', 'webp']).default('png'),
  safety_filter_level: z
    .enum(['block_low_and_above', 'block_medium_and_above', 'block_only_high'])
    .default('block_medium_and_above'),
})

export type NanoBananaProInput = z.infer<typeof NanoBananaProInputSchema>

// Service parameters interface
export interface NanoBananaProServiceParams {
  telegram_id: string | number
  promptText: string
  inputImageUrl?: string | string[]
  ctx: MyContext
  username?: string
  is_ru?: boolean
  output_format?: 'jpg' | 'png' | 'webp'
  resolution?: '1K' | '2K' | '4K'
  aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '9:21' | '21:9'
  silent?: boolean
  skipBalanceCheck?: boolean
  suppressUserErrors?: boolean
}

// Nano Banana Pro model configuration
const NANO_BANANA_PRO_MODEL = {
  key: 'google/nano-banana-pro',
  costPerImage: 8, // Cost in stars (~$0.05 with markup)
  name: 'Google Nano Banana Pro',
  description_en:
    'Google Nano Banana Pro - Advanced image generation powered by Gemini 3 Pro',
  description_ru:
    'Google Nano Banana Pro - Продвинутая генерация изображений на базе Gemini 3 Pro',
  maxImages: 14,
}

/**
 * Extract image URL from Replicate response
 */
function extractImageUrl(output: unknown): string | null {
  try {
    if (typeof output === 'string') {
      return output
    }

    if (Array.isArray(output) && output.length > 0) {
      return typeof output[0] === 'string' ? output[0] : null
    }

    if (typeof output === 'object' && output !== null) {
      if ('output' in output && typeof (output as any).output === 'string') {
        return (output as any).output
      }
    }

    return null
  } catch (error) {
    console.error('Failed to extract image URL:', error)
    return null
  }
}

/**
 * Generate images using Replicate's Google Nano Banana Pro model
 * Google Gemini 3 Pro based image generation with text rendering and multi-image support
 *
 * Features:
 * - Text rendering in images
 * - Multi-image blending (up to 14 images)
 * - Advanced editing capabilities
 * - Up to 4K resolution support
 */
export async function generateNanoBananaProReplicate(
  params: NanoBananaProServiceParams
): Promise<string | null> {
  let totalCost = NANO_BANANA_PRO_MODEL.costPerImage

  try {
    console.log('🍌 [NanoBananaPro] Service called with params:', {
      telegram_id: params.telegram_id,
      promptLength: params.promptText?.length,
      hasInputImage: !!params.inputImageUrl,
      resolution: params.resolution,
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
      resolution = '1K',
      aspectRatio = '9:16',
    } = params

    // Prepare input images array (optional for this model)
    const imageInputArray = inputImageUrl
      ? Array.isArray(inputImageUrl)
        ? inputImageUrl
        : [inputImageUrl]
      : undefined

    // Truncate prompt to 2000 chars
    const MAX_PROMPT_LENGTH = 2000
    let truncatedPrompt = promptText
    if (promptText.length > MAX_PROMPT_LENGTH) {
      console.log(
        `⚠️ [NanoBananaPro] Prompt too long (${promptText.length} chars), truncating to ${MAX_PROMPT_LENGTH}`
      )
      truncatedPrompt = promptText.substring(0, 1997) + '...'
    }

    // Validate input
    const nanoBananaProInput: NanoBananaProInput = {
      prompt: truncatedPrompt,
      image_input: imageInputArray,
      output_format,
      resolution,
      aspect_ratio: aspectRatio,
      safety_filter_level: 'block_medium_and_above',
    }

    let validatedInput: NanoBananaProInput
    try {
      validatedInput = NanoBananaProInputSchema.parse(nanoBananaProInput)
    } catch (validationError) {
      console.error('🚨 [NanoBananaPro] Input validation failed:', {
        telegram_id,
        error:
          validationError instanceof Error
            ? validationError.message
            : 'Unknown validation error',
      })
      throw new Error(
        `Input validation failed: ${validationError instanceof Error ? validationError.message : 'Invalid input format'}`
      )
    }

    console.log('🍌 [NanoBananaPro] Input validated successfully:', {
      telegram_id,
      prompt: validatedInput.prompt.substring(0, 50) + '...',
      imageCount: validatedInput.image_input?.length || 0,
      resolution: validatedInput.resolution,
    })

    // Check user existence
    const userExists = await getUserByTelegramIdString(String(telegram_id))
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }

    const level = userExists.level
    if (level === 10) {
      await updateUserLevelPlusOne(String(telegram_id), level)
    }

    // Calculate cost (base cost, resolution multipliers handled elsewhere)
    const imageCount = validatedInput.image_input?.length || 1
    totalCost = NANO_BANANA_PRO_MODEL.costPerImage

    console.log('💰 [NanoBananaPro] Cost calculation:', {
      telegram_id,
      imageCount,
      costPerImage: NANO_BANANA_PRO_MODEL.costPerImage,
      totalCost,
      resolution,
    })

    // Validate image count
    if (imageCount > NANO_BANANA_PRO_MODEL.maxImages) {
      throw new Error(
        `Nano Banana Pro supports maximum ${NANO_BANANA_PRO_MODEL.maxImages} images, but ${imageCount} were provided`
      )
    }

    // Check balance
    if (!params.skipBalanceCheck) {
      console.log('🔵 [NanoBananaPro] Processing balance operation...', {
        telegram_id,
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

      console.log('🟢 [NanoBananaPro] Balance check result:', {
        telegram_id,
        balanceCheckSuccess: balanceCheck?.success,
      })

      if (!balanceCheck.success) {
        logger.warn('[NanoBananaPro] Insufficient balance', {
          telegram_id,
          required: totalCost,
        })

        await ctx.reply(
          is_ru
            ? `❌ Недостаточно звезд для генерации\n\nТребуется: ${totalCost}⭐\nВаш баланс: ${balanceCheck.currentBalance || 0}⭐\n\nПополните баланс через /start → 💎 Пополнить баланс`
            : `❌ Insufficient stars for generation\n\nRequired: ${totalCost}⭐\nYour balance: ${balanceCheck.currentBalance || 0}⭐\n\nTop up via /start → 💎 Top up balance`,
          // The refusal hands over the way to pay; standardButtons puts top-up first.
          // Reached the moment the balance runs out, which is the only moment a
          // price is worth showing at all.
          standardButtons(is_ru)
        )
        return null
      }
    } else {
      console.log(
        '⏭️ [NanoBananaPro] Skipping balance check (already verified)',
        { telegram_id }
      )
    }

    // Send status message
    let statusMessage: any = null
    if (!params.silent) {
      console.log('📤 [NanoBananaPro] Sending status message...', {
        telegram_id,
      })

      statusMessage = await ctx.reply(
        is_ru
          ? `🍌 Генерирую изображение через Google Nano Banana Pro...\n\n📐 Разрешение: ${resolution}\n⏱ Это займет 15-30 секунд`
          : `🍌 Generating image via Google Nano Banana Pro...\n\n📐 Resolution: ${resolution}\n⏱ This will take 15-30 seconds`
      )

      console.log('✅ [NanoBananaPro] Status message sent!', {
        telegram_id,
        messageId: statusMessage.message_id,
      })
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    })

    logger.info('[NanoBananaPro] Starting generation', {
      telegram_id,
      model: NANO_BANANA_PRO_MODEL.key,
      prompt: validatedInput.prompt.substring(0, 50),
      imageCount: validatedInput.image_input?.length || 0,
      resolution: validatedInput.resolution,
    })

    // Call model with retry logic
    console.log('🍌 [NanoBananaPro] Calling Replicate.run...', {
      telegram_id,
      model: NANO_BANANA_PRO_MODEL.key,
    })

    const maxRetries = 2
    let output: any = null
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [NanoBananaPro] Attempt ${attempt}/${maxRetries}`, {
          telegram_id,
        })

        const input: Record<string, any> = {
          prompt: validatedInput.prompt,
          aspect_ratio: validatedInput.aspect_ratio,
          resolution: validatedInput.resolution,
          output_format: validatedInput.output_format,
          safety_filter_level: validatedInput.safety_filter_level,
        }

        // Add image_input only if provided
        if (
          validatedInput.image_input &&
          validatedInput.image_input.length > 0
        ) {
          input.image_input = validatedInput.image_input
        }

        output = await replicate.run(NANO_BANANA_PRO_MODEL.key as any, {
          input,
        })

        console.log(`✅ [NanoBananaPro] Success on attempt ${attempt}`, {
          telegram_id,
        })
        break
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        console.warn(`⚠️ [NanoBananaPro] Attempt ${attempt} failed:`, {
          telegram_id,
          error: lastError.message,
          attemptsRemaining: maxRetries - attempt,
        })

        if (attempt === maxRetries) {
          console.error(
            `❌ [NanoBananaPro] All ${maxRetries} attempts failed`,
            { telegram_id }
          )
          break
        }

        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    if (!output && lastError) {
      throw lastError
    }

    console.log('🖼️ [NanoBananaPro] Replicate output received:', {
      telegram_id,
      outputType: typeof output,
      isArray: Array.isArray(output),
      outputValue: output,
    })

    // Extract image URL
    const imageUrl = extractImageUrl(output)

    if (!imageUrl) {
      console.error('❌ [NanoBananaPro] No image URL found in response!', {
        telegram_id,
        output,
      })
      throw new Error('No image URL in Nano Banana Pro response')
    }

    console.log('✨ [NanoBananaPro] Image URL extracted successfully!', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // Delete status message
    if (statusMessage) {
      try {
        await ctx.deleteMessage(statusMessage.message_id)
      } catch (err) {
        logger.warn('[NanoBananaPro] Failed to delete status message', { err })
      }
    }

    // Save prompt to database
    let promptId: number
    try {
      promptId = await savePrompt(
        validatedInput.prompt,
        NANO_BANANA_PRO_MODEL.name,
        imageUrl,
        typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id,
        'success'
      )

      console.log('🍌 [NanoBananaPro] Prompt saved to database:', {
        telegram_id,
        promptId,
      })
    } catch (saveError) {
      console.error('🚨 [NanoBananaPro] Failed to save prompt:', saveError)
      promptId = 0
    }

    // Send image to user
    if (!params.silent) {
      const caption = is_ru
        ? `✨ Ваше изображение готово!\n\n💫 Стоимость: ${totalCost}⭐\n📐 Разрешение: ${resolution}`
        : `✨ Your image is ready!\n\n💫 Cost: ${totalCost}⭐\n📐 Resolution: ${resolution}`

      console.log('🚀 [NanoBananaPro] Sending photo to user', {
        telegram_id,
        imageUrl: imageUrl.substring(0, 50) + '...',
      })

      const sendResult = await sendPhotoWithFallback(ctx, imageUrl, { caption })

      if (!sendResult) {
        console.error('❌ [NanoBananaPro] Failed to send photo!', {
          telegram_id,
        })
        throw new Error('Failed to send photo to user')
      }

      console.log('📬 [NanoBananaPro] Photo sent successfully!', {
        telegram_id,
      })
    } else {
      console.log('🔇 [NanoBananaPro] Silent mode - skipping photo send', {
        telegram_id,
      })
    }

    // Send to pulse channel
    try {
      const { sendMediaToPulse } = await import('@/helpers/pulse')
      await sendMediaToPulse({
        mediaType: 'photo',
        mediaSource: imageUrl,
        telegramId: telegram_id,
        username: username,
        language: is_ru ? 'ru' : 'en',
        serviceType: 'Google Nano Banana Pro',
        prompt: validatedInput.prompt,
        botName: ctx.botInfo?.username || 'unknown',
        additionalInfo: {
          Model: NANO_BANANA_PRO_MODEL.name,
          Resolution: resolution,
          'Aspect Ratio': validatedInput.aspect_ratio,
          'Output Format': validatedInput.output_format,
          Price: `${totalCost} stars`,
        },
      })

      console.log('✅ [NanoBananaPro] Pulse channel send SUCCESS!', {
        telegram_id,
      })
    } catch (pulseError) {
      console.error('❌ [NanoBananaPro] Pulse channel ERROR:', {
        telegram_id,
        error: (pulseError as any)?.message || pulseError,
      })
    }

    return imageUrl
  } catch (error) {
    console.error('🔴 [NanoBananaPro] CRITICAL ERROR:', {
      telegram_id: params.telegram_id,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
    })

    logger.error('[NanoBananaPro] Generation failed', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

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
      const adminMessage = `🚨 Ошибка в generateNanoBananaProReplicate

👤 User: ${params.telegram_id} (@${params.username})
❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}
🎯 Prompt: ${params.promptText.substring(0, 100)}...

Проверьте логи для деталей.`

      for (const adminId of adminIds) {
        await params.ctx.telegram
          .sendMessage(adminId, adminMessage, {
            parse_mode: undefined,
          })
          .catch(err => {
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
