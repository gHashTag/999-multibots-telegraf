import { ApiResponse, GenerationResult } from '@/interfaces'
import { replicate } from '@/core/replicate'
import { getAspectRatio, savePrompt } from '@/core/supabase'
import { downloadFile } from '@/helpers/downloadFile'
import { processApiResponse } from '@/helpers/error'
import { pulse } from '@/helpers/pulse'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { IMAGES_MODELS } from '@/config/models.config'
import { ModeEnum } from '@/interfaces/modes'
import { processBalanceOperation } from '@/price/helpers'
import { PaymentType } from '@/interfaces/payments.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import fs from 'fs'
import { logger } from '@/utils/logger'
import { calculateFinalStarPrice } from '@/price/calculator'

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

export const generateTextToImage = async (
  prompt: string,
  model_type: string,
  num_images: number,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot: Telegraf<MyContext>,
  ctx: MyContext
): Promise<GenerationResult[]> => {
  try {
    const modelKey = model_type.toLowerCase()
    const modelConfig = IMAGES_MODELS[modelKey]
    logger.info('Model Config:', { modelConfig })
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

    const costPerImageResult = calculateFinalStarPrice(ModeEnum.TextToImage, {
      modelId: modelKey,
    })
    if (!costPerImageResult) {
      throw new Error(`Could not calculate cost for model: ${modelKey}`)
    }
    const costPerImage = costPerImageResult.stars
    const totalCost = costPerImage * num_images

    const balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: totalCost,
      is_ru,
    })
    logger.info('Balance Check Result:', { balanceCheck })

    if (!balanceCheck.success) {
      throw new Error('Insufficient stars')
    }

    const aspect_ratio = await getAspectRatio(Number(telegram_id))

    let size: string | undefined
    if (model_type.toLowerCase() === 'recraft v3') {
      const [widthRatio, heightRatio] = aspect_ratio.split(':').map(Number)
      const baseWidth = 1024
      const calculatedHeight = Math.round(
        (baseWidth / widthRatio) * heightRatio
      )

      const calculatedSize = `${baseWidth}x${calculatedHeight}`

      size = supportedSizes.includes(calculatedSize)
        ? calculatedSize
        : '1024x1024'
    } else {
      size = '1024x1024'
    }

    const input = {
      prompt,
      ...(size ? { size } : { aspect_ratio }),
    }
    logger.info('Replicate Input:', { input })

    const results: GenerationResult[] = []

    for (let i = 0; i < num_images; i++) {
      try {
        const replicateModelKey = Object.keys(IMAGES_MODELS).find(
          key => key === model_type.toLowerCase()
        ) as `${string}/${string}` | `${string}/${string}:${string}` | undefined

        if (!replicateModelKey) {
          throw new Error(
            `Could not find Replicate model key for ${model_type}`
          )
        }

        logger.info(`Generating image ${i + 1}/${num_images}`, {
          replicateModelKey,
        })

        if (num_images > 1) {
          await bot.telegram.sendMessage(
            telegram_id,
            is_ru
              ? `⏳ Генерация изображения ${i + 1} из ${num_images}`
              : `⏳ Generating image ${i + 1} of ${num_images}`
          )
        } else {
          await bot.telegram.sendMessage(
            telegram_id,
            is_ru ? '⏳ Генерация...' : '⏳ Generating...',
            {
              reply_markup: { remove_keyboard: true },
            }
          )
        }

        const output: unknown = await replicate.run(replicateModelKey, {
          input,
        })

        // Обрабатываем API-ответ
        logger.info({
          message: '🔍 [DIRECT] Обработка ответа API Replicate',
          description: 'Processing Replicate API response',
          output_sample: JSON.stringify(output).substring(0, 100) + '...',
        })

        const imageUrl = await processApiResponse(output as string[] | string)

        // Проверка на валидность URL
        if (!imageUrl || !imageUrl.startsWith('http')) {
          throw new Error(`Invalid image URL: ${imageUrl}`)
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
          modelKey,
          imageLocalUrl,
          Number(telegram_id)
        )

        await bot.telegram.sendPhoto(telegram_id, {
          source: fs.createReadStream(imageLocalPath),
        })

        results.push({
          image: imageLocalUrl,
          prompt_id: prompt_id,
        })
      } catch (loopError) {
        logger.error(`Error generating image ${i + 1}:`, { error: loopError })
      }
    }

    if (results.length > 0) {
      await bot.telegram.sendMessage(
        telegram_id,
        is_ru
          ? `✅ ${results.length === 1 ? 'Ваше изображение' : 'Ваши изображения'} (${results.length} из ${num_images}) сгенерирован${results.length === 1 ? 'о' : 'ы'}!\n\nВыберите количество для следующей генерации или другую опцию.\n\nВаш баланс: ${(balanceCheck.newBalance ?? 0).toFixed(2)} ⭐️`
          : `✅ Your image${results.length === 1 ? '' : 's'} (${results.length}/${num_images}) ${results.length === 1 ? 'has' : 'have'} been generated!\n\nSelect quantity for next generation or another option.\n\nYour balance: ${(balanceCheck.newBalance ?? 0).toFixed(2)} ⭐️`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '1️⃣' }, { text: '2️⃣' }, { text: '3️⃣' }, { text: '4️⃣' }],
              [
                { text: is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
                { text: is_ru ? '📐 Изменить размер' : '📐 Change size' },
              ],
              [{ text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        }
      )
    } else {
      await bot.telegram.sendMessage(
        telegram_id,
        is_ru
          ? `❌ Не удалось сгенерировать изображения по вашему запросу. Попробуйте изменить промпт или модель.`
          : `❌ Failed to generate images for your request. Try changing the prompt or model.`
      )
    }

    return results
  } catch (error) {
    logger.error('Error in generateTextToImage:', { error })
    try {
      await ctx.reply(
        is_ru
          ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
          : 'An error occurred during image generation. Please try again later.'
      )
    } catch (replyError) {
      logger.error('Failed to send error reply:', { replyError })
    }
    return []
  }
}
