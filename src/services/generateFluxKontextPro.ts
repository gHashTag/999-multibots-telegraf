import { z } from 'zod'
import { ApiResponse, GenerationResult } from '@/interfaces'
import { replicate } from '@/core/replicate'
import { savePrompt } from '@/core/supabase'
import { processApiResponse } from '@/helpers/error'
import { pulse } from '@/helpers/pulse'
import { getUserBalance } from '@/core/supabase'
import { calculateFinalImageCostInStars } from '@/price/models/IMAGES_MODELS'
import { logger } from '@/utils/logger'
import { processBalanceOperation } from '@/price/helpers'
import { refundUser } from '@/price/helpers/refundUser'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import {
  FluxKontextProInputSchema,
  FluxKontextProResponseSchema,
  FluxKontextProInput,
  FluxKontextProResponse,
  FLUX_KONTEXT_PRO_CONFIG,
  validateFluxKontextProInput,
  validateFluxKontextProResponse,
} from '@/schemas/fluxKontextPro.schema'

// Service parameters interface
// ✅ REFACTOR: inputImageUrl FIRST (what to edit), then prompt (how to edit)
export interface FluxKontextProServiceParams {
  inputImageUrl: string // Required for FLUX Kontext Pro - WHAT to edit
  prompt: string // HOW to edit
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  size?: '1K' | '2K' | '4K' | 'custom'
  aspect_ratio?: string
  silent?: boolean // If true, don't send photo to user (for ALL_MODELS mode)
  skipBalanceCheck?: boolean // If true, skip balance check (already checked before loop)
}

// FLUX Kontext Pro model configuration
const FLUX_KONTEXT_PRO_MODEL = {
  key: FLUX_KONTEXT_PRO_CONFIG.modelKey,
  costPerImage: calculateFinalImageCostInStars(FLUX_KONTEXT_PRO_CONFIG.costUSD),
  name: 'FLUX Kontext Pro',
  description_en: 'FLUX Kontext Pro - 8x faster, Adobe Photoshop Beta integrated image editing',
  description_ru: 'FLUX Kontext Pro - в 8 раз быстрее, интегрировано с Adobe Photoshop Beta'
}

/**
 * ⚡ FLUX Kontext Pro generation service with Zod validation
 * Fast single-image editing with context preservation
 */
