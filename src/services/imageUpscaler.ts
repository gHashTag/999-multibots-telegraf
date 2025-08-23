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
      Markup.button.callback(
        is_ru ? '🏠 Главное меню' : '🏠 Main menu',
        'go_main_menu'
      ),
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
    await ctx.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `⬆️ Увеличиваю качество изображения с помощью Clarity Upscaler...\n\n🎯 Режим: Увеличение в 2 раза\n💎 Стоимость: ${upscaleCost} ⭐`
        : `⬆️ Upscaling image quality with Clarity Upscaler...\n\n🎯 Mode: 2x enhancement\n💎 Cost: ${upscaleCost} ⭐`,
      {
        reply_markup: { remove_keyboard: true },
      }
    )

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
    const output: ApiResponse = (await replicate.run(
      'philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
      {
        input: inputParams,
      }
    )) as ApiResponse

    const upscaledImageUrl = await processApiResponse(output)

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
      Number(telegram_id)
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
    logger.info('Sending photo to Telegram', { telegram_id })
    await ctx.telegram.sendPhoto(
      telegram_id,
      {
        source: fs.createReadStream(imageLocalPath),
      },
      {
        caption: is_ru
          ? `⬆️ Качество фото увеличено в 2 раза!\n\n🔧 Модель: Clarity Upscaler\n✨ Качество: Высокое разрешение\n💎 Стоимость: ${upscaleCost} ⭐${
              originalPrompt
                ? `\n📝 Исходное изображение: ${originalPrompt}`
                : ''
            }`
          : `⬆️ Photo quality enhanced 2x!\n\n🔧 Model: Clarity Upscaler\n✨ Quality: High resolution\n💎 Cost: ${upscaleCost} ⭐${
              originalPrompt ? `\n📝 Original image: ${originalPrompt}` : ''
            }`,
        reply_markup: createUpscalerResultKeyboard(is_ru).reply_markup,
      }
    )
    logger.info('Photo sent successfully', { telegram_id })

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
        await refundUser(params.ctx, upscaleCost)
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
