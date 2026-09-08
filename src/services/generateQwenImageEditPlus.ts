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
  QwenImageEditPlusInputSchema,
  QwenImageEditPlusResponseSchema,
  QwenImageEditPlusInput,
  QwenImageEditPlusResponse,
  QWEN_IMAGE_EDIT_PLUS_CONFIG,
  validateQwenImageEditPlusInput,
  extractImageUrlsFromQwenResponse,
} from '@/schemas/qwenImageEditPlus.schema'
import { standardButtons } from '@/navigation/helpers/actionButtons'

// Service parameters interface
// ✅ REFACTOR: inputImageUrl FIRST (what to edit), then prompt (how to edit)
export interface QwenImageEditPlusServiceParams {
  inputImageUrl: string | string[] // WHAT to edit
  prompt: string // HOW to edit
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  seed?: number
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:21'
  output_format?: 'webp' | 'jpg' | 'png'
  output_quality?: number
}

// Qwen Image Edit Plus model configuration
const QWEN_IMAGE_EDIT_PLUS_MODEL = {
  key: 'qwen/qwen-image-edit-plus',
  costPerImage: calculateFinalImageCostInStars(0.03), // Replicate pricing: $0.03 per image
  name: 'Qwen Image Edit Plus',
  description_en:
    'Qwen Image Edit Plus - Advanced multi-image editing with improved consistency',
  description_ru:
    'Qwen Image Edit Plus - Продвинутое редактирование множественных изображений',
}

/**
 * Enhanced Qwen Image Edit Plus generation service with Zod validation
 * Supports advanced multi-image editing with improved consistency
 */
