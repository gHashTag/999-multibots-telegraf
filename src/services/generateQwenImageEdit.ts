import { z } from 'zod'
import { ApiResponse, GenerationResult } from '@/interfaces'
import { replicate } from '@/core/replicate'
import { savePrompt } from '@/core/supabase'
import { processApiResponse } from '@/helpers/error'
import { pulse } from '@/helpers/pulse'
import { getUserBalance } from '@/core/supabase'
import { calculateFinalImageCostInStars } from '@/price/models/IMAGES_MODELS'
import { logger } from '@/utils/logger'
import {
  processBalanceOperation,
  refuseUnpaidGeneration,
  BalanceRefusedError,
} from '@/price/helpers'
import { refundUser } from '@/price/helpers/refundUser'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import fs from 'fs'
import {
  QwenImageEditInputSchema,
  QwenImageEditResponseSchema,
  QwenImageEditInput,
  QwenImageEditResponse,
  QWEN_IMAGE_EDIT_CONFIG,
  validateQwenImageEditInput,
  validateQwenImageEditResponse,
  detectLanguageAndAdjustMode,
} from '@/schemas/qwenImageEdit.schema'

// Service parameters interface
// ✅ REFACTOR: inputImageUrl FIRST (what to edit), then prompt (how to edit)
export interface QwenImageEditServiceParams {
  inputImageUrl: string // Required for Qwen Image Edit - WHAT to edit
  prompt: string // HOW to edit
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  size?: '1K' | '2K' | '4K' | 'custom'
  editing_mode?: 'semantic' | 'appearance' | 'auto'
  preserve_quality?: boolean
  silent?: boolean // If true, don't send photo to user (for ALL_MODELS mode)
  skipBalanceCheck?: boolean // If true, skip balance check (already checked before loop)
}

// Qwen Image Edit model configuration
const QWEN_IMAGE_EDIT_MODEL = {
  key: QWEN_IMAGE_EDIT_CONFIG.modelKey,
  costPerImage: calculateFinalImageCostInStars(QWEN_IMAGE_EDIT_CONFIG.costUSD),
  name: 'Qwen Edit (SOTA)',
  description_en: 'Qwen Image Edit - SOTA performance, bilingual text editing',
  description_ru:
    'Qwen Edit - SOTA производительность, билингвальное редактирование',
  emoji: '🔥',
}

/**
 * 🔥 Qwen Image Edit generation service with Zod validation
 * SOTA image editing with bilingual support (Chinese + English)
 */
