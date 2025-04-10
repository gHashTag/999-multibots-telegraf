import { inngest } from '@/inngest-functions/clients'
import { getBotByName } from '@/core/bot'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import { BalanceOperationResult, BalanceOperationSuccessResult, BalanceOperationErrorResult } from '@/interfaces/payments.interface'
import { ImageToVideoResult, ImageToVideoSuccessResult, ImageToVideoErrorResult } from '@/interfaces/imageToVideo.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import axios, { AxiosError } from 'axios'
import { ModeEnum } from '@/price/helpers/modelsCost'

export interface ImageToVideoEvent {
  data: {
    imageUrl: string
    prompt: string
    videoModel: string
    telegram_id: string
    username: string
    is_ru: boolean
    bot_name: string
    description: string
    _test?: {
      api_error?: boolean
      timeout?: boolean
      multiple_outputs?: boolean
    }
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

type StepFn<T> = () => Promise<T>

interface ProcessingStepResult {
  success: boolean;
  message: string;
}

interface BotSuccessResult {
  success: true;
  bot: Telegraf<MyContext>;
}

interface BotErrorResult {
  success: false;
  error: string;
}

type BotResult = BotSuccessResult | BotErrorResult;

type BalanceCheckResult = (BalanceOperationSuccessResult | BalanceOperationErrorResult) & {
  modelConfig?: typeof VIDEO_MODELS_CONFIG[keyof typeof VIDEO_MODELS_CONFIG];
}

type VideoGenerationResult = ImageToVideoResult & {
  predictionId?: string;
}

export const imageToVideoFunction = inngest.createFunction(
  {
    name: 'image-to-video-generation',
    id: 'image-to-video',
    concurrency: { limit: 2 },
    retries: 2,
  },
  { event: 'image/video' },
  async ({ event, step }): Promise<ImageToVideoResult> => {
    let params: ImageToVideoEvent['data'] | null = null
    let bot: Telegraf<MyContext> | null = null
    let balanceResult: BalanceCheckResult | null = null

    try {
      // 1. Log start of processing
      const startResult = await step.run('start-processing', async () => {
        logger.info('🎬 Starting image to video conversion')
        return {
          success: true,
          message: 'Processing started',
        } as ProcessingStepResult
      })

      if (!startResult.success) {
        const errorResult: ImageToVideoErrorResult = {
          success: false,
          error: 'Failed to start processing',
          modePrice: 0,
          newBalance: 0
        }
        return errorResult
      }

      // 2. Validate input
      const eventData = event.data as Partial<ImageToVideoEvent['data']>
      logger.info('Event data:', eventData)
      
      const requiredFields = {
        imageUrl: !!eventData?.imageUrl,
        prompt: !!eventData?.prompt,
        videoModel: !!eventData?.videoModel,
        telegram_id: !!eventData?.telegram_id,
        username: !!eventData?.username,
        is_ru: eventData?.is_ru !== undefined,
        bot_name: !!eventData?.bot_name
      }

      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value)
        .map(([key]) => key)

      if (missingFields.length > 0) {
        logger.error('Missing fields:', { missingFields })
        const errorResult: ImageToVideoErrorResult = {
          success: false,
          error: 'Missing required fields',
          modePrice: 0,
          newBalance: 0
        }
        return errorResult
      }

      params = {
        ...eventData,
        description: eventData.description || 'Image to video conversion',
      } as ImageToVideoEvent['data']

      // 3. Get bot instance
      const botResult = await step.run('get-bot-instance', async () => {
        const result = getBotByName(params!.bot_name)
        if (!result.bot) {
          return { success: false, error: 'Bot not found' } as BotErrorResult
        }
        return { success: true, bot: result.bot } as BotSuccessResult
      })

      if (!botResult.success) {
        const errorResult: ImageToVideoErrorResult = {
          success: false,
          error: botResult.error,
          modePrice: 0,
          newBalance: 0
        }
        return errorResult
      }

      bot = botResult.bot as Telegraf<MyContext>

      // 4. Process balance operation
      balanceResult = await step.run('process-balance', async () => {
        try {
          const currentBalance = await getUserBalance(params!.telegram_id)
          const modelConfig = VIDEO_MODELS_CONFIG[params!.videoModel]

          if (!modelConfig) {
            await bot?.telegram.sendMessage(
              params!.telegram_id,
              params!.is_ru ? 'Неверная модель' : 'Invalid model'
            )
            const errorResult: BalanceOperationErrorResult & { modelConfig?: undefined } = {
              success: false,
              newBalance: currentBalance,
              modePrice: 0,
              error: 'Invalid model'
            }
            return errorResult
          }

          const paymentAmount = calculateFinalPrice(modelConfig.id)

          if (currentBalance < paymentAmount) {
            const message = params!.is_ru
              ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
              : 'Insufficient funds. Top up your balance by calling the /buy command.'

            await bot?.telegram.sendMessage(params!.telegram_id, message)
            const errorResult: BalanceOperationErrorResult & { modelConfig: typeof modelConfig } = {
              success: false,
              newBalance: currentBalance,
              modePrice: paymentAmount,
              error: message,
              modelConfig
            }
            return errorResult
          }

          const newBalance = currentBalance - paymentAmount

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

          const successResult: BalanceOperationSuccessResult & { modelConfig: typeof modelConfig } = {
            success: true,
            newBalance,
            modePrice: paymentAmount,
            modelConfig
          }
          return successResult
        } catch (error) {
          logger.error('Error in balance operation:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            telegram_id: params!.telegram_id,
          })
          const errorResult: BalanceOperationErrorResult = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            modePrice: 0,
            newBalance: 0
          }
          return errorResult
        }
      })

      if (!balanceResult.success) {
        const errorResult: ImageToVideoErrorResult = {
          success: false,
          error: 'error' in balanceResult ? balanceResult.error : 'Balance check failed',
          modePrice: balanceResult.modePrice,
          newBalance: balanceResult.newBalance
        }
        return errorResult
      }

      if (!balanceResult.modelConfig) {
        const errorResult: ImageToVideoErrorResult = {
          success: false,
          error: 'Model configuration not found',
          modePrice: balanceResult.modePrice,
          newBalance: balanceResult.newBalance
        }
        return errorResult
      }

      // 5. Generate video
      const videoResult = await step.run('generate-video', async () => {
        try {
          const modelConfig = balanceResult!.modelConfig!

          // Handle test scenarios
          if (params!._test?.api_error) {
            throw new Error('API Error')
          }

          if (params!._test?.timeout) {
            throw new Error('Video generation timed out')
          }

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
          const maxAttempts = 60
          let result: string | string[] | null = null

          while (!completed && attempts < maxAttempts) {
            const statusResponse = await axios.get(
              `${VIDEO_API_CONFIG.baseURL}/predictions/${predictionId}`,
              VIDEO_API_CONFIG
            )

            if (statusResponse.data.status === 'succeeded') {
              completed = true
              result = params!._test?.multiple_outputs 
                ? ['video1.mp4', 'video2.mp4']
                : statusResponse.data.output
            } else if (statusResponse.data.status === 'failed') {
              throw new Error(statusResponse.data.error || 'Video generation failed')
            }

            if (!completed) {
              attempts++
              await new Promise(resolve => setTimeout(resolve, 5000))
            }
          }

          if (!completed) {
            throw new Error('Video generation timed out')
          }

          if (!result) {
            throw new Error('No video output received')
          }

          const successResult: ImageToVideoSuccessResult = {
            success: true,
            videoUrl: result,
            modePrice: balanceResult!.modePrice,
            newBalance: balanceResult!.newBalance
          }

          return successResult

        } catch (error) {
          logger.error('Error generating video:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            telegram_id: params!.telegram_id,
          })

          const errorResult: ImageToVideoErrorResult = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            modePrice: balanceResult!.modePrice,
            newBalance: balanceResult!.newBalance
          }

          return errorResult
        }
      })

      // 6. Send the result
      await step.run('send-result', async () => {
        if (videoResult.success) {
          const successMessage = params!.is_ru
            ? '✨ Ваше видео готово!'
            : '✨ Your video is ready!'

          await bot?.telegram.sendMessage(params!.telegram_id, successMessage)

          if (typeof videoResult.videoUrl === 'string') {
            await bot?.telegram.sendVideo(params!.telegram_id, videoResult.videoUrl)
          } else if (Array.isArray(videoResult.videoUrl)) {
            for (const videoUrl of videoResult.videoUrl) {
              await bot?.telegram.sendVideo(params!.telegram_id, videoUrl)
            }
          }
        } else {
          const errorMessage = params!.is_ru
            ? '❌ Произошла ошибка при генерации видео. Пожалуйста, попробуйте позже.'
            : '❌ An error occurred while generating the video. Please try again later.'

          await bot?.telegram.sendMessage(params!.telegram_id, errorMessage)
        }
      })

      return videoResult

    } catch (error) {
      logger.error('❌ Error in image to video conversion:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      const errorResult: ImageToVideoErrorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        modePrice: balanceResult?.modePrice || 0,
        newBalance: balanceResult?.newBalance || 0
      }
      return errorResult
    }
  }
)
