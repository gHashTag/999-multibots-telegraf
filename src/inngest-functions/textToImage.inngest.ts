import { GenerationResult } from '@/interfaces'
import { getBotByName } from '@/core/bot'
import { v4 as uuidv4 } from 'uuid'
import {
  updateUserLevelPlusOne,
  getAspectRatio,
  savePrompt,
  getUserByTelegramIdString,
} from '@/core/supabase'
import {
  downloadFile,
  processApiResponse,
  pulse,
  saveFileLocally,
  errorMessage,
  errorMessageAdmin,
} from '@/helpers'
import { replicate } from '@/core/replicate'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { API_URL } from '@/config'
import path from 'path'
import fs from 'fs'
import { inngest } from '@/core/inngest/clients'
import { IMAGES_MODELS } from '@/price/models/IMAGES_MODELS'

interface TextToImageEvent {
  data: {
    prompt: string
    model: string
    num_images: number
    telegram_id: string
    username?: string
    is_ru: boolean
    bot_name: string
  }
}

interface ApiImageResponse {
  output: string[]
}

type ImageResult =
  | { success: true; imageUrl: string }
  | { success: false; error: Error }

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

export const textToImageFunction = inngest.createFunction(
  {
    name: 'text-to-image-generation',
    id: 'text-to-image',
    concurrency: { limit: 5 },
    retries: 3,
  },
  { event: 'text-to-image.requested' },
  async ({ event, step }: any) => {
    let validatedParams: TextToImageEvent['data'] | null = null
    try {
      validatedParams = (await step.run('validate-input', () => {
        if (
          !event.data ||
          !event.data.prompt ||
          !event.data.model ||
          !event.data.num_images ||
          !event.data.telegram_id ||
          event.data.is_ru === undefined ||
          !event.data.bot_name
        ) {
          throw new Error('Missing required fields')
        }

        const validData: TextToImageEvent['data'] = {
          prompt: event.data.prompt,
          model: event.data.model,
          num_images: event.data.num_images,
          telegram_id: event.data.telegram_id,
          is_ru: event.data.is_ru,
          bot_name: event.data.bot_name,
        }

        if (event.data.username) {
          validData.username = event.data.username
        }

        return validData
      })) as TextToImageEvent['data']

      await step.run('get-user-info', async () => {
        const user = await getUserByTelegramIdString(
          validatedParams.telegram_id
        )
        if (!user) throw new Error('User not found')
        if (user.level === 10) {
          await updateUserLevelPlusOne(user.telegram_id, user.level)
        }
        return user
      })

      const paymentResult = await step.run('process-payment', async () => {
        const modelConfig = IMAGES_MODELS[validatedParams.model.toLowerCase()]
        if (!modelConfig) throw new Error('Unsupported model')

        console.log('💰 Обработка платежа за изображения:', {
          description: 'Processing payment for images',
          telegram_id: validatedParams.telegram_id,
          model: validatedParams.model,
          num_images: validatedParams.num_images,
          cost: modelConfig.costPerImage * validatedParams.num_images,
        })

        // Отправляем событие payment/process для обработки платежа
        await inngest.send({
          id: `payment-${validatedParams.telegram_id}-${Date.now()}-${
            validatedParams.num_images
          }-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id: validatedParams.telegram_id,
            mode: ModeEnum.TextToImage,
            is_ru: validatedParams.is_ru,
            bot_name: validatedParams.bot_name,
            description: `Payment for ${validatedParams.num_images} images`,
            paymentAmount:
              modelConfig.costPerImage * validatedParams.num_images,
            type: 'outcome',
            metadata: {
              service_type: ModeEnum.TextToImage,
              prompt: validatedParams.prompt,
            },
          },
        })
      })

      const generationParams = await step.run(
        'prepare-generation',
        async () => {
          const aspectRatio = await getAspectRatio(
            Number(validatedParams.telegram_id)
          )
          let size: string | undefined

          if (validatedParams.model.toLowerCase() === 'recraft v3') {
            const [w, h] = aspectRatio.split(':').map(Number)
            const calculated = `${1024}x${Math.round((1024 / w) * h)}`
            size = supportedSizes.includes(calculated)
              ? calculated
              : '1024x1024'
          } else if (validatedParams.model.toLowerCase() === 'luma/photon') {
            return {
              prompt: validatedParams.prompt,
              modelKey:
                validatedParams.model.toLowerCase() as `${string}/${string}`,
              input: {
                prompt: validatedParams.prompt,
                aspect_ratio: '1:1',
              },
              numImages: validatedParams.num_images,
            }
          }

          return {
            prompt: validatedParams.prompt,
            modelKey:
              validatedParams.model.toLowerCase() as `${string}/${string}`,
            input: {
              prompt: validatedParams.prompt,
              ...(size ? { size } : { aspect_ratio: aspectRatio }),
            },
            numImages: validatedParams.num_images,
          }
        }
      )

      const results: GenerationResult[] = []
      for (let i = 0; i < generationParams.numImages; i++) {
        const imageResult = (await step.run(`generate-image-${i}`, async () => {
          try {
            await sendGenerationStatus(validatedParams, i)
            const output = await replicate.run(generationParams.modelKey, {
              input: generationParams.input,
            })
            return {
              success: true as const,
              imageUrl: await processApiResponse(output as ApiImageResponse),
            }
          } catch (error) {
            console.error('🔥 Ошибка при генерации изображения:', {
              description: 'Error during image generation',
              modelKey: generationParams.modelKey,
              error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
              stack: error.stack,
            })
            return {
              success: false as const,
              error:
                error instanceof Error
                  ? error
                  : new Error(JSON.stringify(error)),
            }
          }
        })) as ImageResult

        if (!imageResult.success) {
          await handleGenerationError(
            (imageResult as { success: false; error: Error }).error,
            validatedParams
          )
          continue
        }

        const savedImage = await step.run(`save-image-${i}`, async () => {
          const localPath = await saveFileLocally(
            validatedParams.telegram_id,
            imageResult.imageUrl,
            'text-to-image',
            '.jpeg'
          )

          const promptId = await savePrompt(
            generationParams.prompt,
            generationParams.modelKey,
            ModeEnum.TextToImage,
            `${API_URL}/uploads/${
              validatedParams.telegram_id
            }/text-to-image/${path.basename(localPath)}`,
            validatedParams.telegram_id,
            'SUCCESS'
          )

          return { localPath, promptId }
        })

        await step.run(`send-image-${i}`, async () => {
          await sendImageToUser(
            savedImage.localPath,
            validatedParams,
            paymentResult.newBalance
          )
        })

        results.push({
          image: await downloadFile(imageResult.imageUrl),
          prompt_id: savedImage.promptId,
        })
      }

      await step.run('finalize', async () => {
        if (results.length > 0) {
          await pulse(
            results[0].image.toString('base64'),
            generationParams.prompt,
            `/${validatedParams.model}`,
            validatedParams.telegram_id,
            validatedParams.username || '',
            validatedParams.is_ru
          )
        }
        return { success: true, results }
      })

      return { success: true, results }
    } catch (error) {
      await step.run('global-error-handler', async () => {
        console.error('🔥 Глобальная ошибка:', error)
        if (validatedParams) {
          errorMessage(
            error as Error,
            validatedParams.telegram_id,
            validatedParams.is_ru
          )
        }
        errorMessageAdmin(error as Error)
      })
      throw error
    }
  }
)

async function sendGenerationStatus(
  params: TextToImageEvent['data'],
  index: number
) {
  const { bot } = getBotByName(params.bot_name)
  const message =
    params.num_images > 1
      ? params.is_ru
        ? `⏳ Генерация изображения ${index + 1} из ${params.num_images}`
        : `⏳ Generating image ${index + 1} of ${params.num_images}`
      : params.is_ru
      ? '⏳ Генерация...'
      : '⏳ Generating...'

  await bot.telegram.sendMessage(params.telegram_id, message)
}

async function handleGenerationError(
  error: Error,
  params: TextToImageEvent['data']
) {
  const { bot } = getBotByName(params.bot_name)
  let message = '❌ Произошла ошибка.'

  console.log('📊 Детали ошибки:', {
    description: 'Error details',
    error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    errorName: error.name,
    errorMessage: error.message,
  })

  if (error && error.message) {
    if (error.message.includes('NSFW')) {
      message = params.is_ru
        ? '❌ Обнаружен NSFW контент'
        : '❌ NSFW content detected'
    } else {
      const match = error.message.match(/{"detail":"(.*?)"/)
      if (match) {
        message = `❌ ${match[1]}`
      } else if (error.name === 'ApiError') {
        message = params.is_ru
          ? '❌ Ошибка API при генерации изображения. Пожалуйста, попробуйте другой запрос или модель.'
          : '❌ API Error during image generation. Please try another prompt or model.'
      }
    }
  }

  if (
    params.model.toLowerCase() === 'luma/photon' &&
    error.name === 'ApiError'
  ) {
    message = params.is_ru
      ? '❌ Ошибка при генерации с Luma Photon. Эта модель может не поддерживать указанное соотношение сторон. Попробуйте соотношение 1:1.'
      : '❌ Error generating with Luma Photon. This model may not support the specified aspect ratio. Try 1:1 ratio.'
  }

  await bot.telegram.sendMessage(params.telegram_id, message)
}

async function sendImageToUser(
  localPath: string,
  params: TextToImageEvent['data'],
  balance: number
) {
  const { bot } = getBotByName(params.bot_name)

  await bot.telegram.sendPhoto(params.telegram_id, {
    source: fs.createReadStream(localPath),
  })

  await bot.telegram.sendMessage(
    params.telegram_id,
    params.is_ru
      ? `✅ Готово! Баланс: ${balance.toFixed(2)} ⭐️`
      : `✅ Done! Balance: ${balance.toFixed(2)} ⭐️`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '1️⃣' }, { text: '2️⃣' }, { text: '3️⃣' }, { text: '4️⃣' }],
          [
            { text: params.is_ru ? '⬆️ Улучшить' : '⬆️ Improve' },
            { text: params.is_ru ? '📐 Размер' : '📐 Size' },
          ],
          [{ text: params.is_ru ? '🏠 Меню' : '🏠 Menu' }],
        ],
        resize_keyboard: true,
      },
    }
  )
}
