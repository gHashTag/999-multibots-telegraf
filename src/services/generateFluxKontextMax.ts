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
  FluxKontextMaxInputSchema,
  FluxKontextMaxResponseSchema,
  FluxKontextMaxInput,
  FluxKontextMaxResponse,
  FLUX_KONTEXT_MAX_AVATAR_CONFIG,
  FluxKontextMaxAspectRatio,
  FluxKontextMaxAspectRatioSchema,
  getFluxKontextMaxDimensions,
} from '@/schemas/fluxKontextMax.schema'

/**
 * Portrait by default -- the shape of stories and reels, which is where these
 * images go. It applies only when the person has NOT chosen a format
 * themselves: their own choice from `users.aspect_ratio` still comes first.
 */
const DEFAULT_ASPECT_RATIO: FluxKontextMaxAspectRatio = '9:16'

// Service parameters interface
export interface FluxKontextMaxServiceParams {
  prompt: string
  inputImageUrl?: string
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  seed?: number
  aspect_ratio?: FluxKontextMaxAspectRatio
  output_format?: 'png' | 'jpg'
  safety_tolerance?: number
  suppressUserErrors?: boolean // ✅ Don't notify user of errors (for fallback chains)
  is_welcome_gift?: boolean // ✅ Skip payment for welcome generation (lead magnet)
  skipBalanceCheck?: boolean // If true, skip balance check (already charged before loop)
  chargedCostOverride?: number // Batch mode: exact per-image amount already charged (batchBase*mult); refund THIS on failure, not the flat service base (batchBase can exceed serviceBase -- see #1263)
}

// FLUX Kontext Max model configuration
const FLUX_KONTEXT_MAX_MODEL = {
  key: 'black-forest-labs/flux-kontext-max',
  costPerImage: calculateFinalImageCostInStars(0.08), // Updated: Replicate actual price $0.08
  name: 'FLUX Kontext Max',
  description_en:
    'Black Forest Labs FLUX Kontext Max - Advanced image editing and transformation',
  description_ru:
    'Black Forest Labs FLUX Kontext Max - Продвинутое редактирование и трансформация изображений',
}

/**
 * Enhanced FLUX Kontext Max generation service with Zod validation
 * Specialized for image editing and transformation
 */
