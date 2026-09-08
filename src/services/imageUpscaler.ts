import { ApiResponse, GenerationResult } from '@/interfaces'
import { replicate } from '@/core/replicate'
import { savePrompt } from '@/core/supabase'
import { processApiResponse } from '@/helpers/error'
import { pulse } from '@/helpers/pulse'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { processBalanceOperation } from '@/price/helpers'
import { refundUser } from '@/price/helpers/refundUser'
import { calculateFinalPriceInStars } from '@/interfaces/paidServices'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import fs from 'fs'
import { Markup } from 'telegraf'
import { getMainMenuText } from '@/navigation'
import {
  ACTION_PREFIX,
  topupButtonLabel,
} from '@/navigation/helpers/actionButtons'

// Простая клавиатура только для upscaler'а
const createUpscalerResultKeyboard = (is_ru: boolean) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        is_ru ? '⬆️ Ещё одно фото' : '⬆️ Another photo',
        'upscale_another_photo'
      ),
    ],
    [
      // The one place a person has just seen what this is worth. Measured
      // 2026-09-08: of everyone who ever generates, about one in five ever
      // reaches a price. act:topup is caught at bot level, and inside
      // neuroPhotoWizard -- the only scene that swallows unknown presses -- by
      // an explicit branch.
      Markup.button.callback(topupButtonLabel(is_ru), `${ACTION_PREFIX}topup`),
      Markup.button.callback(getMainMenuText(is_ru), 'go_main_menu'),
    ],
  ])
}

export interface ImageUpscalerParams {
  imageUrl: string
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  originalPrompt?: string
}

