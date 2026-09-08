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
 * Seedream 4.5 (ByteDance) API Schema via Replicate
 * Upgraded image model with stronger spatial understanding and world knowledge
 * Features: Superior Aesthetics, Higher Consistency, Smarter Instruction Following, Stronger Spatial Understanding
 */

// Input validation schema
export const Seedream45InputSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(4000, 'Prompt too long'),
  image_input: z
    .array(z.string().url())
    .max(14, 'Maximum 14 images allowed')
    .optional(),
  size: z.enum(['2K', '4K', 'custom']).default('2K'),
  aspect_ratio: z
    .enum([
      '1:1',
      '3:4',
      '4:3',
      '9:16',
      '16:9',
      '9:21',
      '21:9',
      'match_input_image',
    ])
    .default('match_input_image'),
  width: z.number().min(1024).max(4096).optional(),
  height: z.number().min(1024).max(4096).optional(),
  sequential_image_generation: z.enum(['disabled', 'auto']).default('disabled'),
  max_images: z.number().min(1).max(15).default(1),
})

export type Seedream45Input = z.infer<typeof Seedream45InputSchema>

// Service parameters interface
export interface Seedream45ServiceParams {
  telegram_id: string | number
  promptText: string
  inputImageUrl?: string | string[]
  ctx: MyContext
  username?: string
  is_ru?: boolean
  size?: '2K' | '4K' | 'custom'
  aspectRatio?:
    | '1:1'
    | '3:4'
    | '4:3'
    | '9:16'
    | '16:9'
    | '9:21'
    | '21:9'
    | 'match_input_image'
  width?: number
  height?: number
  silent?: boolean
  skipBalanceCheck?: boolean
  suppressUserErrors?: boolean
}

// Seedream 4.5 model configuration
const SEEDREAM_45_MODEL = {
  key: 'bytedance/seedream-4.5',
  costPerImage: 10, // Cost in stars (~$0.06 with markup)
  name: 'ByteDance Seedream 4.5',
  description_en:
    'Seedream 4.5 - Superior aesthetics, stronger spatial understanding, up to 4K',
  description_ru:
    'Seedream 4.5 - Превосходная эстетика, понимание пространства, до 4K',
  maxImages: 14,
}

/**
 * Extract image URLs from Replicate response (returns array)
 */
function extractImageUrls(output: unknown): string[] {
  try {
    if (Array.isArray(output)) {
      return output.filter(item => typeof item === 'string')
    }

    if (typeof output === 'string') {
      return [output]
    }

    if (typeof output === 'object' && output !== null) {
      if ('output' in output && Array.isArray((output as any).output)) {
        return (output as any).output.filter(
          (item: any) => typeof item === 'string'
        )
      }
    }

    return []
  } catch (error) {
    console.error('Failed to extract image URLs:', error)
    return []
  }
}

/**
 * Generate images using Replicate's ByteDance Seedream 4.5 model
 *
 * Features:
 * - Superior Aesthetics: Cinematic, film-like visuals
 * - Higher Consistency: Stable subjects across multiple images
 * - Smarter Instruction Following: Complex prompt interpretation
 * - Stronger Spatial Understanding: Realistic proportions and layout
 * - Up to 4K resolution support
 * - Multi-image input (up to 14 images)
 */