export const generateFluxKontextMax = async (
  params: FluxKontextMaxServiceParams
): Promise<GenerationResult> => {
  console.log('🤖 [FluxKontextMax] Service called with params:', {
    telegram_id: params.telegram_id,
    promptLength: params.prompt?.length,
    hasInputImage: !!params.inputImageUrl,
    aspect_ratio: params.aspect_ratio,
    username: params.username,
    is_ru: params.is_ru,
  })

  // The downloaded temp file is unlinked on the success path; track it here so
  // the outer catch can remove it too when delivery fails, instead of orphaning
  // it on disk (#1029 class).
  let tempFileToCleanup: string | null = null
  // Set once a refund has been issued, so the outer catch cannot refund a second
  // time after the inner save-failure catch already did (in a batch the lump charge
  // N*cost lets refundUser's netting pass a second per-image credit). Mirrors #1649.
  let refunded = false
  // Armed only on a REAL charge (balanceCheck success, or batch skipBalanceCheck);
  // a welcome gift / insufficient-funds throw is never charged, so its failure must
  // not refund against an unrelated prior charge. Mirrors #1649 / SeedEdit3.
  let charged = false

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
      output_format = 'png',
      safety_tolerance = 2,
    } = params

    // ✅ Get centralized aspect_ratio from database and map to FLUX-compatible values
    const dbAspectRatio = await getAspectRatio(Number(telegram_id))

    // The person's stored ratio, honoured when the model knows it.
    //
    // This used to be a hand-written switch that rewrote '9:16' into
    // 'match_input_image' -- "to preserve portrait proportions". It preserved
    // the INPUT's proportions, and a Telegram avatar is square, so asking for
    // portrait delivered a square. The model accepts '9:16' directly
    // (schemas/fluxKontextMax.schema.ts names the source of that fact); the
    // switch existed only because this repo's enum was narrower than the API.
    // With the enum widened, the mapping is a membership test: known ratio
    // through, anything else to the portrait default.
    const mapToFluxAspectRatio = (
      ratio: string | null
    ): FluxKontextMaxAspectRatio => {
      const known = FluxKontextMaxAspectRatioSchema.safeParse(ratio)
      return known.success ? known.data : DEFAULT_ASPECT_RATIO
    }

    const mappedDbAspectRatio = dbAspectRatio
      ? mapToFluxAspectRatio(dbAspectRatio)
      : null
    const finalAspectRatio =
      mappedDbAspectRatio || aspect_ratio || DEFAULT_ASPECT_RATIO

    logger.info('FLUX Max aspect_ratio resolved', {
      telegram_id,
      dbAspectRatio,
      mappedDbAspectRatio,
      paramAspectRatio: aspect_ratio,
      finalAspectRatio,
    })

    // Validate and prepare input for FLUX Kontext Max API
    const fluxInput: FluxKontextMaxInput = {
      prompt,
      aspect_ratio: finalAspectRatio,
      output_format,
      safety_tolerance,
      ...(inputImageUrl ? { input_image: inputImageUrl } : {}),
      ...(seed !== undefined ? { seed } : {}),
    }

    // Validate input with Zod schema
    const validatedInput = FluxKontextMaxInputSchema.parse(fluxInput)

    console.log('🤖 [FluxKontextMax] Input validated successfully:', {
      telegram_id,
      validatedInput: {
        prompt: validatedInput.prompt.substring(0, 50) + '...',
        aspect_ratio: validatedInput.aspect_ratio,
        output_format: validatedInput.output_format,
        safety_tolerance: validatedInput.safety_tolerance,
        hasInputImage: !!validatedInput.input_image,
      },
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

    // Process balance operation - SKIP for welcome gifts (lead magnet) and for
    // batch flows that already charged before the loop (skipBalanceCheck),
    // mirroring generateFluxKontextPro. Without this, ALL_MODELS mode charged
    // twice: the batch total up front AND costPerImage here.
    if (!params.is_welcome_gift && !params.skipBalanceCheck) {
      const balanceCheck = await processBalanceOperation({
        ctx,
        telegram_id: Number(telegram_id),
        paymentAmount: FLUX_KONTEXT_MAX_MODEL.costPerImage,
        is_ru,
        bot_name: ctx?.botInfo?.username,
      })

      console.log('🤖 [FluxKontextMax] Balance check completed:', {
        success: balanceCheck.success,
        telegram_id,
      })

      if (!balanceCheck.success) {
        console.error('🚨 [FluxKontextMax] Balance check failed:', {
          telegram_id,
          balanceCheck,
        })
        throw new Error('Not enough stars')
      }
      charged = true
    } else {
      // Batch (skipBalanceCheck) was already charged by the caller and may be
      // refunded on failure; a welcome gift was never charged, so it must not.
      if (params.skipBalanceCheck && !params.is_welcome_gift) charged = true
      console.log('🎁 [FluxKontextMax] Skipping balance check - welcome gift', {
        telegram_id,
      })
    }

    // Send status message
    const statusMessage = is_ru
      ? '🤖 Обрабатываю изображение через FLUX Kontext Max...\n\n⏱ Это займет 10-20 секунд'
      : '🤖 Processing image via FLUX Kontext Max...\n\n⏱ This will take 10-20 seconds'

    const status = await ctx.reply(statusMessage)

    logger.info('[FluxKontextMax] Starting generation', {
      telegram_id,
      model: FLUX_KONTEXT_MAX_MODEL.key,
      promptLength: validatedInput.prompt.length,
      aspectRatio: validatedInput.aspect_ratio,
    })

    // Call FLUX Kontext Max API through Replicate
    const replicateInput = {
      prompt: validatedInput.prompt,
      aspect_ratio: validatedInput.aspect_ratio,
      output_format: validatedInput.output_format,
      safety_tolerance: validatedInput.safety_tolerance,
      ...(validatedInput.input_image
        ? { input_image: validatedInput.input_image }
        : {}),
      ...(validatedInput.seed !== undefined
        ? { seed: validatedInput.seed }
        : {}),
    }

    console.log('🤖 [FluxKontextMax] Calling Replicate API:', {
      telegram_id,
      model: FLUX_KONTEXT_MAX_MODEL.key,
      inputKeys: Object.keys(replicateInput),
    })

    const output = await replicate.run(FLUX_KONTEXT_MAX_MODEL.key as any, {
      input: replicateInput,
    })

    console.log('🤖 [FluxKontextMax] Replicate response received:', {
      telegram_id,
      outputType: typeof output,
      isString: typeof output === 'string',
    })

    // Process and validate the response
    let imageUrl: string
    let processedOutput: FluxKontextMaxResponse

    if (typeof output === 'string') {
      // Single image URL (most common case for FLUX)
      imageUrl = output
      const dimensions = getFluxKontextMaxDimensions(
        validatedInput.aspect_ratio
      )

      processedOutput = {
        image: output,
        metadata: {
          prompt: validatedInput.prompt,
          seed: validatedInput.seed || Math.floor(Math.random() * 2147483647),
          aspect_ratio: validatedInput.aspect_ratio,
          output_format: validatedInput.output_format,
          safety_tolerance: validatedInput.safety_tolerance,
          ...(dimensions ? { dimensions } : {}),
        },
      }
    } else if (
      typeof output === 'object' &&
      output !== null &&
      'output' in output
    ) {
      // Response wrapped in object
      imageUrl = (output as any).output
      const dimensions = getFluxKontextMaxDimensions(
        validatedInput.aspect_ratio
      )

      processedOutput = {
        image: imageUrl,
        metadata: {
          prompt: validatedInput.prompt,
          seed: validatedInput.seed || Math.floor(Math.random() * 2147483647),
          aspect_ratio: validatedInput.aspect_ratio,
          output_format: validatedInput.output_format,
          safety_tolerance: validatedInput.safety_tolerance,
          ...(dimensions ? { dimensions } : {}),
        },
      }
    } else {
      throw new Error('Invalid response format from FLUX Kontext Max API')
    }

    // Validate the response with Zod schema
    const validatedResponse =
      FluxKontextMaxResponseSchema.parse(processedOutput)

    console.log('🤖 [FluxKontextMax] Response validated successfully:', {
      telegram_id,
      imageUrl: validatedResponse.image.substring(0, 50) + '...',
      aspectRatio: validatedResponse.metadata.aspect_ratio,
    })

    // Delete status message
    try {
      await ctx.deleteMessage(status.message_id)
    } catch (err) {
      logger.warn('[FluxKontextMax] Failed to delete status message', { err })
    }

    // Download and save the image
    let savedImagePath: string
    try {
      const imageBuffer = await downloadFile(imageUrl)
      const filename = `flux_kontext_max_${telegram_id}_${Date.now()}.${validatedInput.output_format}`
      savedImagePath = await saveFileLocally(
        String(telegram_id),
        imageUrl,
        'ai-generation',
        `.${validatedInput.output_format}`
      )
      tempFileToCleanup = savedImagePath

      console.log('🤖 [FluxKontextMax] Image saved locally:', {
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
        '🚨 [FluxKontextMax] Failed to download/save image:',
        downloadError
      )
      throw new Error(`Failed to process generated image: ${originalMsg}`)
    }

    // Save prompt to database
    try {
      const promptId = await savePrompt(
        validatedInput.prompt,
        FLUX_KONTEXT_MAX_MODEL.name,
        imageUrl,
        Number(telegram_id),
        'success'
      )

      console.log('🤖 [FluxKontextMax] Prompt saved to database:', {
        telegram_id,
        promptId,
      })

      // Send success message with image
      const costLine = params.is_welcome_gift
        ? is_ru
          ? '🎁 Бесплатный подарок!'
          : '🎁 Free gift!'
        : is_ru
          ? `💰 Потрачено: ${FLUX_KONTEXT_MAX_MODEL.costPerImage}⭐`
          : `💰 Spent: ${FLUX_KONTEXT_MAX_MODEL.costPerImage}⭐`

      const caption = is_ru
        ? `✨ Изображение обработано через FLUX Kontext Max!\n\n🎨 Модель: ${FLUX_KONTEXT_MAX_MODEL.name}\n💫 Формат: ${validatedInput.aspect_ratio}\n${costLine}\n\n🤖 Создано ботом @${ctx.botInfo?.username || 'unknown'}`
        : `✨ Image processed with FLUX Kontext Max!\n\n🎨 Model: ${FLUX_KONTEXT_MAX_MODEL.name}\n💫 Format: ${validatedInput.aspect_ratio}\n${costLine}\n\n🤖 Created by @${ctx.botInfo?.username || 'unknown'}`

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
          serviceType: 'FLUX Kontext Max (Black Forest Labs)',
          prompt: validatedInput.prompt,
          botName: ctx.botInfo?.username || 'unknown',
          additionalInfo: {
            Model: FLUX_KONTEXT_MAX_MODEL.name,
            'Aspect Ratio': validatedInput.aspect_ratio,
            'Output Format': validatedInput.output_format,
            'Safety Level': validatedInput.safety_tolerance.toString(),
            Price: `${FLUX_KONTEXT_MAX_MODEL.costPerImage} stars`,
            Type: 'AI Image Transformation',
          },
        })

        logger.info('[FluxKontextMax] Sent to pulse channel', {
          telegram_id,
          imageUrl,
        })
      } catch (pulseError) {
        logger.error(
          '[FluxKontextMax] Failed to send to pulse channel:',
          pulseError
        )
      }

      // Clean up local file
      try {
        fs.unlinkSync(savedImagePath)
      } catch (cleanupError) {
        logger.warn(
          '[FluxKontextMax] Failed to cleanup local file:',
          cleanupError
        )
      }

      return {
        image: imageUrl,
        prompt_id: promptId,
      }
    } catch (saveError) {
      const originalMsg =
        saveError instanceof Error ? saveError.message : String(saveError)
      console.error('🚨 [FluxKontextMax] Failed to save prompt:', saveError)
      // Refund user if database save fails
      if (charged) {
        await refundUser(
          ctx,
          params.chargedCostOverride ?? FLUX_KONTEXT_MAX_MODEL.costPerImage,
          {
            reason: 'generation_failed',
          }
        )
        refunded = true
      }
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

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    const errorMsgLower = errorMessage.toLowerCase()

    // Классифицируем ошибку для понятного логирования
    let errorType = 'UNKNOWN'
    let isRetriable = false

    if (
      errorMsgLower.includes('e005') ||
      errorMsgLower.includes('flagged as sensitive') ||
      errorMsgLower.includes('nsfw') ||
      errorMsgLower.includes('safety')
    ) {
      errorType = 'NSFW_DETECTED'
      isRetriable = true // Система автоматически повторит через fallback
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
    }

    console.error('🚨 [FluxKontextMax] Generation failed:', {
      telegram_id: params.telegram_id,
      errorType,
      isRetriable,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // ✅ Информативное логирование с типом ошибки И САМИМ СООБЩЕНИЕМ
    const logMessage = isRetriable
      ? `[FluxKontextMax] ${errorType} - автоматический retry через fallback`
      : `[FluxKontextMax] ${errorType} - требует внимания`

    // Добавляем краткое описание ошибки для UNKNOWN
    const errorDetail =
      errorType === 'UNKNOWN' ? ` | ${errorMessage.substring(0, 100)}` : ''

    logger.error(`${logMessage}${errorDetail}`, {
      telegram_id: params.telegram_id,
      errorType,
      isRetriable,
      error: errorMessage,
    })

    // ✅ Only notify user if not in fallback mode
    if (!params.suppressUserErrors) {
      const errorMessage = params.is_ru
        ? '❌ Произошла ошибка при обработке изображения. Попробуйте позже.'
        : '❌ An error occurred during image processing. Please try later.'

      await params.ctx.reply(errorMessage)
    }

    // Refund only when a real charge occurred (`charged`) and it was not already
    // refunded by the inner save-failure catch (else a batch failure double-refunds).
    // `charged` excludes welcome gifts and the insufficient-funds throw (no mint).
    if (!refunded && charged) {
      await refundUser(
        params.ctx,
        params.chargedCostOverride ?? FLUX_KONTEXT_MAX_MODEL.costPerImage,
        {
          reason: 'generation_failed',
        }
      )
    }

    throw error
  }
}

/**
 * Advanced FLUX Kontext Max service with multiple modes
 * For complex image transformation scenarios
 */
export interface AdvancedFluxKontextMaxParams
  extends FluxKontextMaxServiceParams {
  mode:
    | 'quick'
    | 'single'
    | 'multi'
    | 'portrait_series'
    | 'haircut'
    | 'landmarks'
    | 'headshot'
  imageB?: string // Second image for multi mode
  cameraSettings?: string
}

export const generateAdvancedFluxKontextMax = async (
  params: AdvancedFluxKontextMaxParams
): Promise<GenerationResult> => {
  console.log('🚀 [AdvancedFluxKontextMax] Service called with params:', {
    telegram_id: params.telegram_id,
    mode: params.mode,
    hasImageB: !!params.imageB,
    cameraSettings: params.cameraSettings,
  })

  // Enhance prompt based on mode
  let enhancedPrompt = params.prompt

  switch (params.mode) {
    case 'headshot':
      enhancedPrompt = `Professional headshot portrait: ${params.prompt}. High quality studio lighting, sharp focus on face, professional photography style, 9:16 aspect ratio optimized for social media profile.`
      break
    case 'portrait_series':
      enhancedPrompt = `Portrait series style: ${params.prompt}. Consistent lighting and composition, professional photography series aesthetic.`
      break
    case 'haircut':
      enhancedPrompt = `Hair styling transformation: ${params.prompt}. Focus on hair details, modern styling, professional hair salon quality.`
      break
    case 'landmarks':
      enhancedPrompt = `Landmark-based transformation: ${params.prompt}. Maintain facial landmarks and key features while applying style.`
      break
    case 'multi':
      if (params.imageB) {
        enhancedPrompt = `Multi-image style transfer: ${params.prompt}. Blend characteristics from both reference images.`
      }
      break
    case 'quick':
      enhancedPrompt = `Quick style transfer: ${params.prompt}. Fast and efficient transformation.`
      break
    case 'single':
    default:
      enhancedPrompt = `Single image transformation: ${params.prompt}. High quality detailed transformation.`
      break
  }

  // Add camera settings if provided
  if (params.cameraSettings) {
    enhancedPrompt += ` Camera settings: ${params.cameraSettings}`
  }

  // Call the base service with enhanced prompt
  return generateFluxKontextMax({
    ...params,
    prompt: enhancedPrompt,
  })
}
