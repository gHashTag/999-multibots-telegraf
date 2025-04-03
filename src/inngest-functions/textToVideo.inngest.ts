import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { v4 as uuidv4 } from 'uuid'
import { processVideoGeneration } from '@/core/replicate'
import { downloadFile } from '@/helpers/downloadFile'
import { errorMessageAdmin } from '@/helpers'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
  saveVideoUrlToSupabase,
} from '@/core/supabase'
import { checkUserBalance } from '@/utils/checkUserBalance'

interface TextToVideoEvent {
  data: {
    prompt: string
    videoModel: string
    telegram_id: string
    username: string
    is_ru: boolean
    bot_name: string
  }
}

interface VideoGenerationResult {
  videoUrl: string
}

export const textToVideoFunction = inngest.createFunction(
  {
    id: 'text-to-video-function',
    name: 'text-to-video-function',
    retries: 3,
  },
  { event: 'text-to-video/generate' },
  async ({ event, step }) => {
    let validatedParams: TextToVideoEvent['data'] | null = null
    let modelConfig = null

    try {
      // Шаг 1: Валидация входных данных
      validatedParams = await step.run('validate-input', async () => {
        const { prompt, videoModel, telegram_id, username, is_ru, bot_name } =
          event.data

        logger.info('🔍 Валидация входных данных', {
          description: 'Validating input data',
          telegram_id,
          videoModel,
        })

        if (!prompt) {
          throw new Error('Prompt is required')
        }

        if (!videoModel) {
          throw new Error('Video model is required')
        }

        if (!telegram_id) {
          throw new Error('Telegram ID is required')
        }

        if (!username) {
          throw new Error('Username is required')
        }

        if (!bot_name) {
          throw new Error('Bot name is required')
        }

        return {
          prompt,
          videoModel,
          telegram_id,
          username,
          is_ru,
          bot_name,
        }
      })

      // Шаг 2: Проверка пользователя и обновление уровня
      const userCheck = await step.run('check-user', async () => {
        const userExists = await getUserByTelegramId(
          validatedParams.telegram_id
        )
        if (!userExists) {
          throw new Error(
            `User with ID ${validatedParams.telegram_id} does not exist.`
          )
        }

        const level = userExists.level
        if (level === 9) {
          await updateUserLevelPlusOne(validatedParams.telegram_id, level)
        }

        return {
          user: userExists,
          aspect_ratio: userExists.aspect_ratio,
        }
      })

      // Шаг 3: Проверка баланса и получение конфигурации модели
      modelConfig = VIDEO_MODELS_CONFIG[validatedParams.videoModel]

      if (!modelConfig) {
        logger.error('❌ Конфигурация модели не найдена:', {
          description: 'Model configuration not found',
          videoModel: validatedParams.videoModel,
          availableModels: Object.keys(VIDEO_MODELS_CONFIG),
        })
        throw new Error('Model configuration not found')
      }

      logger.info('✅ Конфигурация модели получена:', {
        description: 'Model configuration retrieved',
        model: modelConfig.title,
        basePrice: modelConfig.basePrice,
      })

      // Проверяем баланс пользователя
      const balanceCheck = await checkUserBalance({
        telegram_id: validatedParams.telegram_id,
        bot_name: validatedParams.bot_name,
        required_amount: modelConfig.basePrice * 100, // Конвертируем в звезды
        is_ru: validatedParams.is_ru,
        operation_type: ModeEnum.TextToVideo,
      })

      if (!balanceCheck.hasBalance) {
        throw new Error('Insufficient balance')
      }

      // Шаг 4: Обработка платежа
      const paymentResult = await step.run('process-payment', async () => {
        if (!modelConfig) {
          throw new Error('Model configuration not found')
        }

        logger.info('💰 Обработка платежа за видео', {
          description: 'Processing payment for video',
          telegram_id: validatedParams.telegram_id,
          model: validatedParams.videoModel,
          cost: modelConfig.basePrice,
        })

        // Отправляем событие payment/process для обработки платежа
        await inngest.send({
          id: `payment-${
            validatedParams.telegram_id
          }-${Date.now()}-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id: validatedParams.telegram_id,
            mode: ModeEnum.TextToVideo,
            is_ru: validatedParams.is_ru,
            bot_name: validatedParams.bot_name,
            description: `Payment for video generation`,
            paymentAmount: modelConfig.basePrice,
            type: 'outcome',
            metadata: {
              service_type: ModeEnum.TextToVideo,
              prompt: validatedParams.prompt,
              model: validatedParams.videoModel,
            },
          },
        })

        return { success: true }
      })

      // Шаг 5: Отправка уведомления о начале генерации
      await step.run('send-start-notification', async () => {
        const { bot } = getBotByName(validatedParams.bot_name)
        await bot.telegram.sendMessage(
          validatedParams.telegram_id,
          validatedParams.is_ru
            ? '⏳ Генерация видео...'
            : '⏳ Generating video...',
          {
            reply_markup: {
              remove_keyboard: true,
            },
          }
        )
      })

      // Шаг 6: Генерация видео
      const videoResult = await step.run('generate-video', async () => {
        logger.info('🎬 Генерация видео', {
          description: 'Generating video',
          model: validatedParams.videoModel,
          telegram_id: validatedParams.telegram_id,
        })

        const output = await processVideoGeneration(
          validatedParams.videoModel,
          userCheck.aspect_ratio,
          validatedParams.prompt
        )

        logger.info('✅ Видео успешно сгенерировано', {
          description: 'Video successfully generated',
          model: validatedParams.videoModel,
          output_type: typeof output,
        })

        if (typeof output !== 'string') {
          logger.error('❌ Неожиданный формат вывода:', {
            description: 'Unexpected output format',
            output: JSON.stringify(output, null, 2),
          })
          throw new Error(`Unexpected output format from API: ${typeof output}`)
        }

        return { videoUrl: output } as VideoGenerationResult
      })

      // Шаг 7: Сохранение видео
      const savedVideo = await step.run('save-video', async () => {
        const videoLocalPath = path.join(
          process.cwd(),
          'uploads',
          validatedParams.telegram_id,
          'text-to-video',
          `${new Date().toISOString()}.mp4`
        )

        await mkdir(path.dirname(videoLocalPath), { recursive: true })

        const videoBuffer = await downloadFile(videoResult.videoUrl)
        await writeFile(videoLocalPath, new Uint8Array(videoBuffer))

        await saveVideoUrlToSupabase(
          validatedParams.telegram_id,
          videoResult.videoUrl,
          videoLocalPath,
          validatedParams.videoModel
        )

        return { videoLocalPath }
      })

      // Шаг 8: Отправка видео пользователю
      await step.run('send-video', async () => {
        const { bot } = getBotByName(validatedParams.bot_name)
        await bot.telegram.sendVideo(validatedParams.telegram_id, {
          source: savedVideo.videoLocalPath,
        })

        await bot.telegram.sendMessage(
          validatedParams.telegram_id,
          validatedParams.is_ru
            ? '🎬 Ваше видео сгенерировано!\n\nСгенерировать еще?'
            : '🎬 Your video has been generated!\n\nGenerate more?',
          {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: validatedParams.is_ru
                      ? '🎥 Сгенерировать новое видео?'
                      : '🎥 Generate new video?',
                  },
                ],
                [
                  {
                    text: validatedParams.is_ru
                      ? '🏠 Главное меню'
                      : '🏠 Main menu',
                  },
                ],
              ],
              resize_keyboard: true,
            },
          }
        )
      })

      logger.info('✅ Видео успешно сгенерировано и отправлено', {
        description: 'Video successfully generated and sent',
        telegram_id: validatedParams.telegram_id,
        model: validatedParams.videoModel,
      })

      return {
        success: true,
        videoUrl: videoResult.videoUrl,
        localPath: savedVideo.videoLocalPath,
      }
    } catch (error) {
      logger.error('❌ Ошибка при генерации видео:', {
        description: 'Error generating video',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        params: validatedParams,
      })

      // Обработка возврата средств при ошибке
      if (validatedParams && modelConfig) {
        try {
          logger.info('💰 Запуск процесса возврата средств', {
            description: 'Starting refund process',
            telegram_id: validatedParams.telegram_id,
            amount: modelConfig.basePrice,
          })

          // Отправляем событие для возврата средств
          await inngest.send({
            id: `refund-${
              validatedParams.telegram_id
            }-${Date.now()}-${uuidv4()}`,
            name: 'payment/process',
            data: {
              telegram_id: validatedParams.telegram_id,
              mode: ModeEnum.TextToVideo,
              is_ru: validatedParams.is_ru,
              bot_name: validatedParams.bot_name,
              description: `Refund for failed video generation`,
              paymentAmount: modelConfig.basePrice,
              type: 'income', // Возврат звезд на баланс пользователя
              metadata: {
                service_type: ModeEnum.TextToVideo,
                prompt: validatedParams.prompt,
                model: validatedParams.videoModel,
                error: error instanceof Error ? error.message : String(error),
              },
            },
          })

          logger.info('✅ Возврат средств запущен', {
            description: 'Refund initiated',
            telegram_id: validatedParams.telegram_id,
            amount: modelConfig.basePrice * 100,
          })

          // Отправляем событие о неудачной генерации
          await inngest.send({
            id: `failed-video-${
              validatedParams.telegram_id
            }-${Date.now()}-${uuidv4()}`,
            name: 'video/generation.failed',
            data: {
              telegram_id: validatedParams.telegram_id,
              model: validatedParams.videoModel,
              error: error instanceof Error ? error.message : String(error),
              prompt: validatedParams.prompt,
            },
          })

          // Отправляем уведомление пользователю
          const { bot } = getBotByName(validatedParams.bot_name)
          await bot.telegram.sendMessage(
            validatedParams.telegram_id,
            validatedParams.is_ru
              ? '❌ Произошла ошибка при генерации видео. Средства были возвращены на ваш баланс. Пожалуйста, попробуйте еще раз.'
              : '❌ An error occurred while generating video. The funds have been returned to your balance. Please try again.'
          )

          // Отправляем уведомление администратору
          await errorMessageAdmin(error as Error)
        } catch (refundError) {
          logger.error('❌ Ошибка при возврате средств:', {
            description: 'Error processing refund',
            error:
              refundError instanceof Error
                ? refundError.message
                : 'Unknown error',
            telegram_id: validatedParams.telegram_id,
          })
        }
      }

      throw error
    }
  }
)