export async function generateSeedream45Replicate(
  params: Seedream45ServiceParams
): Promise<string | null> {
  let totalCost = SEEDREAM_45_MODEL.costPerImage

  try {
    console.log('🌱 [Seedream45] Service called with params:', {
      telegram_id: params.telegram_id,
      promptLength: params.promptText?.length,
      hasInputImage: !!params.inputImageUrl,
      size: params.size,
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
      size = '2K',
      aspectRatio = 'match_input_image',
      width,
      height,
    } = params

    // Prepare input images array (optional for this model)
    const imageInputArray = inputImageUrl
      ? Array.isArray(inputImageUrl)
        ? inputImageUrl
        : [inputImageUrl]
      : []

    // Truncate prompt to 4000 chars
    const MAX_PROMPT_LENGTH = 4000
    let truncatedPrompt = promptText
    if (promptText.length > MAX_PROMPT_LENGTH) {
      console.log(
        `⚠️ [Seedream45] Prompt too long (${promptText.length} chars), truncating to ${MAX_PROMPT_LENGTH}`
      )
      truncatedPrompt = promptText.substring(0, 3997) + '...'
    }

    // Build input object
    const seedream45Input: Seedream45Input = {
      prompt: truncatedPrompt,
      image_input: imageInputArray.length > 0 ? imageInputArray : undefined,
      size,
      aspect_ratio: aspectRatio,
      sequential_image_generation: 'disabled',
      max_images: 1,
    }

    // Add custom dimensions if size is 'custom'
    if (size === 'custom' && width && height) {
      seedream45Input.width = width
      seedream45Input.height = height
    }

    let validatedInput: Seedream45Input
    try {
      validatedInput = Seedream45InputSchema.parse(seedream45Input)
    } catch (validationError) {
      console.error('🚨 [Seedream45] Input validation failed:', {
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

    console.log('🌱 [Seedream45] Input validated successfully:', {
      telegram_id,
      prompt: validatedInput.prompt.substring(0, 50) + '...',
      imageCount: validatedInput.image_input?.length || 0,
      size: validatedInput.size,
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

    // Calculate cost (4K costs more)
    totalCost = size === '4K' ? 15 : SEEDREAM_45_MODEL.costPerImage

    console.log('💰 [Seedream45] Cost calculation:', {
      telegram_id,
      imageCount: validatedInput.image_input?.length || 0,
      costPerImage: totalCost,
      size,
    })

    // Validate image count
    const imageCount = validatedInput.image_input?.length || 0
    if (imageCount > SEEDREAM_45_MODEL.maxImages) {
      throw new Error(
        `Seedream 4.5 supports maximum ${SEEDREAM_45_MODEL.maxImages} images, but ${imageCount} were provided`
      )
    }

    // Check balance
    if (!params.skipBalanceCheck) {
      console.log('🔵 [Seedream45] Processing balance operation...', {
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

      console.log('🟢 [Seedream45] Balance check result:', {
        telegram_id,
        balanceCheckSuccess: balanceCheck?.success,
      })

      if (!balanceCheck.success) {
        logger.warn('[Seedream45] Insufficient balance', {
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
      console.log('⏭️ [Seedream45] Skipping balance check (already verified)', {
        telegram_id,
      })
    }

    // Send status message
    let statusMessage: any = null
    if (!params.silent) {
      console.log('📤 [Seedream45] Sending status message...', { telegram_id })

      statusMessage = await ctx.reply(
        is_ru
          ? `🌱 Генерирую изображение через Seedream 4.5...\n\n📐 Разрешение: ${size}\n⏱ Это займет 15-45 секунд`
          : `🌱 Generating image via Seedream 4.5...\n\n📐 Resolution: ${size}\n⏱ This will take 15-45 seconds`
      )

      console.log('✅ [Seedream45] Status message sent!', {
        telegram_id,
        messageId: statusMessage.message_id,
      })
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    })

    logger.info('[Seedream45] Starting generation', {
      telegram_id,
      model: SEEDREAM_45_MODEL.key,
      prompt: validatedInput.prompt.substring(0, 50),
      imageCount: validatedInput.image_input?.length || 0,
      size: validatedInput.size,
    })

    // Call model with retry logic
    console.log('🌱 [Seedream45] Calling Replicate.run...', {
      telegram_id,
      model: SEEDREAM_45_MODEL.key,
    })

    const maxRetries = 2
    let output: any = null
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [Seedream45] Attempt ${attempt}/${maxRetries}`, {
          telegram_id,
        })

        const input: Record<string, any> = {
          prompt: validatedInput.prompt,
          size: validatedInput.size,
          aspect_ratio: validatedInput.aspect_ratio,
          sequential_image_generation:
            validatedInput.sequential_image_generation,
          max_images: validatedInput.max_images,
        }

        // Add image_input only if provided
        if (
          validatedInput.image_input &&
          validatedInput.image_input.length > 0
        ) {
          input.image_input = validatedInput.image_input
        }

        // Add custom dimensions if specified
        if (
          validatedInput.size === 'custom' &&
          validatedInput.width &&
          validatedInput.height
        ) {
          input.width = validatedInput.width
          input.height = validatedInput.height
        }

        output = await replicate.run(SEEDREAM_45_MODEL.key as any, { input })

        console.log(`✅ [Seedream45] Success on attempt ${attempt}`, {
          telegram_id,
        })
        break
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        console.warn(`⚠️ [Seedream45] Attempt ${attempt} failed:`, {
          telegram_id,
          error: lastError.message,
          attemptsRemaining: maxRetries - attempt,
        })

        if (attempt === maxRetries) {
          console.error(`❌ [Seedream45] All ${maxRetries} attempts failed`, {
            telegram_id,
          })
          break
        }

        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    if (!output && lastError) {
      throw lastError
    }

    console.log('🖼️ [Seedream45] Replicate output received:', {
      telegram_id,
      outputType: typeof output,
      isArray: Array.isArray(output),
      outputLength: Array.isArray(output) ? output.length : 'N/A',
    })

    // Extract image URLs (Seedream returns array)
    const imageUrls = extractImageUrls(output)

    if (imageUrls.length === 0) {
      console.error('❌ [Seedream45] No image URLs found in response!', {
        telegram_id,
        output,
      })
      throw new Error('No image URLs in Seedream 4.5 response')
    }

    const imageUrl = imageUrls[0] // Use first image

    console.log('✨ [Seedream45] Image URL extracted successfully!', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
      totalImages: imageUrls.length,
    })

    // Delete status message
    if (statusMessage) {
      try {
        await ctx.deleteMessage(statusMessage.message_id)
      } catch (err) {
        logger.warn('[Seedream45] Failed to delete status message', { err })
      }
    }

    // Save prompt to database
    let promptId: number
    try {
      promptId = await savePrompt(
        validatedInput.prompt,
        SEEDREAM_45_MODEL.name,
        imageUrl,
        typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id,
        'success'
      )

      console.log('🌱 [Seedream45] Prompt saved to database:', {
        telegram_id,
        promptId,
      })
    } catch (saveError) {
      console.error('🚨 [Seedream45] Failed to save prompt:', saveError)
      promptId = 0
    }

    // Send image to user
    if (!params.silent) {
      const caption = is_ru
        ? `✨ Ваше изображение готово!\n\n💫 Стоимость: ${totalCost}⭐\n📐 Разрешение: ${size}`
        : `✨ Your image is ready!\n\n💫 Cost: ${totalCost}⭐\n📐 Resolution: ${size}`

      console.log('🚀 [Seedream45] Sending photo to user', {
        telegram_id,
        imageUrl: imageUrl.substring(0, 50) + '...',
      })

      const sendResult = await sendPhotoWithFallback(ctx, imageUrl, { caption })

      if (!sendResult) {
        console.error('❌ [Seedream45] Failed to send photo!', { telegram_id })
        throw new Error('Failed to send photo to user')
      }

      console.log('📬 [Seedream45] Photo sent successfully!', { telegram_id })
    } else {
      console.log('🔇 [Seedream45] Silent mode - skipping photo send', {
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
        serviceType: 'ByteDance Seedream 4.5',
        prompt: validatedInput.prompt,
        botName: ctx.botInfo?.username || 'unknown',
        additionalInfo: {
          Model: SEEDREAM_45_MODEL.name,
          Resolution: size,
          'Aspect Ratio': validatedInput.aspect_ratio,
          Price: `${totalCost} stars`,
        },
      })

      console.log('✅ [Seedream45] Pulse channel send SUCCESS!', {
        telegram_id,
      })
    } catch (pulseError) {
      console.error('❌ [Seedream45] Pulse channel ERROR:', {
        telegram_id,
        error: (pulseError as any)?.message || pulseError,
      })
    }

    return imageUrl
  } catch (error) {
    console.error('🔴 [Seedream45] CRITICAL ERROR:', {
      telegram_id: params.telegram_id,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
    })

    logger.error('[Seedream45] Generation failed', {
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
      const adminMessage = `🚨 Ошибка в generateSeedream45Replicate

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
