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
  SeeDream4InputSchema,
  SeeDream4ResponseSchema,
  SeeDream4Input,
  SeeDream4Response,
  SEEDREAM4_AVATAR_CONFIG,
  getSeeDream4Dimensions,
  validateSeeDream4Input,
} from '@/schemas/seedream4.schema'
import { standardButtons } from '@/navigation/helpers/actionButtons'

// Service parameters interface
export interface SeeDream4ServiceParams {
  prompt: string
  inputImageUrl?: string | string[] // ✅ Support both single URL and array of URLs
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  size?: '1K' | '2K' | '4K' | 'custom'
  width?: number
  height?: number
  max_images?: number
  aspect_ratio?: string
  suppressUserErrors?: boolean // ✅ Don't notify user of errors (for fallback chains)
  is_welcome_gift?: boolean // ✅ Skip payment for welcome generation
}

// SeeDream-4 model configuration
const SEEDREAM4_MODEL = {
  key: 'bytedance/seedream-4',
  costPerImage: calculateFinalImageCostInStars(0.03), // Updated: Replicate actual price $0.03
  name: 'SeeDream-4',
  description_en:
    'ByteDance SeeDream-4 - Advanced image generation and transformation model',
  description_ru:
    'ByteDance SeeDream-4 - Продвинутая модель генерации и трансформации изображений',
}

/**
 * Enhanced SeeDream-4 generation service with Zod validation
 * Supports both text-to-image and image-to-image generation
 */
