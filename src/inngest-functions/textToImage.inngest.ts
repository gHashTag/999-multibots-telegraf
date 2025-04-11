import { TelegramId } from '@/interfaces/telegram.interface'
import { GenerationResult } from '@/interfaces'
import { getBotByName } from '@/core/bot'
import { v4 as uuidv4 } from 'uuid'
import {
  updateUserLevelPlusOne,
  getAspectRatio,
  savePrompt,
  getUserByTelegramIdString,
  getUserBalance,
} from '@/core/supabase'
import {
  downloadFile,
  processApiResponse,
  pulse,
  saveFileLocally,
} from '@/helpers'
import { replicate } from '@/core/replicate'
import { ModeEnum, calculateModeCost } from '@/price/helpers/modelsCost'
import { API_URL } from '@/config'
import path from 'path'
import fs from 'fs'
import { inngest } from '@/inngest-functions/clients'
import { IMAGES_MODELS } from '@/price/models/IMAGES_MODELS'
import { logger } from '@/utils/logger'

interface TextToImageEvent {
  data: {
    prompt: string
    model: string
    num_images: number
    telegram_id: TelegramId
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
  | { success: false; error: unknown }

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

      if (!validatedParams) {
        throw new Error('Validation failed - missing required parameters')
      }

      const params = validatedParams

      await step.run('get-user-info', async () => {
        const userData = await getUserByTelegramIdString(params.telegram_id)
        if (!userData) throw new Error('User not found')
        if (userData.level === 10) {
          await updateUserLevelPlusOne(userData.telegram_id, userData.level)
        }
        return userData
      })

      const paymentResult = await step.run('process-payment', async () => {
        const cost =
          calculateModeCost({ mode: ModeEnum.TextToImage }).stars *
          params.num_images

        logger.info('💰 Обработка платежа', {
          description: 'Processing payment',
          telegram_id: params.telegram_id,
          cost,
          bot_name: params.bot_name,
        })

        // Отправляем событие в централизованный процессор платежей
        await inngest.send({
          id: `payment-${params.telegram_id}-${Date.now()}-${
            params.num_images
          }-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id: params.telegram_id,
            amount: cost,
            is_ru: params.is_ru,
            bot_name: params.bot_name,
            type: 'money_expense',
            description: 'Payment for text to image generation',
            metadata: {
              service_type: ModeEnum.TextToImage,
              prompt: params.prompt,
            },
          },
        })

        logger.info('💸 Платеж отправлен на обработку', {
          description: 'Payment sent for processing',
          telegram_id: params.telegram_id,
          cost,
        })

        // Даем время на обработку платежа
        await new Promise(resolve => setTimeout(resolve, 500))

        // Получаем актуальный баланс из базы данных
        const newBalance = await getUserBalance(
          params.telegram_id,
          params.bot_name
        )

        return {
          success: true,
          paymentAmount: cost,
          newBalance: Number(newBalance) || 0,
        }
      })

      if (!paymentResult.success) {
        throw new Error('Payment processing failed')
      }

      const generationParams = await step.run(
        'prepare-generation',
        async () => {
          const aspectRatio = await getAspectRatio(params.telegram_id)
          let size: string | undefined

          if (params.model.toLowerCase() === 'recraft v3') {
            const [w, h] = aspectRatio.split(':').map(Number)
            const calculated = `${1024}x${Math.round((1024 / w) * h)}`
            size = supportedSizes.includes(calculated)
              ? calculated
              : '1024x1024'
          } else if (params.model.toLowerCase() === 'luma/photon') {
            return {
              prompt: params.prompt,
              modelKey: params.model.toLowerCase() as `${string}/${string}`,
              input: {
                prompt: params.prompt,
                aspect_ratio: '1:1',
              },
              numImages: params.num_images,
            }
          }

          return {
            prompt: params.prompt,
            modelKey: params.model.toLowerCase() as `${string}/${string}`,
            input: {
              prompt: params.prompt,
              ...(size ? { size } : { aspect_ratio: aspectRatio }),
            },
            numImages: params.num_images,
          }
        }
      )

      const results: GenerationResult[] = []
      for (let i = 0; i < generationParams.numImages; i++) {
        const imageResult = (await step.run(`generate-image-${i}`, async () => {
          try {
            await sendGenerationStatus(params, i)
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
              stack: error instanceof Error ? error.stack : undefined,
            })
            return {
              success: false as const,
              error,
            }
          }
        })) as ImageResult

        if (!imageResult.success) {
          const errorMessage =
            imageResult.error instanceof Error
              ? imageResult.error.message
              : 'Image generation failed'
          await handleGenerationError(new Error(errorMessage), params)
          continue
        }

        const savedImage = await step.run(`save-image-${i}`, async () => {
          const localPath = await saveFileLocally(
            params.telegram_id,
            imageResult.imageUrl,
            'text-to-image',
            '.jpeg'
          )

          const promptId = await savePrompt(
            generationParams.prompt,
            generationParams.modelKey,
            ModeEnum.TextToImage,
            `${API_URL}/uploads/${
              params.telegram_id
            }/text-to-image/${path.basename(localPath)}`,
            params.telegram_id,
            'COMPLETED'
          )

          return { localPath, promptId }
        })

        await step.run(`send-image-${i}`, async () => {
          await sendImageToUser(
            savedImage.localPath,
            params,
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
            `/${params.model}`,
            params.telegram_id,
            params.username || '',
            params.is_ru
          )
        }
        return { success: true, results }
      })

      return { success: true, results }
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при генерации изображения',
        description: 'Error during image generation',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        params: validatedParams,
      })

      // Обработка возврата средств
      if (validatedParams) {
        try {
          const modelConfig = IMAGES_MODELS[validatedParams.model.toLowerCase()]
          if (modelConfig) {
            const refundAmount =
              modelConfig.costPerImage * validatedParams.num_images

            logger.info({
              message: '💸 Начало процесса возврата средств',
              description: 'Starting refund process due to generation error',
              telegram_id: validatedParams.telegram_id,
              refundAmount,
              error: error instanceof Error ? error.message : 'Unknown error',
            })

            // Отправляем событие возврата средств
            await inngest.send({
              id: `refund-${
                validatedParams.telegram_id
              }-${Date.now()}-${uuidv4()}`,
              name: 'payment/process',
              data: {
                telegram_id: validatedParams.telegram_id,
                amount: refundAmount.toString(), // положительное значение для возврата
                type: 'refund',
                description: `Возврат средств за неудачную генерацию ${validatedParams.num_images} изображений`,
                bot_name: validatedParams.bot_name,
                metadata: {
                  service_type: ModeEnum.TextToImage,
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                  num_images: validatedParams.num_images,
                  model: validatedParams.model,
                },
              },
            })

            logger.info({
              message: '✅ Возврат средств выполнен',
              description: 'Refund processed successfully',
              telegram_id: validatedParams.telegram_id,
              refundAmount,
            })

            // Отправляем уведомление пользователю
            const { bot } = getBotByName(validatedParams.bot_name)
            if (bot) {
              const message = validatedParams.is_ru
                ? `❌ Произошла ошибка при генерации изображений. ${refundAmount} ⭐️ возвращены на ваш баланс.`
                : `❌ An error occurred during image generation. ${refundAmount} ⭐️ have been refunded to your balance.`

              await bot.telegram.sendMessage(
                validatedParams.telegram_id,
                message
              )
            }
          }
        } catch (refundError) {
          logger.error({
            message: '🚨 Ошибка при попытке возврата средств',
            description: 'Error during refund process',
            error:
              refundError instanceof Error
                ? refundError.message
                : 'Unknown error',
            originalError:
              error instanceof Error ? error.message : 'Unknown error',
            telegram_id: validatedParams.telegram_id,
          })
        }
      }

      throw error
    }
  }
)

async function sendGenerationStatus(
  params: TextToImageEvent['data'],
  index: number
) {
  const { bot } = getBotByName(params.bot_name)
  if (!bot) {
    throw new Error(`Bot ${params.bot_name} not found`)
  }

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
  if (!bot) {
    throw new Error(`Bot ${params.bot_name} not found`)
  }

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
  if (!bot) {
    throw new Error(`Bot ${params.bot_name} not found`)
  }

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
