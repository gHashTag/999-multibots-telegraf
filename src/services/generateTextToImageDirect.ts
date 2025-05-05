import { ApiResponse, GenerationResult } from '@/interfaces'
import { replicate } from '@/core/replicate'
import { getAspectRatio, savePrompt } from '@/core/supabase'
import { downloadFile } from '@/helpers'
import { processApiResponse } from '@/helpers/error'
import { pulse } from '@/helpers/pulse'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { IMAGES_MODELS } from '@/price/models'
import { ModeEnum } from '@/interfaces/modes'
import { processBalanceOperation } from '@/price/helpers'
// import { PaymentType } from '@/interfaces/payments.interface'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import fs from 'fs'

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

    const balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: modelConfig.costPerImage * num_images,
      is_ru,
    })
    console.log(balanceCheck, 'balanceCheck')

    if (!balanceCheck.success) {
      throw new Error('Not enough stars')
    }

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

        const output: ApiResponse = (await replicate.run(modelId, {
          input: inputParams,
        })) as ApiResponse
        const imageUrl = await processApiResponse(output)

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
        throw error
      }
    }

    return results
  } catch (error) {
    console.error('Error generating images:', error)
    throw error
  }
}
