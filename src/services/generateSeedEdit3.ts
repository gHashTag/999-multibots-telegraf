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
import fs from 'fs'
import {
  SeedEdit3InputSchema,
  SeedEdit3ResponseSchema,
  SeedEdit3Input,
  SeedEdit3Response,
  SEEDEDIT3_CONFIG,
  validateSeedEdit3Input,
  validateSeedEdit3Response,
  mapQualityToResolution,
} from '@/schemas/seedEdit3.schema'

// Service parameters interface
// ✅ REFACTOR: inputImageUrl FIRST (what to edit), then prompt (how to edit)
export interface SeedEdit3ServiceParams {
  inputImageUrl: string // Required for SeedEdit 3.0 - WHAT to edit
  prompt: string // HOW to edit
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  size?: '1K' | '2K' | '4K' | 'custom'
  editing_strength?: number
  preserve_background?: boolean
  seed?: number
  silent?: boolean // If true, don't send photo to user (for ALL_MODELS mode)
  skipBalanceCheck?: boolean // If true, skip balance check (already checked before loop)
  chargedCostOverride?: number // Batch mode: exact per-image amount already charged (batchBase*mult); refund THIS on failure -- batchBase can exceed serviceBase (see #1266/#1267)
}

// SeedEdit 3.0 model configuration
const SEEDEDIT3_MODEL = {
  key: SEEDEDIT3_CONFIG.modelKey,
  costPerImage: calculateFinalImageCostInStars(SEEDEDIT3_CONFIG.costUSD),
  name: 'SeedEdit 3.0',
  description_en:
    'SeedEdit 3.0 - 56.1% usability, 4K support, superior detail preservation',
  description_ru:
    'SeedEdit 3.0 - 56.1% usability, поддержка 4K, лучшая детализация',
}

/**
 * 🎯 SeedEdit 3.0 generation service with Zod validation
 * Advanced image editing with 4K support and detail preservation
 */