export const generateQwenImageEditPlus = async (
  params: QwenImageEditPlusServiceParams
): Promise<GenerationResult> => {
  console.log('🎨 [QwenEditPlus] Service called with params:', {
    telegram_id: params.telegram_id,
    promptLength: params.prompt?.length,
    hasInputImage: !!params.inputImageUrl,
    username: params.username,
    is_ru: params.is_ru,
  })

  // Declare variables for wider scope
  let imageCount = 1
  let totalCost = QWEN_IMAGE_EDIT_PLUS_MODEL.costPerImage
  // The downloaded temp file is unlinked on the success path; track it here so
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
      seed,
      aspect_ratio,
      output_format = 'webp',
      output_quality = 90,
    } = params

    // ✅ PREPARE IMAGE INPUT - SUPPORT BOTH SINGLE URL AND ARRAYS
    const prepareImageInput = (imageUrl: string | string[]): string[] => {
      if (Array.isArray(imageUrl)) {
        logger.info('QwenEditPlus multi-image input detected', {
          telegram_id,
          imageCount: imageUrl.length,
        })
        return imageUrl.slice(0, 10) // Limit to max 10 images per schema
      } else {
        logger.info('QwenEditPlus single image input detected', {
          telegram_id,
        })
        return [imageUrl]
      }
    }

    const imageInput = prepareImageInput(inputImageUrl)

    // ✅ Get centralized aspect_ratio from database
    const dbAspectRatio = await getAspectRatio(Number(telegram_id))
    const finalAspectRatio = dbAspectRatio || aspect_ratio || '1:1'

    logger.info('QwenEditPlus aspect_ratio resolved', {
      telegram_id,
      dbAspectRatio,
      paramAspectRatio: aspect_ratio,
      finalAspectRatio,
    })

    // 🚨 CRITICAL: Truncate prompt to 1000 chars to avoid validation errors
    const MAX_PROMPT_LENGTH = 1000
    let truncatedPrompt = prompt
    if (prompt.length > MAX_PROMPT_LENGTH) {
      console.log(
        `⚠️ [QwenEditPlus] Prompt too long (${prompt.length} chars), truncating to ${MAX_PROMPT_LENGTH}`
      )
      // Truncate to 997 chars so that adding '...' results in exactly 1000
      truncatedPrompt = prompt.substring(0, 997) + '...'
    }

    // Validate and prepare input for Qwen API
    const qwenInput = {
      prompt: truncatedPrompt,
      image: imageInput,
      aspect_ratio: finalAspectRatio,
      output_format,
      output_quality,
      ...(seed !== undefined ? { seed } : {}),
    }

    // 🛡️ СТРОГАЯ ВАЛИДАЦИЯ С ДЕТАЛЬНЫМ ЛОГИРОВАНИЕМ
    const validation = validateQwenImageEditPlusInput(qwenInput)

    if (!validation.success) {
      const errorMessage = (validation as { success: false; error: string })
        .error
      logger.error('QwenEditPlus validation failed', {
        telegram_id,
        error: errorMessage,
        hasPrompt: !!qwenInput.prompt,
        imageCount: qwenInput.image.length,
      })
      throw new Error(`QwenEditPlus validation failed: ${errorMessage}`)
    }

    const validatedInput = validation.data

    logger.info('QwenEditPlus input validated', {
      telegram_id,
      aspect_ratio: validatedInput.aspect_ratio,
      output_format: validatedInput.output_format,
      imageInputCount: validatedInput.image.length,
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

    // ✅ CRITICAL FIX: Calculate total cost based on number of images
    imageCount = validatedInput.image.length
    totalCost = QWEN_IMAGE_EDIT_PLUS_MODEL.costPerImage * imageCount

    logger.info('QwenEditPlus multi-image pricing calculation', {
      telegram_id,
      costPerImage: QWEN_IMAGE_EDIT_PLUS_MODEL.costPerImage,
      imageCount,
      totalCost,
    })

    // Process balance operation with correct total cost
    const balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: totalCost,
      is_ru,
      bot_name: ctx?.botInfo?.username,
    })

    logger.info('QwenEditPlus balance check completed', {
      success: balanceCheck.success,
      telegram_id,
    })

    if (!balanceCheck.success) {
      logger.error('QwenEditPlus balance check failed', {
        telegram_id,
        success: balanceCheck.success,
      })

      const errorMessage = is_ru
        ? `❌ Недостаточно звезд для генерации\n\nТребуется: ${totalCost}⭐ (за ${imageCount} фото)\nВаш баланс: ${balanceCheck.currentBalance || 0}⭐\n\nПополните баланс через /start → 💎 Пополнить баланс`
        : `❌ Insufficient stars for generation\n\nRequired: ${totalCost}⭐ (for ${imageCount} photos)\nYour balance: ${balanceCheck.currentBalance || 0}⭐\n\nTop up via /start → 💎 Top up balance`

      // The refusal hands over the way to pay; standardButtons puts top-up first.
      await ctx.reply(errorMessage, standardButtons(is_ru))
      return { image: '', prompt_id: 0 }
    }

    // Send status message
    const statusMessage = is_ru
      ? '🎨 Редактирую изображения через Qwen Image Edit Plus...\n\n⏱ Это займет 15-30 секунд'
      : '🎨 Editing images via Qwen Image Edit Plus...\n\n⏱ This will take 15-30 seconds'

    const status = await ctx.reply(statusMessage)

    logger.info('[QwenEditPlus] Starting generation', {
      telegram_id,
      model: QWEN_IMAGE_EDIT_PLUS_MODEL.key,
      promptLength: validatedInput.prompt.length,
      imageCount: validatedInput.image.length,
    })

    // Call Qwen API through Replicate
    const replicateInput = {
      prompt: validatedInput.prompt,
      image: validatedInput.image,
      aspect_ratio: validatedInput.aspect_ratio,
      output_format: validatedInput.output_format,
      output_quality: validatedInput.output_quality,
      ...(validatedInput.seed !== undefined
        ? { seed: validatedInput.seed }
        : {}),
    }

    logger.info('QwenEditPlus calling Replicate API', {
      telegram_id,
      model: QWEN_IMAGE_EDIT_PLUS_MODEL.key,
      inputKeys: Object.keys(replicateInput),
    })

    const output = await replicate.run(QWEN_IMAGE_EDIT_PLUS_MODEL.key as any, {
      input: replicateInput,
    })

    logger.info('QwenEditPlus response received', {
      telegram_id,
      outputType: typeof output,
      isArray: Array.isArray(output),
      length: Array.isArray(output) ? output.length : 'N/A',
    })

    // Extract image URLs using schema utility
    const imageUrls = extractImageUrlsFromQwenResponse(output)

    if (!imageUrls.length) {
      console.error('❌ [QwenEditPlus] No image URLs found in response!', {
        telegram_id,
        output,
      })
      throw new Error('No image URLs in Qwen response')
    }

    console.log('✨ [QwenEditPlus] Image URLs extracted successfully!', {
      telegram_id,
      imageCount: imageUrls.length,
    })

    // Create validated response object
    const processedOutput: QwenImageEditPlusResponse = {
      images: imageUrls,
      metadata: {
        prompt: validatedInput.prompt,
        input_images_count: validatedInput.image.length,
        aspect_ratio: validatedInput.aspect_ratio,
        output_format: validatedInput.output_format,
        seed: validatedInput.seed,
      },
    }

    // Validate the response with Zod schema
    const validatedResponse =
      QwenImageEditPlusResponseSchema.parse(processedOutput)

    console.log('🎨 [QwenEditPlus] Response validated successfully:', {
      telegram_id,
      imageCount: validatedResponse.images.length,
    })

    // Delete status message
    try {
      await ctx.deleteMessage(status.message_id)
    } catch (err) {
      logger.warn('[QwenEditPlus] Failed to delete status message', { err })
    }

    // Use the first image URL for further processing
    const primaryImageUrl = imageUrls[0]

    // Download and save the image
    let savedImagePath: string
    try {
      const imageBuffer = await downloadFile(primaryImageUrl)
      savedImagePath = await saveFileLocally(
        String(telegram_id),
        primaryImageUrl,
        'ai-generation',
        '.webp'
      )
      tempFileToCleanup = savedImagePath

      console.log('🎨 [QwenEditPlus] Image saved locally:', {
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
        '🚨 [QwenEditPlus] Failed to download/save image:',
        downloadError
      )
      throw new Error(`Failed to process generated image: ${originalMsg}`)
    }

    // Save prompt to database
    try {
      const promptId = await savePrompt(
        validatedInput.prompt,
        QWEN_IMAGE_EDIT_PLUS_MODEL.name,
        primaryImageUrl,
        Number(telegram_id),
        'success'
      )

      console.log('🎨 [QwenEditPlus] Prompt saved to database:', {
        telegram_id,
        promptId,
      })

      // Send success message with image
      const caption = is_ru
        ? `✨ Изображения отредактированы через Qwen Image Edit Plus!\n\n🎨 Модель: ${QWEN_IMAGE_EDIT_PLUS_MODEL.name}\n🖼️ Изображений: ${imageCount}\n💰 Потрачено: ${totalCost}⭐\n\n🤖 Создано ботом @${ctx.botInfo?.username || 'unknown'}`
        : `✨ Images edited with Qwen Image Edit Plus!\n\n🎨 Model: ${QWEN_IMAGE_EDIT_PLUS_MODEL.name}\n🖼️ Images: ${imageCount}\n💰 Spent: ${totalCost}⭐\n\n🤖 Created by @${ctx.botInfo?.username || 'unknown'}`

      // Send the image using local file
      await ctx.replyWithPhoto({ source: savedImagePath }, { caption })

      // Send to pulse channel
      try {
        const { sendMediaToPulse } = await import('@/helpers/pulse')
        await sendMediaToPulse({
          mediaType: 'photo',
          mediaSource: primaryImageUrl,
          telegramId: telegram_id,
          username: username,
          language: is_ru ? 'ru' : 'en',
          serviceType: 'Qwen Image Edit Plus',
          prompt: validatedInput.prompt,
          botName: ctx.botInfo?.username || 'unknown',
          additionalInfo: {
            Model: QWEN_IMAGE_EDIT_PLUS_MODEL.name,
            Images: imageCount.toString(),
            Format: validatedInput.output_format,
            Price: `${QWEN_IMAGE_EDIT_PLUS_MODEL.costPerImage} stars`,
            Type: 'Multi-Image Editing',
          },
        })

        logger.info('[QwenEditPlus] Sent to pulse channel', {
          telegram_id,
          imageUrl: primaryImageUrl,
        })
      } catch (pulseError) {
        logger.error(
          '[QwenEditPlus] Failed to send to pulse channel:',
          pulseError
        )
      }

      // Clean up local file
      try {
        fs.unlinkSync(savedImagePath)
      } catch (cleanupError) {
        logger.warn(
          '[QwenEditPlus] Failed to cleanup local file:',
          cleanupError
        )
      }

      return {
        image: primaryImageUrl,
        prompt_id: promptId,
      }
    } catch (saveError) {
      const originalMsg =
        saveError instanceof Error ? saveError.message : String(saveError)
      console.error('🚨 [QwenEditPlus] Failed to save prompt:', saveError)
      // Refund user if database save fails
      await refundUser(ctx, totalCost, { reason: 'generation_failed' })
      throw new Error(`Failed to save generation record: ${originalMsg}`)
    }
  } catch (error) {
    // Remove the downloaded temp file if we failed before the success-path
    // cleanup ran, so a failed delivery does not orphan it on disk (#1029).
    if (tempFileToCleanup) {
      try {
        fs.unlinkSync(tempFileToCleanup)
      } catch {
        /* already gone or never created */
      }
    }

    console.error('🚨 [QwenEditPlus] Generation failed:', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    logger.error('[QwenEditPlus] Generation failed', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // Send error message to user
    const errorMessage = params.is_ru
      ? '❌ Произошла ошибка при редактировании изображений. Попробуйте позже.'
      : '❌ An error occurred during image editing. Please try later.'

    await params.ctx.reply(errorMessage)

    // Refund user
    await refundUser(params.ctx, totalCost, { reason: 'generation_failed' })

    throw error
  }
}
