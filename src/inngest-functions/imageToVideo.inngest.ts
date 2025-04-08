import { inngest } from '@/inngest-functions/clients'
import { getBotByName } from '@/core/bot'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { VIDEO_MODELS_CONFIG } from '@/helpers/VIDEO_MODELS'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import { BalanceOperationResult } from '@/interfaces/payments.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import axios from 'axios'
import { ModeEnum } from '@/price/helpers'

interface ImageToVideoEvent {
  data: {
    imageUrl: string
    prompt: string
    videoModel: string
    telegram_id: string
    username: string
    is_ru: boolean
    bot_name: string
    description: string
  }
}

// Конфигурация API для генерации видео
const VIDEO_API_CONFIG = {
  baseURL: process.env.VIDEO_API_URL || 'https://api.replicate.com/v1',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
  },
}

export const imageToVideoFunction = inngest.createFunction(
  {
    name: 'image-to-video-generation',
    id: 'image-to-video',
    concurrency: { limit: 2 },
    retries: 2,
  },
  { event: 'image/video' },
  async ({ event, step }) => {
    let params: ImageToVideoEvent['data'] | null = null
    let bot: Telegraf<MyContext> | null = null

    try {
      // 1. Log start of processing
      await step.run('start-processing', async () => {
        logger.info('🎬 Starting image to video conversion')
        return {
          success: true,
          message: 'Processing started',
        }
      })

      // 1. Validate input and set default description
      const eventData = event.data as Partial<ImageToVideoEvent['data']>
      if (
        !eventData ||
        !eventData.imageUrl ||
        !eventData.prompt ||
        !eventData.videoModel ||
        !eventData.telegram_id ||
        !eventData.username ||
        eventData.is_ru === undefined ||
        !eventData.bot_name
      ) {
        throw new Error('Missing required fields')
      }

      params = {
        ...eventData,
        description: eventData.description || 'Image to video conversion',
      } as ImageToVideoEvent['data']

      // 2. Get bot instance
      const { bot: botInstance } = await step.run(
        'get-bot-instance',
        async () => {
          const result = getBotByName(params!.bot_name)
          if (!result.bot) {
            throw new Error('Bot not found')
          }
          return result
        }
      )

      bot = botInstance as Telegraf<MyContext>

      // 3. Process balance operation
      const balanceResult = await step.run('process-balance', async () => {
        try {
          // Get current balance
          const currentBalance = await getUserBalance(params!.telegram_id)

          // Check model configuration
          const modelConfig = VIDEO_MODELS_CONFIG[params!.videoModel]
          if (!modelConfig) {
            await bot?.telegram.sendMessage(
              params!.telegram_id,
              params!.is_ru ? 'Неверная модель' : 'Invalid model'
            )
            return {
              newBalance: currentBalance,
              paymentAmount: 0,
              success: false,
              error: 'Invalid model',
            } as BalanceOperationResult
          }

          // Calculate payment amount
          const paymentAmount = calculateFinalPrice(modelConfig.id)

          // Check if user has enough funds
          if (currentBalance < paymentAmount) {
            const message = params!.is_ru
              ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
              : 'Insufficient funds. Top up your balance by calling the /buy command.'

            await bot?.telegram.sendMessage(params!.telegram_id, message)
            return {
              newBalance: currentBalance,
              paymentAmount,
              success: false,
              error: message,
            } as BalanceOperationResult
          }

          // Calculate new balance
          const newBalance = currentBalance - paymentAmount

          // Update balance in database
          await updateUserBalance({
            telegram_id: params!.telegram_id,
            amount: paymentAmount,
            type: 'money_expense',
            description: params!.description,
            bot_name: params!.bot_name,
            metadata: {
              payment_method: ModeEnum.ImageToVideo,
              language: params!.is_ru ? 'ru' : 'en',
            },
          })

          return {
            newBalance,
            paymentAmount,
            success: true,
          } as BalanceOperationResult
        } catch (error) {
          logger.error('Error in balance operation:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            telegram_id: params!.telegram_id,
          })
          throw error
        }
      })

      if (!balanceResult.success) {
        throw new Error(balanceResult.error || 'Balance operation failed')
      }

      // 4. Send processing message
      await step.run('send-processing-message', async () => {
        const processingMessage = params!.is_ru
          ? '🎬 Начинаю генерацию видео...\nЭто может занять несколько минут.'
          : '🎬 Starting video generation...\nThis may take a few minutes.'

        await bot?.telegram.sendMessage(params!.telegram_id, processingMessage)
      })

      // 5. Generate video using external API
      const videoResult = await step.run('generate-video', async () => {
        try {
          const modelConfig = VIDEO_MODELS_CONFIG[params!.videoModel]

          // Start prediction
          const startResponse = await axios.post(
            `${VIDEO_API_CONFIG.baseURL}/predictions`,
            {
              version: modelConfig.api.model,
              input: {
                image: params!.imageUrl,
                prompt: params!.prompt,
                ...modelConfig.api.input,
              },
            },
            VIDEO_API_CONFIG
          )

          const predictionId = startResponse.data.id

          // Poll for completion
          let completed = false
          let attempts = 0
          const maxAttempts = 60 // 5 minutes with 5-second intervals
          let result = null

          while (!completed && attempts < maxAttempts) {
            const statusResponse = await axios.get(
              `${VIDEO_API_CONFIG.baseURL}/predictions/${predictionId}`,
              VIDEO_API_CONFIG
            )

            if (statusResponse.data.status === 'succeeded') {
              completed = true
              result = statusResponse.data.output
            } else if (statusResponse.data.status === 'failed') {
              throw new Error(
                'Video generation failed: ' + statusResponse.data.error
              )
            }

            if (!completed) {
              attempts++
              await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
            }
          }

          if (!completed) {
            throw new Error('Video generation timed out')
          }

          return result
        } catch (error) {
          logger.error('Error generating video:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            telegram_id: params!.telegram_id,
          })
          throw error
        }
      })

      // 6. Send the result
      await step.run('send-result', async () => {
        const successMessage = params!.is_ru
          ? '✨ Ваше видео готово!'
          : '✨ Your video is ready!'

        await bot?.telegram.sendMessage(params!.telegram_id, successMessage)

        if (typeof videoResult === 'string') {
          // If result is a single video URL
          await bot?.telegram.sendVideo(params!.telegram_id, videoResult)
        } else if (Array.isArray(videoResult)) {
          // If result is an array of video URLs
          for (const videoUrl of videoResult) {
            await bot?.telegram.sendVideo(params!.telegram_id, videoUrl)
          }
        }
      })

      logger.info('🎬 Image to video conversion completed', {
        telegram_id: params!.telegram_id,
        videoModel: params!.videoModel,
        username: params!.username,
      })
    } catch (error) {
      // Send error message to user
      if (params && bot) {
        const errorMessage = params.is_ru
          ? '❌ Произошла ошибка при генерации видео. Пожалуйста, попробуйте позже.'
          : '❌ An error occurred while generating the video. Please try again later.'

        try {
          await bot.telegram.sendMessage(params.telegram_id, errorMessage)
        } catch (e) {
          logger.error('Failed to send error message to user:', {
            error: e instanceof Error ? e.message : 'Unknown error',
            telegram_id: params.telegram_id,
          })
        }
      }

      logger.error('❌ Error in image to video conversion:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegram_id: params?.telegram_id,
        videoModel: params?.videoModel,
        username: params?.username,
      })
      throw error
    }
  }
)
