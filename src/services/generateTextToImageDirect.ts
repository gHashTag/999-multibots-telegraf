import { ApiResponse, GenerationResult } from '@/interfaces'
import { replicate } from '@/core/replicate'
import { getAspectRatio, savePrompt } from '@/core/supabase'
import { downloadFile } from '@/helpers'
import { processApiResponse } from '@/helpers/error'
import { pulse } from '@/helpers/pulse'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
  getUserBalance,
} from '@/core/supabase'
import { IMAGES_MODELS } from '@/price/models'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { processBalanceOperation, refundUser } from '@/price/helpers'
// import { PaymentType } from '@/interfaces/payments.interface'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import fs from 'fs'
import { Markup } from 'telegraf'
const supportedSizes = [
  '1024x1024',
  '1365x1024',
  '1024x1365',
  '1536x1024',
  '1024x1536',
  '1820x1024',
  '1024x1820',
  '1024x2048',
  '2048x1024',
  '1434x1024',
  '1024x1434',
  '1024x1280',
  '1280x1024',
  '1024x1707',
  '1707x1024',
]

// Вспомогательная функция для создания клавиатуры (чтобы не дублировать код)
const createGenerationResultKeyboard = (is_ru: boolean) => {
  return Markup.keyboard([
    [{ text: '1️⃣' }, { text: '2️⃣' }, { text: '3️⃣' }, { text: '4️⃣' }],
    [
      { text: is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
      { text: is_ru ? '📐 Изменить размер' : '📐 Change size' },
    ],
    [{ text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' }],
  ])
    .resize()
    .oneTime(false) // Чтобы клавиатура не исчезала
}

export const generateTextToImageDirect = async (
  prompt: string,
  model_type: string,
  num_images: number,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  ctx: MyContext
): Promise<GenerationResult[]> => {
  try {
    const modelKey = model_type.toLowerCase()
    const modelConfig = IMAGES_MODELS[modelKey]
    console.log(modelConfig)

    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 10) {
      await updateUserLevelPlusOne(telegram_id, level)
    }

    if (!modelConfig) {
      throw new Error(`Неподдерживаемый тип модели: ${model_type}`)
    }

    // 💰 СПИСЫВАЕМ БАЛАНС ПЕРЕД генерацией
    const totalCost = modelConfig.costPerImage * num_images
    const balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: totalCost,
      is_ru,
    })
    console.log(balanceCheck, 'balanceCheck')

    if (!balanceCheck.success) {
      throw new Error('Not enough stars')
    }

    // 🔄 СОХРАНЯЕМ СТОИМОСТЬ для возможного возврата при ошибке
    let chargedAmount = totalCost
    let successfulGenerations = 0

    const userAspectRatio = await getAspectRatio(Number(telegram_id))
    const aspectRatioToUse = userAspectRatio || '1:1'

    const inputParams: {
      prompt: string
      size?: string
      aspect_ratio?: string
    } = {
      prompt,
    }

    if (model_type.toLowerCase().startsWith('recraft-ai/')) {
      const [widthRatio, heightRatio] = aspectRatioToUse.split(':').map(Number)
      const baseWidth = 1024
      const calculatedHeight = Math.round(
        (baseWidth / widthRatio) * heightRatio
      )
      const calculatedSize = `${baseWidth}x${calculatedHeight}`
      inputParams.size = supportedSizes.includes(calculatedSize)
        ? calculatedSize
        : '1024x1024'
    } else {
      inputParams.aspect_ratio = aspectRatioToUse
    }

    console.log(inputParams, 'input')

    const results: GenerationResult[] = []

    for (let i = 0; i < num_images; i++) {
      try {
        const modelId = Object.keys(IMAGES_MODELS).find(
          key => key === model_type.toLowerCase()
        ) as `${string}/${string}` | `${string}/${string}:${string}`
        console.log(modelId, 'modelId')
        if (num_images > 1) {
          ctx.telegram.sendMessage(
            telegram_id,
            is_ru
              ? `⏳ Генерация изображения ${i + 1} из ${num_images}`
              : `⏳ Generating image ${i + 1} of ${num_images}`
          )
        } else {
          ctx.telegram.sendMessage(
            telegram_id,
            is_ru ? '⏳ Генерация...' : '⏳ Generating...',
            {
              reply_markup: { remove_keyboard: true },
            }
          )
        }

        // ✅ FIX: Special handling for Midjourney v7
        let output: ApiResponse
        let imageUrl: string

        if (modelId && model_type.toLowerCase() === 'midjourney-v7') {
          logger.info('[generateTextToImageDirect] Using Midjourney generator')
          const { generateMidjourneyImage } = await import('./generateMidjourneyImage')
          const midjourneyResult = await generateMidjourneyImage({
            prompt: inputParams.prompt,
            aspectRatio: inputParams.aspect_ratio,
            numImages: 1,
            telegramId: telegram_id,
          })

          if (!midjourneyResult.success || !midjourneyResult.imageUrls || midjourneyResult.imageUrls.length === 0) {
            throw new Error(midjourneyResult.error || 'Midjourney generation failed')
          }

          imageUrl = midjourneyResult.imageUrls[0]
        } else {
          if (!modelId) {
            throw new Error(`Model ID not found for model type: ${model_type}`)
          }
          output = (await replicate.run(modelId, {
            input: inputParams,
          })) as ApiResponse
          imageUrl = await processApiResponse(output)
        }

        const imageLocalPath = await saveFileLocally(
          telegram_id,
          imageUrl,
          'text-to-image',
          '.jpeg'
        )

        const imageLocalUrl = `/uploads/${telegram_id}/text-to-image/${path.basename(
          imageLocalPath
        )}`

        const prompt_id = await savePrompt(
          prompt,
          modelId,
          imageLocalUrl,
          Number(telegram_id)
        )

        const image = await downloadFile(imageUrl)

        await ctx.telegram.sendPhoto(telegram_id, {
          source: fs.createReadStream(imageLocalPath),
        })

        await pulse(
          imageLocalPath,
          prompt,
          `/${model_type}`,
          telegram_id,
          username,
          is_ru,
          ctx.botInfo?.username ?? 'unknown_bot'
        )

        if (prompt_id === null) {
          throw new Error('prompt_id is null')
        }
        results.push({ image, prompt_id })
        successfulGenerations++ // ✅ Увеличиваем счетчик успешных генераций
      } catch (error) {
        console.error(`Попытка не удалась для изображения ${i + 1}:`, error)
        let errorMessageToUser = '❌ Произошла ошибка.'
        if (error instanceof Error) {
          if (
            error.message &&
            error.message.includes('NSFW content detected')
          ) {
            errorMessageToUser = is_ru
              ? '❌ Обнаружен NSFW контент. Пожалуйста, попробуйте другой запрос.'
              : '❌ NSFW content detected. Please try another prompt.'
          } else if (
            error.message.includes('failed to get HTTP URL content') ||
            error.message.includes('Bad Request')
          ) {
            errorMessageToUser = is_ru
              ? `❌ Не удалось загрузить изображение от модели ${modelConfig?.shortName || model_type}. Попробуйте другую модель.`
              : `❌ Failed to load image from ${modelConfig?.shortName || model_type} model. Try another model.`
          } else if (error.message) {
            const match = error.message.match(/{"detail":"(.*?)"/)
            if (match && match[1]) {
              errorMessageToUser = is_ru
                ? `❌ Ошибка: ${match[1]}`
                : `❌ Error: ${match[1]}`
            }
          }
        } else {
          errorMessageToUser = is_ru
            ? '❌ Произошла ошибка. Попробуйте еще раз.'
            : '❌ An error occurred. Please try again.'
        }
        await ctx.telegram.sendMessage(telegram_id, errorMessageToUser)

        // 💸 ВОЗВРАЩАЕМ ДЕНЬГИ за неудачную генерацию
        const failedImageCost = modelConfig.costPerImage
        logger.info(`[generateTextToImageDirect] Refunding ${failedImageCost} stars for failed image ${i + 1}/${num_images}`, {
          telegram_id,
          failedImage: i + 1,
          totalImages: num_images,
        })

        await refundUser(ctx, failedImageCost, true) // silent refund

        // Если это была первая/единственная картинка - прокидываем ошибку дальше
        if (num_images === 1 || i === 0) {
          throw error
        }
        // Иначе просто продолжаем со следующей картинкой
      }
    }

    if (results.length > 0) {
      try {
        const currentBalance = await getUserBalance(telegram_id) // Получаем АКТУАЛЬНЫЙ баланс
        logger.info(
          `[generateTextToImageDirect] Successfully generated ${results.length} image(s) for user ${telegram_id}. Final balance to show: ${currentBalance}`
        )

        const keyboard = createGenerationResultKeyboard(is_ru)

        await ctx.telegram.sendMessage(
          telegram_id,
          is_ru
            ? `Ваши изображения сгенерированы! (${
                results.length
              } шт.)\n\nЕсли хотите сгенерировать еще, выберите количество.\n\nВаш новый баланс: ${currentBalance.toFixed(
                2
              )} ⭐️`
            : `Your images have been generated! (${
                results.length
              } pcs.)\n\nWant to generate more? Select the quantity.\n\nYour new balance: ${currentBalance.toFixed(
                2
              )} ⭐️`,
          {
            reply_markup: keyboard.reply_markup,
          }
        )
      } catch (error) {
        logger.error(
          `[generateTextToImageDirect] Error sending final message with balance for user ${telegram_id}:`,
          error
        )
      }
    }

    return results
  } catch (error) {
    console.error('Error generating images:', error)
    throw error
  }
}