export const generateQwenImageEdit = async (
  params: QwenImageEditServiceParams
): Promise<GenerationResult> => {
  logger.info('🔥 [QwenImageEdit] Service called with params:', {
    telegram_id: params.telegram_id,
    promptLength: params.prompt?.length,
    hasInputImage: !!params.inputImageUrl,
    editing_mode: params.editing_mode,
    username: params.username,
    is_ru: params.is_ru,
  })

  // Объявляем переменные до try для доступности в catch
  let totalCost = 0
  // This service refunded on `totalCost > 0` alone -- no record of whether a
  // charge ever happened. refundUser is ledger-guarded, but its guard matches
  // any charge of sufficient size in the window rather than this one, so an
  // uncharged failure could credit against an unrelated purchase. Mirrors the
  // `charged` gate the Pro and SeedEdit3 siblings already had.
  let charged = false
  // saveFileLocally persists a local copy that delivery never uses (it sends the
  // REMOTE imageUrl), so unlink it on every path -- same leak as fluxKontextPro
  // (#1537). Declared here so the finally can reach it.
  let tempFileToCleanup: string | null = null

  try {
    const {
      prompt,
      inputImageUrl,
      telegram_id,
      username,
      is_ru,
      ctx,
      editing_mode,
      size,
      preserve_quality = true,
    } = params

    // ✅ Validate input image is provided
    if (!inputImageUrl) {
      throw new Error('Qwen Image Edit requires an input image')
    }

    // ✅ Truncate prompt if too long
    let finalPrompt = prompt
    if (prompt.length > QWEN_IMAGE_EDIT_CONFIG.maxPromptLength) {
      logger.warn('⚠️ [QwenImageEdit] Prompt too long, truncating', {
        telegram_id,
        originalLength: prompt.length,
        maxLength: QWEN_IMAGE_EDIT_CONFIG.maxPromptLength,
      })
      finalPrompt = prompt.substring(0, QWEN_IMAGE_EDIT_CONFIG.maxPromptLength)
    }

    // ✅ Auto-detect language and adjust editing mode
    const autoDetectedMode =
      editing_mode || detectLanguageAndAdjustMode(finalPrompt)

    logger.info('🌐 [QwenImageEdit] Language detection:', {
      telegram_id,
      detectedMode: autoDetectedMode,
      hasChinese: /[\u4e00-\u9fa5]/.test(finalPrompt),
    })

    // ✅ Prepare Replicate API input with Zod validation
    const replicateInput: QwenImageEditInput = validateQwenImageEditInput({
      prompt: finalPrompt,
      image: inputImageUrl,
      editing_mode: autoDetectedMode,
      preserve_quality,
      output_format: 'png',
    })

    logger.info('🔥 [QwenImageEdit] Input validated successfully:', {
      telegram_id,
      validatedInput: {
        prompt: replicateInput.prompt.substring(0, 50) + '...',
        editing_mode: replicateInput.editing_mode,
        preserve_quality: replicateInput.preserve_quality,
        output_format: replicateInput.output_format,
      },
    })

    // ✅ Calculate cost (cheapest model!)
    const costPerImage = QWEN_IMAGE_EDIT_MODEL.costPerImage
    const qualityMultiplier = size === '4K' ? 6 : size === '2K' ? 4 : 1
    totalCost = costPerImage * qualityMultiplier

    logger.info('💰 [QwenImageEdit] Cost calculation:', {
      telegram_id,
      costPerImage,
      qualityMultiplier,
      totalCost,
      note: 'Cheapest model at $0.025 per image!',
    })

    // ✅ Check and deduct balance (skip if already checked before loop)
    if (!params.skipBalanceCheck) {
      logger.info('🔵 [QwenImageEdit] Processing balance operation...', {
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

      // Refuse BEFORE the status message and the provider call. This service
      // did not even keep the answer -- it read the result and dropped it.
      refuseUnpaidGeneration(balanceResult, {
        service: 'QwenImageEdit',
        telegram_id,
      })

      // `balanceResult.success === true` rather than a bare `true`, even though
      // refuseUnpaidGeneration above guarantees it. The refund downstream turns
      // on this flag, and a money guard should be readable as correct without
      // first reading another file to learn that a helper throws.
      charged = balanceResult.success === true

      logger.info('🟢 [QwenImageEdit] Balance check result:', {
        telegram_id,
        // was `!!balanceResult`: the truthiness of the RESULT OBJECT, always true.
        balanceCheckSuccess: balanceResult.success,
      })
    } else {
      // Batch mode: the caller charged before the loop, so a failure here
      // still owes a refund.
      charged = true
      logger.info(
        '⏭️ [QwenImageEdit] Skipping balance check (already verified)',
        {
          telegram_id,
        }
      )
    }

    // ✅ Send status message ONLY if NOT in silent mode
    if (!params.silent) {
      const modeText = is_ru
        ? autoDetectedMode === 'semantic'
          ? 'семантический'
          : autoDetectedMode === 'appearance'
            ? 'визуальный'
            : 'авто'
        : autoDetectedMode

      const statusMessage = await ctx.reply(
        is_ru
          ? `🔥 Обработка изображения с Qwen Edit (SOTA)...\n\n🎨 Режим: ${modeText}\n💰 Стоимость: ${totalCost}⭐`
          : `🔥 Processing image with Qwen Edit (SOTA)...\n\n🎨 Mode: ${modeText}\n💰 Cost: ${totalCost}⭐`
      )

      logger.info('✅ [QwenImageEdit] Status message sent!', {
        telegram_id,
        messageId: statusMessage.message_id,
      })
    } else {
      logger.info('🔇 [QwenImageEdit] Silent mode - skipping status message', {
        telegram_id,
      })
    }

    // ✅ Call Replicate API
    logger.info('🔥 [QwenImageEdit] Calling Replicate.run...', {
      telegram_id,
      model: QWEN_IMAGE_EDIT_MODEL.key,
    })

    let replicateOutput: unknown
    try {
      replicateOutput = await replicate.run(QWEN_IMAGE_EDIT_MODEL.key as any, {
        input: replicateInput,
      })

      logger.info('✅ [QwenImageEdit] Replicate API call completed!', {
        telegram_id,
        outputReceived: !!replicateOutput,
        outputType: typeof replicateOutput,
        isArray: Array.isArray(replicateOutput),
      })
    } catch (error) {
      logger.error('❌ [QwenImageEdit] Replicate API call failed!', {
        telegram_id,
        error: error instanceof Error ? error.message : String(error),
      })

      // ✅ Refund user on API failure (silent mode if needed)
      await refundUser(params.ctx, totalCost, {
        silent: params.silent || false,
        reason: 'generation_failed',
      })

      throw error
    }

    // ✅ Validate response with Zod
    const validatedResponse: QwenImageEditResponse =
      validateQwenImageEditResponse(replicateOutput)

    logger.info('✅ [QwenImageEdit] Response validated successfully!', {
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

    logger.info('✨ [QwenImageEdit] Image URL extracted successfully!', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // ✅ Save image locally
    const savedImagePath = await saveFileLocally(
      String(telegram_id),
      imageUrl,
      'qwen-image-edit',
      '.png'
    )

    tempFileToCleanup = savedImagePath

    logger.info('🔥 [QwenImageEdit] Image saved locally:', {
      telegram_id,
      savedImagePath,
    })

    // ✅ Save prompt to database
    const promptId = await savePrompt(
      finalPrompt,
      QWEN_IMAGE_EDIT_MODEL.name,
      imageUrl,
      Number(telegram_id),
      'success'
    )

    logger.info('🔥 [QwenImageEdit] Prompt saved to database:', {
      telegram_id,
      promptId,
    })

    // ✅ Send result to user
    logger.info('📮 [QwenImageEdit] Preparing to send photo...', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // ✅ Only send photo if NOT in silent mode (ALL_MODELS)
    if (!params.silent) {
      const caption = is_ru
        ? `✅ Готово!\n\n💰 Стоимость: ${totalCost}⭐`
        : `✅ Done!\n\n💰 Cost: ${totalCost}⭐`

      await ctx.replyWithPhoto({ url: imageUrl }, { caption })

      logger.info('📬 [QwenImageEdit] Photo sent successfully!', {
        telegram_id,
      })
    } else {
      logger.info('🔇 [QwenImageEdit] Silent mode - skipping photo send', {
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
        serviceType: 'Qwen Image Edit (SOTA)',
        prompt: finalPrompt,
        botName: ctx.botInfo?.username || 'unknown',
        additionalInfo: {
          Model: QWEN_IMAGE_EDIT_MODEL.name,
          'Editing Mode': autoDetectedMode,
          Cost: `${totalCost} stars`,
          Type: 'AI Image Editing',
        },
      })

      logger.info('✅ [QwenImageEdit] Pulse channel send SUCCESS!', {
        telegram_id,
      })
    } catch (pulseError) {
      logger.error(
        '⚠️ [QwenImageEdit] Pulse channel send failed (non-critical):',
        {
          telegram_id,
          error:
            pulseError instanceof Error
              ? pulseError.message
              : String(pulseError),
        }
      )
    }

    return {
      image: imageUrl,
      prompt_id: promptId || 0,
    }
  } catch (error) {
    // A refused charge is not a service failure. Re-thrown here, before
    // anything else in this catch, for two separate reasons:
    //
    //   1. ALERTS. Every logger.error in this process is a Telegram message to
    //      the owner (utils/logger.ts). Logging "QwenImageEdit Service error" for an empty
    //      wallet would page a human for a working system, once per broke
    //      customer.
    //   2. MONEY. The refund below must not run. The refusal happens before any
    //      charge, so a refund here would credit stars that were never taken --
    //      refundUser is ledger-guarded, but its guard matches any charge of
    //      sufficient size in the window, not this one.
    //
    // The caller decides what the person sees; refuseUnpaidGeneration has
    // already said whether they were told.
    if (error instanceof BalanceRefusedError) throw error

    logger.error('💥 [QwenImageEdit] Service error:', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // ✅ Refund on any outer error (if not already refunded in inner catch)
    try {
      if (charged && totalCost > 0 && params.ctx) {
        await refundUser(params.ctx, totalCost, {
          silent: params.silent || false,
          reason: 'generation_failed',
        })
        logger.info('💰 Balance refunded after QwenImageEdit error', {
          telegram_id: params.telegram_id,
          refundAmount: totalCost,
        })
      }
    } catch (refundError) {
      logger.error('Failed to refund after QwenImageEdit error', {
        telegram_id: params.telegram_id,
        refundError:
          refundError instanceof Error ? refundError.message : 'Unknown',
      })
    }

    throw error
  } finally {
    // Remove the orphaned local copy on every path (delivery used the remote url).
    if (tempFileToCleanup) {
      try {
        fs.unlinkSync(tempFileToCleanup)
      } catch {
        /* already gone or never created */
      }
    }
  }
}
