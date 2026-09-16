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
  chargedCostOverride?: number // Batch mode: exact per-image amount already charged (batchBase*mult); refund THIS on failure -- batchBase can exceed serviceBase (see #1266/#1267)
}

// FLUX Kontext Pro model configuration
const FLUX_KONTEXT_PRO_MODEL = {
  key: FLUX_KONTEXT_PRO_CONFIG.modelKey,
  costPerImage: calculateFinalImageCostInStars(FLUX_KONTEXT_PRO_CONFIG.costUSD),
  name: 'FLUX Kontext Pro',
  description_en:
    'FLUX Kontext Pro - 8x faster, Adobe Photoshop Beta integrated image editing',
  description_ru:
    'FLUX Kontext Pro - в 8 раз быстрее, интегрировано с Adobe Photoshop Beta',
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

  // saveFileLocally writes the generated image to disk, but delivery uses the
  // REMOTE imageUrl (ctx.replyWithPhoto({ url })), so the local copy is only
  // logged and never used -- and was never removed on either the success or the
  // error path, orphaning one PNG per call and slowly filling the uploads dir of
  // the long-running process. The Max sibling already tracks + unlinks it; mirror
  // that here with a finally so cleanup is guaranteed on every path.
  let tempFileToCleanup: string | null = null
  // Hoisted so the outer catch can refund the exact charge on any post-generation
  // failure (validate/save/savePrompt/delivery). The inner replicate.run catch
  // sets `refunded` so the outer refund never double-attempts. Mirrors
  // generateQwenImageEdit / generateFluxKontextMax — Pro was the sole image
  // service missing this refund.
  let totalCost = 0
  let refunded = false
  // Only refund when a REAL charge for this call occurred, so an uncharged
  // failure cannot credit against an unrelated prior charge (refundUser is
  // ledger-guarded, but keying on a real charge is the honest gate).
  //
  // This comment used to read "processBalanceOperation returns success:false on
  // insufficient funds yet the service continues". That was true, and writing it
  // down was as far as it went: the refund side got a guard and the DELIVERY
  // side never did, so the unpaid customer the sentence describes was served the
  // paid generation for free. refuseUnpaidGeneration now stops the call there,
  // which is why `charged` is a plain `true` below -- past the refusal there is
  // no unpaid path left to represent.
  let charged = false

  try {
    const {
      prompt,
      inputImageUrl,
      telegram_id,
      username,
      is_ru,
      ctx,
      size = '2K',
      aspect_ratio,
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
    totalCost = costPerImage * qualityMultiplier

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
      // Refuse BEFORE the status message and the provider call. Without this
      // the function announced that it was processing the image (line 207) and
      // ran the paid generation for a customer who had just been told they had
      // no stars.
      refuseUnpaidGeneration(balanceResult, {
        service: 'FluxKontextPro',
        telegram_id,
      })
      // `balanceResult.success === true` rather than a bare `true`, even though
      // refuseUnpaidGeneration above guarantees it. The refund downstream turns
      // on this flag, and a money guard should be readable as correct without
      // first reading another file to learn that a helper throws.
      charged = balanceResult.success === true

      logger.info('🟢 [FluxKontextPro] Balance check result:', {
        telegram_id,
        // was `!!balanceResult`: the truthiness of the RESULT OBJECT, which is
        // always true. The log said success on every refusal.
        balanceCheckSuccess: balanceResult.success,
      })
    } else {
      // Batch mode: the caller already charged (chargedCostOverride) before the loop.
      charged = true
      logger.info(
        '⏭️ [FluxKontextPro] Skipping balance check (already verified)',
        {
          telegram_id,
        }
      )
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

      // ✅ Refund on API failure — only when a real charge occurred (`charged`),
      // so an uncharged (insufficient-funds) failure cannot mint against an
      // unrelated prior charge. Mirrors the outer-catch gate.
      if (charged) {
        await refundUser(ctx, params.chargedCostOverride ?? totalCost, {
          silent: params.silent || false,
          reason: 'generation_failed',
        })
        refunded = true
      }

      throw error
    }

    // ✅ Validate response with Zod
    const validatedResponse: FluxKontextProResponse =
      validateFluxKontextProResponse(replicateOutput)

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

    tempFileToCleanup = savedImagePath

    logger.info('⚡ [FluxKontextPro] Image saved locally:', {
      telegram_id,
      savedImagePath,
    })

    // ✅ Save prompt to database
    const promptId = await savePrompt(
      finalPrompt,
      FLUX_KONTEXT_PRO_MODEL.name,
      imageUrl,
      Number(telegram_id),
      'success'
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
        ? `✅ Готово!\n\n💰 Стоимость: ${totalCost}⭐`
        : `✅ Done!\n\n💰 Cost: ${totalCost}⭐`

      await ctx.replyWithPhoto({ url: imageUrl }, { caption })

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
          Model: FLUX_KONTEXT_PRO_MODEL.name,
          Quality: size,
          Cost: `${totalCost} stars`,
          Type: 'AI Image Editing',
        },
      })

      logger.info('✅ [FluxKontextPro] Pulse channel send SUCCESS!', {
        telegram_id,
      })
    } catch (pulseError) {
      logger.error(
        '⚠️ [FluxKontextPro] Pulse channel send failed (non-critical):',
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
    //      the owner (utils/logger.ts). Logging "FluxKontextPro Service error" for an empty
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

    logger.error('💥 [FluxKontextPro] Service error:', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // ✅ Refund on any post-generation failure (validate/save/savePrompt/delivery)
    // the inner replicate.run catch did not already handle. refundUser is
    // ledger-guarded (refuses when no charge exists, nets prior refunds under a
    // per-user lock), so this cannot mint or double-refund; `refunded` avoids
    // even attempting it after the inner catch already refunded. Mirrors the
    // sibling Qwen/Max services.
    if (!refunded && charged && params.ctx) {
      try {
        await refundUser(params.ctx, params.chargedCostOverride ?? totalCost, {
          silent: params.silent || false,
          reason: 'generation_failed',
        })
      } catch (refundError) {
        logger.error('❌ [FluxKontextPro] Refund after service error failed', {
          telegram_id: params.telegram_id,
          error:
            refundError instanceof Error
              ? refundError.message
              : String(refundError),
        })
      }
    }

    throw error
  } finally {
    // Remove the orphaned local copy on every path (success and error). The file
    // is never used for delivery, so unlinking it is balance-neutral.
    if (tempFileToCleanup) {
      try {
        fs.unlinkSync(tempFileToCleanup)
      } catch {
        /* already gone or never created */
      }
    }
  }
}