export const generateSeedEdit3 = async (
  params: SeedEdit3ServiceParams
): Promise<GenerationResult> => {
  logger.info('🎯 [SeedEdit3] Service called with params:', {
    telegram_id: params.telegram_id,
    promptLength: params.prompt?.length,
    hasInputImage: !!params.inputImageUrl,
    size: params.size,
    username: params.username,
    is_ru: params.is_ru,
    editing_strength: params.editing_strength,
    preserve_background: params.preserve_background,
  })

  // Объявляем переменные до try для доступности в catch
  let totalCost = 0
  // `refunded` blocks an inner+outer double-refund (in a batch the lump charge
  // N*cost lets refundUser's netting pass a second per-image credit); `charged`
  // gates refunds on a REAL charge so an uncharged failure can't mint. Mirrors
  // generateFluxKontextPro (#1649).
  let refunded = false
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
      size = '2K',
      editing_strength = 0.7,
      preserve_background = true,
      seed,
    } = params

    // ✅ Validate input image is provided
    if (!inputImageUrl) {
      throw new Error('SeedEdit 3.0 requires an input image')
    }

    // ✅ Truncate prompt if too long
    let finalPrompt = prompt
    if (prompt.length > SEEDEDIT3_CONFIG.maxPromptLength) {
      logger.warn('⚠️ [SeedEdit3] Prompt too long, truncating', {
        telegram_id,
        originalLength: prompt.length,
        maxLength: SEEDEDIT3_CONFIG.maxPromptLength,
      })
      finalPrompt = prompt.substring(0, SEEDEDIT3_CONFIG.maxPromptLength)
    }

    // ✅ Map size to resolution
    const output_resolution =
      size === 'custom' ? '2048' : mapQualityToResolution(size)

    // ✅ Prepare Replicate API input with Zod validation
    const replicateInput: SeedEdit3Input = validateSeedEdit3Input({
      prompt: finalPrompt,
      image: inputImageUrl,
      output_resolution,
      editing_strength,
      preserve_background,
      seed,
      output_format: 'png',
    })

    logger.info('🎯 [SeedEdit3] Input validated successfully:', {
      telegram_id,
      validatedInput: {
        prompt: replicateInput.prompt.substring(0, 50) + '...',
        output_resolution: replicateInput.output_resolution,
        editing_strength: replicateInput.editing_strength,
        preserve_background: replicateInput.preserve_background,
        output_format: replicateInput.output_format,
      },
    })

    // ✅ Calculate cost
    const costPerImage = SEEDEDIT3_MODEL.costPerImage
    const qualityMultiplier = size === '4K' ? 6 : size === '2K' ? 4 : 1
    totalCost = costPerImage * qualityMultiplier

    logger.info('💰 [SeedEdit3] Cost calculation:', {
      telegram_id,
      costPerImage,
      qualityMultiplier,
      totalCost,
      size,
    })

    // ✅ Check and deduct balance (skip if already checked before loop)
    if (!params.skipBalanceCheck) {
      logger.info('🔵 [SeedEdit3] Processing balance operation...', {
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
      charged = balanceResult.success === true

      logger.info('🟢 [SeedEdit3] Balance check result:', {
        telegram_id,
        balanceCheckSuccess: !!balanceResult,
      })
    } else {
      // Batch mode: the caller already charged (chargedCostOverride) before the loop.
      charged = true
      logger.info('⏭️ [SeedEdit3] Skipping balance check (already verified)', {
        telegram_id,
      })
    }

    // ✅ Send status message ONLY if NOT in silent mode
    if (!params.silent) {
      const statusMessage = await ctx.reply(
        is_ru
          ? `🎯 Обработка изображения с SeedEdit 3.0...\n\n✨ Качество: ${size}\n🎨 Сила редактирования: ${editing_strength}\n💰 Стоимость: ${totalCost}⭐`
          : `🎯 Processing image with SeedEdit 3.0...\n\n✨ Quality: ${size}\n🎨 Editing strength: ${editing_strength}\n💰 Cost: ${totalCost}⭐`
      )

      logger.info('✅ [SeedEdit3] Status message sent!', {
        telegram_id,
        messageId: statusMessage.message_id,
      })
    } else {
      logger.info('🔇 [SeedEdit3] Silent mode - skipping status message', {
        telegram_id,
      })
    }

    // ✅ Call Replicate API
    logger.info('🎯 [SeedEdit3] Calling Replicate.run...', {
      telegram_id,
      model: SEEDEDIT3_MODEL.key,
    })

    let replicateOutput: unknown
    try {
      replicateOutput = await replicate.run(SEEDEDIT3_MODEL.key as any, {
        input: replicateInput,
      })

      logger.info('✅ [SeedEdit3] Replicate API call completed!', {
        telegram_id,
        outputReceived: !!replicateOutput,
        outputType: typeof replicateOutput,
        isArray: Array.isArray(replicateOutput),
      })
    } catch (error) {
      logger.error('❌ [SeedEdit3] Replicate API call failed!', {
        telegram_id,
        error: error instanceof Error ? error.message : String(error),
      })

      // ✅ Refund on API failure — only when a real charge occurred (`charged`),
      // so an uncharged (insufficient-funds) failure cannot mint against an
      // unrelated prior charge. `refunded` blocks a second refund in the outer catch.
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
    const validatedResponse: SeedEdit3Response =
      validateSeedEdit3Response(replicateOutput)

    logger.info('✅ [SeedEdit3] Response validated successfully!', {
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

    logger.info('✨ [SeedEdit3] Image URL extracted successfully!', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // ✅ Save image locally
    const savedImagePath = await saveFileLocally(
      String(telegram_id),
      imageUrl,
      'seededit-3',
      '.png'
    )

    tempFileToCleanup = savedImagePath

    logger.info('🎯 [SeedEdit3] Image saved locally:', {
      telegram_id,
      savedImagePath,
    })

    // ✅ Save prompt to database
    const promptId = await savePrompt(
      finalPrompt,
      SEEDEDIT3_MODEL.name,
      imageUrl,
      Number(telegram_id),
      'success'
    )

    logger.info('🎯 [SeedEdit3] Prompt saved to database:', {
      telegram_id,
      promptId,
    })

    // ✅ Send result to user
    logger.info('📮 [SeedEdit3] Preparing to send photo...', {
      telegram_id,
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // ✅ Only send photo if NOT in silent mode (ALL_MODELS)
    if (!params.silent) {
      const caption = is_ru
        ? `✅ Готово!\n\n🎯 Модель: ${SEEDEDIT3_MODEL.description_ru}\n💰 Потрачено: ${totalCost}⭐`
        : `✅ Done!\n\n🎯 Model: ${SEEDEDIT3_MODEL.description_en}\n💰 Cost: ${totalCost}⭐`

      await ctx.replyWithPhoto({ url: imageUrl }, { caption })

      logger.info('📬 [SeedEdit3] Photo sent successfully!', {
        telegram_id,
      })
    } else {
      logger.info('🔇 [SeedEdit3] Silent mode - skipping photo send', {
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
        serviceType: 'SeedEdit 3.0',
        prompt: finalPrompt,
        botName: ctx.botInfo?.username || 'unknown',
        additionalInfo: {
          Model: SEEDEDIT3_MODEL.name,
          Quality: size,
          'Editing Strength': editing_strength.toString(),
          Cost: `${totalCost} stars`,
          Type: 'AI Image Editing',
        },
      })

      logger.info('✅ [SeedEdit3] Pulse channel send SUCCESS!', {
        telegram_id,
      })
    } catch (pulseError) {
      logger.error('⚠️ [SeedEdit3] Pulse channel send failed (non-critical):', {
        telegram_id,
        error:
          pulseError instanceof Error ? pulseError.message : String(pulseError),
      })
    }

    return {
      image: imageUrl,
      prompt_id: promptId || 0,
    }
  } catch (error) {
    logger.error('💥 [SeedEdit3] Service error:', {
      telegram_id: params.telegram_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // ✅ Refund on any post-generation error the inner catch did not handle.
    // `!refunded` prevents an inner+outer double-refund; `charged` prevents a mint.
    try {
      if (!refunded && charged && params.ctx) {
        await refundUser(params.ctx, params.chargedCostOverride ?? totalCost, {
          silent: params.silent || false,
          reason: 'generation_failed',
        })
        logger.info('💰 Balance refunded after SeedEdit3 error', {
          telegram_id: params.telegram_id,
          refundAmount: totalCost,
        })
      }
    } catch (refundError) {
      logger.error('Failed to refund after SeedEdit3 error', {
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