export const generateSeeDream4 = async (
  params: SeeDream4ServiceParams
): Promise<GenerationResult> => {
  console.log('🎭 [SeeDream4] Service called with params:', {
    telegram_id: params.telegram_id,
    promptLength: params.prompt?.length,
    hasInputImage: !!params.inputImageUrl,
    size: params.size,
    username: params.username,
    is_ru: params.is_ru,
  })

  // Declare variables for wider scope
  let imageCount = 1
  let totalCost = SEEDREAM4_MODEL.costPerImage
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
      size = '2K',
      width,
      height,
      max_images = 1,
      aspect_ratio,
    } = params

    // ✅ PREPARE IMAGE INPUT - SUPPORT BOTH SINGLE URL AND ARRAYS
    const prepareImageInput = (
      imageUrl?: string | string[]
    ): string[] | undefined => {
      if (!imageUrl) return undefined
      if (Array.isArray(imageUrl)) {
        logger.info('SeeDream4 multi-image input detected', {
          telegram_id,
          imageCount: imageUrl.length,
        })
        return imageUrl.slice(0, 10) // Limit to max 10 images per schema
      } else {
        logger.info('SeeDream4 single image input detected', {
          telegram_id,
        })
        return [imageUrl]
      }
    }

    const imageInput = prepareImageInput(inputImageUrl)

    // ✅ Get centralized aspect_ratio from database
    const dbAspectRatio = await getAspectRatio(Number(telegram_id))
    const finalAspectRatio = dbAspectRatio || aspect_ratio || '9:16'

    logger.info('SeeDream4 aspect_ratio resolved', {
      telegram_id,
      dbAspectRatio,
      paramAspectRatio: aspect_ratio,
      finalAspectRatio,
    })

    // Validate and prepare input for SeeDream-4 API
    const seeDream4Input = {
      prompt,
      size,
      max_images,
      aspect_ratio: finalAspectRatio,
      telegram_id,
      username,
      is_ru,
      ...(width && height && size === 'custom' ? { width, height } : {}),
      ...(imageInput ? { image_input: imageInput } : {}),
    }

    // 🛡️ СТРОГАЯ ВАЛИДАЦИЯ С ДЕТАЛЬНЫМ ЛОГИРОВАНИЕМ
    const validation = validateSeeDream4Input(seeDream4Input)

    if (!validation.success) {
      logger.error('SeeDream4 validation failed', {
        telegram_id,
        error: validation.error,
        hasPrompt: !!seeDream4Input.prompt,
        size: seeDream4Input.size,
      })
      throw new Error(`SeeDream4 validation failed: ${validation.error}`)
    }

    const validatedInput = validation.data

    logger.info('SeeDream4 input validated', {
      telegram_id,
      size: validatedInput.size,
      max_images: validatedInput.max_images,
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

    // ✅ CRITICAL FIX: Calculate total cost based on number of images
    imageCount = validatedInput.image_input?.length || 1
    totalCost = SEEDREAM4_MODEL.costPerImage * imageCount

    logger.info('SeeDream4 multi-image pricing calculation', {
      telegram_id,
      costPerImage: SEEDREAM4_MODEL.costPerImage,
      imageCount,
      totalCost,
    })

    // ✅ ТОЛЬКО ПРОВЕРКА БАЛАНСА БЕЗ СПИСАНИЯ (пропускаем для welcome gift)
    const currentBalance = await getUserBalance(telegram_id)

    logger.info('SeeDream4 balance check', {
      telegram_id,
      currentBalance,
      requiredCost: totalCost,
      hasEnough: currentBalance >= totalCost,
      isWelcomeGift: params.is_welcome_gift,
    })

    // 🎁 Welcome gift - пропускаем проверку баланса
    if (!params.is_welcome_gift && currentBalance < totalCost) {
      // ✅ Only notify user if not in fallback mode
      if (!params.suppressUserErrors) {
        const message = is_ru
          ? `❌ Недостаточно звезд на балансе.\n\n💰 Требуется: ${totalCost}⭐\n💎 У вас: ${currentBalance}⭐\n\n📱 Пополните — и продолжим.`
          : `❌ Insufficient stars balance.\n\n💰 Required: ${totalCost}⭐\n💎 You have: ${currentBalance}⭐\n\n📱 Top up and we continue.`

        // The refusal carries the way to pay: standardButtons puts top-up first.
        // Rationale in price/helpers/sendInsufficientStarsMessage.ts.
        await ctx.reply(message, standardButtons(is_ru))
      }

      // `warn`, not `error`: see the note on the identical line in
      // generateSeeDream45.ts. The customer already has the message and the
      // top-up button; the owner's alert group is for our failures.
      logger.warn('SeeDream4 insufficient balance', {
        telegram_id,
        currentBalance,
        requiredCost: totalCost,
      })

      throw new Error('Insufficient balance')
    }

    // Send status message
    const statusMessage = is_ru
      ? '🎭 Генерирую изображение через SeeDream-4 (ByteDance)...\n\n⏱ Это займет 15-30 секунд'
      : '🎭 Generating image via SeeDream-4 (ByteDance)...\n\n⏱ This will take 15-30 seconds'

    const status = await ctx.reply(statusMessage)

    logger.info('[SeeDream4] Starting generation', {
      telegram_id,
      model: SEEDREAM4_MODEL.key,
      promptLength: validatedInput.prompt.length,
      inputSize: validatedInput.size,
    })

    // Call SeeDream-4 API through Replicate
    const replicateInput = {
      prompt: validatedInput.prompt,
      ...(validatedInput.size !== 'custom'
        ? {
            size: validatedInput.size,
          }
        : {
            width: validatedInput.width,
            height: validatedInput.height,
          }),
      max_images: validatedInput.max_images,
      ...(validatedInput.image_input
        ? { image_input: validatedInput.image_input }
        : {}),
      aspect_ratio: finalAspectRatio,
    }

    logger.info('SeeDream4 calling Replicate API', {
      telegram_id,
      model: SEEDREAM4_MODEL.key,
      inputKeys: Object.keys(replicateInput),
    })

    const output = await replicate.run(SEEDREAM4_MODEL.key as any, {
      input: replicateInput,
    })

    logger.info('SeeDream4 response received', {
      telegram_id,
      outputType: typeof output,
      isArray: Array.isArray(output),
      length: Array.isArray(output) ? output.length : 'N/A',
    })

    // Process and validate the response
    let imageUrl: string
    let processedOutput: SeeDream4Response

    if (Array.isArray(output) && output.length > 0) {
      // Multiple images returned
      imageUrl = output[0]
      processedOutput = {
        images: output,
        metadata: {
          prompt: validatedInput.prompt,
          size: validatedInput.size,
          dimensions:
            validatedInput.size === 'custom'
              ? { width: validatedInput.width!, height: validatedInput.height! }
              : getSeeDream4Dimensions(validatedInput.size),
        },
      }
    } else if (typeof output === 'string') {
      // Single image URL
      imageUrl = output
      processedOutput = {
        images: [output],
        metadata: {
          prompt: validatedInput.prompt,
          size: validatedInput.size,
          dimensions:
            validatedInput.size === 'custom'
              ? { width: validatedInput.width!, height: validatedInput.height! }
              : getSeeDream4Dimensions(validatedInput.size),
        },
      }
    } else {
      throw new Error('Invalid response format from SeeDream-4 API')
    }

    // Validate the response with Zod schema
    const validatedResponse = SeeDream4ResponseSchema.parse(processedOutput)

    console.log('🎭 [SeeDream4] Response validated successfully:', {
      telegram_id,
      imageCount: validatedResponse.images.length,
      dimensions: validatedResponse.metadata.dimensions,
    })

    // Delete status message
    try {
      await ctx.deleteMessage(status.message_id)
    } catch (err) {
      logger.warn('[SeeDream4] Failed to delete status message', { err })
    }

    // Download and save the image
    let savedImagePath: string
    try {
      const imageBuffer = await downloadFile(imageUrl)
      const filename = `seedream4_${telegram_id}_${Date.now()}.png`
      savedImagePath = await saveFileLocally(
        String(telegram_id),
        imageUrl,
        'ai-generation',
        '.png'
      )
      tempFileToCleanup = savedImagePath

      console.log('🎭 [SeeDream4] Image saved locally:', {
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
        '🚨 [SeeDream4] Failed to download/save image:',
        downloadError
      )
      throw new Error(`Failed to process generated image: ${originalMsg}`)
    }

    // ✅ СПИСАНИЕ ЗВЕЗД ПОСЛЕ УСПЕШНОЙ ГЕНЕРАЦИИ (или пропуск для welcome gift)
    const balanceDeduction = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: totalCost,
      is_ru,
      bot_name: ctx?.botInfo?.username,
      is_welcome_gift: params.is_welcome_gift,
    })

    logger.info('SeeDream4 stars deducted after success', {
      telegram_id,
      deductedAmount: totalCost,
      newBalance: balanceDeduction.newBalance,
      success: balanceDeduction.success,
    })

    if (!balanceDeduction.success) {
      logger.error('SeeDream4 failed to deduct stars after generation', {
        telegram_id,
        totalCost,
      })
      // Не бросаем ошибку - изображение уже сгенерировано
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
        SEEDREAM4_MODEL.name,
        imageUrl,
        Number(telegram_id),
        'success'
      )

      console.log('🎭 [SeeDream4] Prompt saved to database:', {
        telegram_id,
        promptId,
      })

      // Send success message with image
      const caption = is_ru
        ? `✨ Изображение создано через SeeDream-4!\n\n🎨 Модель: ${SEEDREAM4_MODEL.name}\n💫 Размер: ${validatedInput.size}\n🖼️ Изображений: ${imageCount}\n💰 Потрачено: ${totalCost}⭐\n\n🤖 Создано ботом @${ctx.botInfo?.username || 'unknown'}`
        : `✨ Image created with SeeDream-4!\n\n🎨 Model: ${SEEDREAM4_MODEL.name}\n💫 Size: ${validatedInput.size}\n🖼️ Images: ${imageCount}\n💰 Spent: ${totalCost}⭐\n\n🤖 Created by @${ctx.botInfo?.username || 'unknown'}`

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
          serviceType: 'SeeDream-4 (ByteDance)',
          prompt: validatedInput.prompt,
          botName: ctx.botInfo?.username || 'unknown',
          additionalInfo: {
            Model: SEEDREAM4_MODEL.name,
            Size: validatedInput.size,
            Price: `${SEEDREAM4_MODEL.costPerImage} stars`,
            Type: 'AI Image Generation',
          },
        })

        logger.info('[SeeDream4] Sent to pulse channel', {
          telegram_id,
          imageUrl,
        })
      } catch (pulseError) {
        logger.error('[SeeDream4] Failed to send to pulse channel:', pulseError)
      }

      // Clean up local file
      try {
        fs.unlinkSync(savedImagePath)
      } catch (cleanupError) {
        logger.warn('[SeeDream4] Failed to cleanup local file:', cleanupError)
      }

      return {
        image: imageUrl,
        prompt_id: promptId,
      }
    } catch (saveError) {
      const originalMsg =
        saveError instanceof Error ? saveError.message : String(saveError)
      console.error('🚨 [SeeDream4] Failed to save prompt:', saveError)
      // ❌ НЕ ВОЗВРАЩАЕМ - звезды уже списаны после успешной генерации
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
    }

    console.error('🚨 [SeeDream4] Generation failed:', {
      telegram_id: params.telegram_id,
      errorType,
      isRetriable,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Добавляем краткое описание ошибки для UNKNOWN
    const errorDetail =
      errorType === 'UNKNOWN' ? ` | ${errorMessage.substring(0, 100)}` : ''
    const logMessage = isRetriable
      ? `[SeeDream4] ${errorType} - автоматический retry через fallback`
      : `[SeeDream4] ${errorType} - требует внимания`

    // See the note on the identical decision in generateSeeDream45.ts: the
    // narrow predicate, not `errorType`, because that classifier matches the
    // bare word 'balance' and would mute a database outage.
    const isCustomerWallet = isBalanceRefusal(errorMessage)
    logger[isCustomerWallet ? 'warn' : 'error'](`${logMessage}${errorDetail}`, {
      telegram_id: params.telegram_id,
      errorType,
      isRetriable,
      error: errorMessage,
    })

    // The charge happens after a successful generation, but delivery (saving
    // the record, sending the photo) can still throw afterwards — the image was
    // generated but never reached the user, and they paid for it. The old note
    // here ("we don't refund; if it failed after the charge the image is already
    // generated") missed that generated != delivered. Refund when we charged.
    // refundUser checks the ledger, so it only returns real, already-charged
    // stars (never a welcome gift, never more than was paid).
    if (refundOnFailure) {
      try {
        await refundUser(params.ctx, totalCost, {
          reason: 'generation_failed',
          service: 'SeeDream-4',
        })
      } catch (refundError) {
        logger.error('[SeeDream4] Failed to refund after post-charge failure', {
          telegram_id: params.telegram_id,
          totalCost,
          refundError,
        })
      }
    }

    // ✅ Only notify user if not in fallback mode
    if (!params.suppressUserErrors) {
      const errorMessage = params.is_ru
        ? '❌ Произошла ошибка при генерации изображения. Попробуйте позже.'
        : '❌ An error occurred during image generation. Please try later.'

      await params.ctx.reply(errorMessage)
    }

    throw error
  }
}