export const generateFluxKontextPro = async (
  params: FluxKontextProServiceParams
): Promise<GenerationResult> => {
  logger.info('⚡ [FluxKontextPro] Service called with params:', {
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
      aspect_ratio
    } = params

    // ✅ Validate input image is provided
    if (!inputImageUrl) {
      throw new Error('FLUX Kontext Pro requires an input image')
    }

    // ✅ Truncate prompt if too long
    let finalPrompt = prompt
    if (prompt.length > FLUX_KONTEXT_PRO_CONFIG.maxPromptLength) {
      logger.warn('⚠️ [FluxKontextPro] Prompt too long, truncating', {
        telegram_id,
        originalLength: prompt.length,
        maxLength: FLUX_KONTEXT_PRO_CONFIG.maxPromptLength,
      })
      finalPrompt = prompt.substring(0, FLUX_KONTEXT_PRO_CONFIG.maxPromptLength)
    }

    // ✅ Prepare Replicate API input with Zod validation
    const replicateInput: FluxKontextProInput = validateFluxKontextProInput({
      prompt: finalPrompt,
      input_image: inputImageUrl,
      aspect_ratio: aspect_ratio || FLUX_KONTEXT_PRO_CONFIG.defaultAspectRatio,
      output_format: 'png',
      output_quality: size === '4K' ? 100 : size === '2K' ? 90 : 80,
    })

    logger.info('⚡ [FluxKontextPro] Input validated successfully:', {
      telegram_id,
      validatedInput: {
        prompt: replicateInput.prompt.substring(0, 50) + '...',
        aspect_ratio: replicateInput.aspect_ratio,
        output_format: replicateInput.output_format,
      },
    })

    // ✅ Calculate cost
    const costPerImage = FLUX_KONTEXT_PRO_MODEL.costPerImage
    const qualityMultiplier = size === '4K' ? 6 : size === '2K' ? 4 : 1
    const totalCost = costPerImage * qualityMultiplier

    logger.info('💰 [FluxKontextPro] Cost calculation:', {
      telegram_id,
      costPerImage,
      qualityMultiplier,
      totalCost,
      size,
    })

    // ✅ Check and deduct balance (skip if already checked before loop)
    if (!params.skipBalanceCheck) {
      logger.info('🔵 [FluxKontextPro] Processing balance operation...', {
        telegram_id,
        totalCost,
      })

      const balanceResult = await processBalanceOperation({
        ctx,
        telegram_id: parseInt(telegram_id),
        paymentAmount: totalCost,
        is_ru,
        bot_name: ctx.botInfo.username,
      })

      logger.info('🟢 [FluxKontextPro] Balance check result:', {
        telegram_id,
        balanceCheckSuccess: !!balanceResult,
      })
    } else {
      logger.info('⏭️ [FluxKontextPro] Skipping balance check (already verified)', {
        telegram_id,
      })
    }

    // ✅ Send status message ONLY if NOT in silent mode
    if (!params.silent) {
      const statusMessage = await ctx.reply(
        is_ru
          ? `⚡ Обработка изображения с FLUX Kontext Pro...\n\n✨ Качество: ${size}\n💰 Стоимость: ${totalCost}⭐`
          : `⚡ Processing image with FLUX Kontext Pro...\n\n✨ Quality: ${size}\n💰 Cost: ${totalCost}⭐`
      )

      logger.info('✅ [FluxKontextPro] Status message sent!', {
        telegram_id,
        messageId: statusMessage.message_id,
      })
    } else {
      logger.info('🔇 [FluxKontextPro] Silent mode - skipping status message', {
        telegram_id,
      })
    }

    // ✅ Call Replicate API
    logger.info('⚡ [FluxKontextPro] Calling Replicate.run...', {
      telegram_id,
      model: FLUX_KONTEXT_PRO_MODEL.key,
    })

    let replicateOutput: unknown
    try {
      replicateOutput = await replicate.run(FLUX_KONTEXT_PRO_MODEL.key as any, {
        input: replicateInput,
      })

      logger.info('✅ [FluxKontextPro] Replicate API call completed!', {
        telegram_id,
        outputReceived: !!replicateOutput,
        outputType: typeof replicateOutput,
        isArray: Array.isArray(replicateOutput),
      })
    } catch (error) {
      logger.error('❌ [FluxKontextPro] Replicate API call failed!', {
        telegram_id,
        error: error instanceof Error ? error.message : String(error),
      })

      // ✅ Refund user on API failure
      await refundUser(ctx, totalCost)

      throw error
    }

    // ✅ Validate response with Zod
    const validatedResponse: FluxKontextProResponse = validateFluxKontextProResponse(replicateOutput)

    logger.info('✅ [FluxKontextPro] Response validated successfully!', {
      telegram_id,
      isArray: Array.isArray(validatedResponse),
    })

    // ✅ Extract image URL
    let imageUrl: string
    if (Array.isArray(validatedResponse)) {
      imageUrl = validatedResponse[0]
    } else {
      imageUrl = validatedResponse
    }

    logger.info('✨ [FluxKontextPro] Image URL extracted successfully!', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // ✅ Save image locally
    const savedImagePath = await saveFileLocally(
      String(telegram_id),
      imageUrl,
      'flux-kontext-pro',
      '.png'
    )

    logger.info('⚡ [FluxKontextPro] Image saved locally:', {
      telegram_id,
      savedImagePath,
    })

    // ✅ Save prompt to database
    const promptId = await savePrompt(
      finalPrompt,
      FLUX_KONTEXT_PRO_MODEL.name,
      imageUrl,
      Number(telegram_id)
    )

    logger.info('⚡ [FluxKontextPro] Prompt saved to database:', {
      telegram_id,
      promptId,
    })

    // ✅ Send result to user
    logger.info('📮 [FluxKontextPro] Preparing to send photo...', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // ✅ Only send photo if NOT in silent mode (ALL_MODELS)
    if (!params.silent) {
      const caption = is_ru
        ? `✅ Готово!\n\n⚡ Модель: ${FLUX_KONTEXT_PRO_MODEL.description_ru}\n💰 Потрачено: ${totalCost}⭐`
        : `✅ Done!\n\n⚡ Model: ${FLUX_KONTEXT_PRO_MODEL.description_en}\n💰 Cost: ${totalCost}⭐`

      await ctx.replyWithPhoto(
        { url: imageUrl },
        { caption }
      )

      logger.info('📬 [FluxKontextPro] Photo sent successfully!', {
        telegram_id,
      })
    } else {
      logger.info('🔇 [FluxKontextPro] Silent mode - skipping photo send', {
        telegram_id,
      })
    }

    // ✅ Send to pulse channel
    try {
      const { sendMediaToPulse } = await import('@/helpers/pulse')
      await sendMediaToPulse({
        mediaType: 'photo',
        mediaSource: imageUrl,
        telegramId: telegram_id,
        username: username || 'unknown',
        language: is_ru ? 'ru' : 'en',
        serviceType: 'FLUX Kontext Pro',
        prompt: finalPrompt,
        botName: ctx.botInfo?.username || 'unknown',
        additionalInfo: {
          'Model': FLUX_KONTEXT_PRO_MODEL.name,
          'Quality': size,
          'Cost': `${totalCost} stars`,
          'Type': 'AI Image Editing'
        }
      })

      logger.info('✅ [FluxKontextPro] Pulse channel send SUCCESS!', {
        telegram_id,
      })
    } catch (pulseError) {
      logger.error('⚠️ [FluxKontextPro] Pulse channel send failed (non-critical):', {
        telegram_id,
        error: pulseError instanceof Error ? pulseError.message : String(pulseError),
      })
    }

    return {
      image: imageUrl,
      prompt_id: promptId || 0,
    }
  } catch (error) {
    logger.error('💥 [FluxKontextPro] Service error:', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    throw error
  }
}