// Отдельная функция только для увеличения качества изображений
export const upscaleImage = async (
  params: ImageUpscalerParams
): Promise<GenerationResult> => {
  const { imageUrl, telegram_id, username, is_ru, ctx, originalPrompt } = params

  // Немедленное логирование при входе в функцию
  logger.info('⚡ UPSCALE_IMAGE FUNCTION CALLED', {
    telegram_id,
    username,
    imageUrl: imageUrl ? imageUrl.substring(0, 100) + '...' : 'NO_IMAGE_URL',
    originalPrompt: originalPrompt || 'NO_PROMPT',
    is_ru,
    timestamp: new Date().toISOString(),
  })

  console.log('🔵 UPSCALE_IMAGE CALLED FOR USER:', telegram_id)

  // Стоимость upscaling - обновленная цена $0.04 с наценкой 50%
  const clarityUpscalerCostUSD = 0.04
  const upscaleCost = calculateFinalPriceInStars(clarityUpscalerCostUSD)

  let balanceCheck: any = null

  try {
    // Проверка существования пользователя
    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }

    // Проверка баланса
    balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: upscaleCost,
      is_ru,
    })

    if (!balanceCheck.success) {
      throw new Error('Not enough stars')
    }

    // Отправка сообщения о начале upscaling
    logger.info('📨 Sending initial upscaling message', { telegram_id })
    console.log('🟡 SENDING INITIAL MESSAGE TO:', telegram_id)

    await ctx.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `⬆️ Увеличиваю качество изображения с помощью Clarity Upscaler...\n\n🎯 Режим: Увеличение в 2 раза\n💎 Стоимость: ${upscaleCost} ⭐`
        : `⬆️ Upscaling image quality with Clarity Upscaler...\n\n🎯 Mode: 2x enhancement\n💎 Cost: ${upscaleCost} ⭐`,
      {
        reply_markup: { remove_keyboard: true },
      }
    )

    logger.info('✅ Initial message sent successfully', { telegram_id })
    console.log('🟢 INITIAL MESSAGE SENT TO:', telegram_id)

    logger.info(`Image upscaling started`, {
      model: 'philz1337x/clarity-upscaler',
      telegram_id,
      originalPrompt: originalPrompt || 'Manual upscale',
      service: 'standalone_upscaler',
    })

    // Параметры для Clarity Upscaler
    const inputParams = {
      image: imageUrl,
      creativity: 0.1, // Минимальная креативность для сохранения оригинала
    }

    // Генерация upscaled изображения
    logger.info('Starting Replicate API call', {
      telegram_id,
      model: 'philz1337x/clarity-upscaler',
      inputParams,
    })

    // Bound the post-charge provider call. replicate.run polls the prediction
    // until it settles; a prediction stuck in 'starting'/'processing' would poll
    // forever, and the user has ALREADY been charged (line ~76). Without a
    // deadline the refund in the catch below is unreachable (no throw). Clarity
    // Upscaler finishes in seconds to ~1 min, so a longer wait is a stuck run,
    // not progress: time it out into the existing refund path.
    const UPSCALE_TIMEOUT_MS = 4 * 60 * 1000
    let upscaleTimer: ReturnType<typeof setTimeout> | undefined
    const output: ApiResponse = (await Promise.race([
      replicate.run(
        'philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
        {
          input: inputParams,
        }
      ),
      new Promise<never>((_, reject) => {
        upscaleTimer = setTimeout(
          () =>
            reject(
              new Error(
                `Clarity Upscaler timed out after ${UPSCALE_TIMEOUT_MS}ms`
              )
            ),
          UPSCALE_TIMEOUT_MS
        )
      }),
    ]).finally(() => {
      if (upscaleTimer) clearTimeout(upscaleTimer)
    })) as ApiResponse

    logger.info('Replicate API response received', {
      telegram_id,
      outputType: typeof output,
      outputLength: Array.isArray(output) ? output.length : 'not array',
      outputSample: JSON.stringify(output).substring(0, 200),
    })

    const upscaledImageUrl = await processApiResponse(output)

    logger.info('Processed API response', {
      telegram_id,
      upscaledImageUrl: upscaledImageUrl
        ? upscaledImageUrl.substring(0, 100) + '...'
        : 'null',
    })

    // Сохранение локально
    logger.info('Starting local file save', { telegram_id, upscaledImageUrl })
    const imageLocalPath = await saveFileLocally(
      telegram_id,
      upscaledImageUrl,
      'image-upscaler',
      '.webp'
    )
    logger.info('File saved locally', { telegram_id, imageLocalPath })

    const imageLocalUrl = `/uploads/${telegram_id}/image-upscaler/${path.basename(
      imageLocalPath
    )}`

    // Сохранение промпта
    logger.info('Saving prompt to database', { telegram_id })
    const prompt_id = await savePrompt(
      `IMAGE UPSCALER: ${originalPrompt || 'Manual image upscaling'}`,
      'philz1337x/clarity-upscaler',
      imageLocalUrl,
      Number(telegram_id),
      'success'
    )

    if (prompt_id === null) {
      throw new Error('prompt_id is null')
    }
    logger.info('Prompt saved successfully', { telegram_id, prompt_id })

    // Проверяем что файл существует перед отправкой
    if (!fs.existsSync(imageLocalPath)) {
      throw new Error(`File not found: ${imageLocalPath}`)
    }
    logger.info('File exists, preparing to send', {
      telegram_id,
      imageLocalPath,
    })

    // Отправка результата с простой клавиатурой
    const fileSize = fs.existsSync(imageLocalPath)
      ? fs.statSync(imageLocalPath).size
      : 0
    const MAX_PHOTO_SIZE = 10 * 1024 * 1024 // 10 MB limit for sendPhoto

    logger.info('Sending photo to Telegram', {
      telegram_id,
      fileExists: fs.existsSync(imageLocalPath),
      fileSize,
      willSendAsDocument: fileSize > MAX_PHOTO_SIZE,
    })

    const caption = is_ru
      ? `⬆️ Качество фото увеличено в 2 раза!\n\n🔧 Модель: Clarity Upscaler\n✨ Качество: Высокое разрешение\n💎 Стоимость: ${upscaleCost} ⭐${
          originalPrompt ? `\n📝 Исходное изображение: ${originalPrompt}` : ''
        }${fileSize > MAX_PHOTO_SIZE ? '\n\n📦 Файл отправлен как документ из-за большого размера' : ''}`
      : `⬆️ Photo quality enhanced 2x!\n\n🔧 Model: Clarity Upscaler\n✨ Quality: High resolution\n💎 Cost: ${upscaleCost} ⭐${
          originalPrompt ? `\n📝 Original image: ${originalPrompt}` : ''
        }${fileSize > MAX_PHOTO_SIZE ? '\n\n📦 Sent as document due to large file size' : ''}`

    try {
      // If file is too large for photo (>10 MB), send as document
      if (fileSize > MAX_PHOTO_SIZE) {
        logger.info('File size exceeds photo limit, sending as document', {
          telegram_id,
          fileSize,
          maxPhotoSize: MAX_PHOTO_SIZE,
        })

        const sendDocumentResult = await ctx.telegram.sendDocument(
          telegram_id,
          {
            source: fs.createReadStream(imageLocalPath),
            filename: 'upscaled_photo.webp',
          },
          {
            caption,
            reply_markup: createUpscalerResultKeyboard(is_ru).reply_markup,
          }
        )

        logger.info('Document sent successfully', {
          telegram_id,
          messageId: sendDocumentResult.message_id,
          chatId: sendDocumentResult.chat.id,
        })
      } else {
        // ✅ Если файл < 10MB - отправляем И как фото, И как документ
        // Сначала как фото (для просмотра)
        const sendPhotoResult = await ctx.telegram.sendPhoto(
          telegram_id,
          {
            source: fs.createReadStream(imageLocalPath),
          },
          {
            caption,
            reply_markup: createUpscalerResultKeyboard(is_ru).reply_markup,
          }
        )

        logger.info('Photo sent successfully', {
          telegram_id,
          messageId: sendPhotoResult.message_id,
          chatId: sendPhotoResult.chat.id,
        })

        // Потом как документ (для скачивания в полном качестве)
        const sendDocumentResult = await ctx.telegram.sendDocument(
          telegram_id,
          {
            source: fs.createReadStream(imageLocalPath),
            filename: 'upscaled_photo.webp',
          },
          {
            caption: is_ru
              ? '📥 Файл для скачивания в полном качестве'
              : '📥 File for download in full quality',
          }
        )

        logger.info('Document also sent for download', {
          telegram_id,
          messageId: sendDocumentResult.message_id,
          chatId: sendDocumentResult.chat.id,
        })
      }
    } catch (sendError) {
      logger.error('Failed to send photo/document to Telegram', {
        telegram_id,
        error:
          sendError instanceof Error ? sendError.message : 'Unknown send error',
        errorStack: sendError instanceof Error ? sendError.stack : undefined,
        imageLocalPath,
        fileSize,
      })
      throw sendError
    }

    // Pulse для аналитики
    await pulse(
      imageLocalPath,
      `UPSCALED: ${originalPrompt || 'Manual image upscaling'}`,
      '/image-upscaler',
      telegram_id,
      username,
      is_ru,
      ctx.botInfo?.username ?? 'unknown_bot'
    )

    logger.info(`Image upscaling completed successfully`, {
      prompt_id,
      telegram_id,
      model: 'philz1337x/clarity-upscaler',
      service: 'standalone_upscaler',
    })

    return { image: Buffer.alloc(0), prompt_id }
  } catch (error) {
    logger.error('Image upscaling failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: params.telegram_id,
      originalPrompt: params.originalPrompt,
      service: 'standalone_upscaler',
    })

    // Возврат средств при ошибке
    if (balanceCheck?.success) {
      logger.info('Refunding user due to upscaling failure', {
        telegram_id: params.telegram_id,
        amount: upscaleCost,
      })
      try {
        await refundUser(params.ctx, upscaleCost, {
          reason: 'generation_failed',
        })
      } catch (refundError) {
        logger.error('Failed to refund user after upscaling failure', {
          telegram_id: params.telegram_id,
          refundError:
            refundError instanceof Error
              ? refundError.message
              : 'Unknown refund error',
        })
      }
    }

    let errorMessageToUser = '❌ Произошла ошибка при увеличении качества.'
    if (error instanceof Error) {
      if (error.message && error.message.includes('Not enough stars')) {
        errorMessageToUser = params.is_ru
          ? '❌ Недостаточно звёзд для увеличения качества изображения.'
          : '❌ Not enough stars for image upscaling.'
      } else if (error.message) {
        const match = error.message.match(/{"detail":"(.*?)"/)
        if (match) {
          errorMessageToUser = `❌ ${match[1]}`
        }
      } else {
        errorMessageToUser = params.is_ru
          ? '❌ Произошла ошибка при увеличении качества. Средства возвращены на баланс.'
          : '❌ Error occurred during upscaling. Funds have been refunded.'
      }
    }

    await params.ctx.telegram.sendMessage(
      params.telegram_id,
      errorMessageToUser,
      {
        reply_markup: { remove_keyboard: true },
      }
    )

    throw error
  }
}
