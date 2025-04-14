import { inngest } from '@/inngest-functions/clients'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
  saveNeuroPhotoPrompt,
} from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { v4 as uuidv4 } from 'uuid'
import { TransactionType } from '@/interfaces/payments.interface'

// Объявляем базовые типы для Inngest
interface InngestEvent {
  name: string
  data: any
  user?: any
  version?: string
  id?: string
  ts?: number
  [key: string]: any
}

interface InngestStep {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
  sleep: (id: string, duration: string) => Promise<void>
  [key: string]: any
}

/**
 * Inngest функция для генерации нейрофото V2
 */
export const neuroPhotoV2Generation = inngest.createFunction(
  {
    id: 'neuro-photo-v2-generation',
    retries: 3,
  },
  { event: 'neuro/photo-v2.generate' },
  async ({ event, step }: { event: InngestEvent; step: InngestStep }) => {
    try {
      const { prompt, num_images, telegram_id, is_ru, bot_name } = event.data

      // Гарантируем, что num_images будет числом
      const numImagesToGenerate = num_images
        ? parseInt(String(num_images), 10)
        : 1

      logger.info({
        message: '🎨 Начало генерации нейрофото V2',
        description: 'Starting neurophoto V2 generation process',
        telegram_id,
        prompt: prompt.substring(0, 50) + '...',
        num_images: numImagesToGenerate,
      })

      // Получаем экземпляр бота
      const botData = await step.run('get-bot', async () => {
        logger.info({
          message: '🤖 Получение экземпляра бота',
          description: 'Retrieving bot instance by name',
          botName: bot_name,
        })
        const botResult = getBotByName(bot_name)
        return {
          bot: botResult.bot as Telegraf<MyContext>,
          error: botResult.error,
        }
      })

      const bot = botData.bot as Telegraf<MyContext>

      if (!bot) {
        logger.error({
          message: '❌ Экземпляр бота не найден',
          description: 'Bot instance not found by name',
          bot_name,
          telegram_id,
          error: botData.error,
        })
        throw new Error(`Bot with name ${bot_name} not found`)
      }

      // Проверяем существование пользователя
      const userExists = await step.run('check-user', async () => {
        logger.info({
          message: '👤 Проверка существования пользователя',
          description: 'Checking if user exists in database',
          telegram_id,
        })

        const user = await getUserByTelegramId(telegram_id)

        if (!user) {
          logger.error({
            message: '❌ Пользователь не найден в базе данных',
            description: 'User not found in database',
            telegram_id,
          })

          if (bot && bot.telegram) {
            try {
              await bot.telegram.sendMessage(
                telegram_id,
                is_ru
                  ? '❌ Ваш аккаунт не найден в базе данных. Пожалуйста, запустите бота заново с помощью команды /start'
                  : '❌ Your account was not found in our database. Please restart the bot using the /start command'
              )
            } catch (sendError) {
              logger.error({
                message:
                  '❌ Не удалось отправить сообщение об ошибке пользователю',
                description: 'Failed to send error message to user',
                error:
                  sendError instanceof Error
                    ? sendError.message
                    : 'Unknown error',
                telegram_id,
              })
            }
          }

          throw new Error(`User with ID ${telegram_id} not found in database`)
        }

        logger.info({
          message: '✅ Пользователь найден в базе данных',
          description: 'User found in database',
          telegram_id,
          user_id: user.id,
        })

        return user
      })

      // Увеличиваем уровень пользователя, если он на первом уровне
      if (userExists.level === 1) {
        await step.run('update-level', async () => {
          if (!userExists.level) {
            await updateUserLevelPlusOne(telegram_id, 1)
          } else {
            await updateUserLevelPlusOne(telegram_id, userExists.level)
          }
        })
      }

      // Расчёт стоимости генерации
      const costCalculation = await step.run('calculate-cost', async () => {
        logger.info({
          message: '💰 Расчет стоимости генерации',
          description: 'Calculating generation cost',
          num_images: numImagesToGenerate,
          mode: ModeEnum.NeuroPhotoV2,
        })

        const costPerImage = calculateModeCost({
          mode: ModeEnum.NeuroPhotoV2,
          steps: numImagesToGenerate,
        })
        const totalCost = Number(costPerImage) * numImagesToGenerate

        logger.info({
          message: '💸 Рассчитана стоимость генерации',
          description: 'Generation cost calculated',
          costPerImage,
          totalCost,
          num_images: numImagesToGenerate,
        })

        return { costPerImage, totalCost }
      })

      // Обработка оплаты через отдельное событие payment/process
      await step.run('process-payment', async () => {
        logger.info({
          message: '💳 Обработка оплаты',
          description: 'Processing payment',
          telegram_id,
          totalCost: costCalculation.totalCost,
        })

        // Отправляем событие для обработки платежа
        return await inngest.send({
          id: `payment-${telegram_id}-${Date.now()}-${numImagesToGenerate}-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id,
            amount: costCalculation.totalCost,
            is_ru,
            bot_name,
            type: TransactionType.MONEY_EXPENSE,
            description: `Payment for generating ${numImagesToGenerate} image${
              numImagesToGenerate > 1 ? 's' : ''
            } with prompt: ${prompt.slice(0, 50)}...`,
            service_type: ModeEnum.NeuroPhotoV2,
            metadata: {
              prompt: prompt.substring(0, 100),
              num_images: numImagesToGenerate,
            },
          },
        })
      })

      // Генерируем изображения
      const generatedTasks = []

      for (let i = 0; i < numImagesToGenerate; i++) {
        const generationResult = await step.run(
          `generate-image-${i}`,
          async () => {
            // Получаем бота внутри шага для надежности
            const stepBotResult = getBotByName(bot_name)
            if (!stepBotResult.bot) {
              logger.error({
                message: '❌ Бот не найден при генерации',
                description: 'Bot not found during generation',
                bot_name,
                error: stepBotResult.error,
              })
              throw new Error(
                `Bot with name ${bot_name} not found in generation step`
              )
            }

            const stepBot = stepBotResult.bot

            // Отправляем сообщение о начале генерации
            if (numImagesToGenerate > 1) {
              try {
                await stepBot.telegram.sendMessage(
                  telegram_id,
                  is_ru
                    ? `⏳ Генерация изображения ${
                        i + 1
                      } из ${numImagesToGenerate}`
                    : `⏳ Generating image ${i + 1} of ${numImagesToGenerate}`
                )
              } catch (sendError) {
                logger.error({
                  message: '❌ Ошибка при отправке сообщения о генерации',
                  description: 'Error sending generation message',
                  error:
                    sendError instanceof Error
                      ? sendError.message
                      : 'Unknown error',
                  telegram_id,
                })
                // Продолжаем выполнение даже при ошибке отправки сообщения
              }
            } else {
              try {
                await stepBot.telegram.sendMessage(
                  telegram_id,
                  is_ru ? '⏳ Генерация...' : '⏳ Generating...',
                  {
                    reply_markup: { remove_keyboard: true },
                  }
                )
              } catch (sendError) {
                logger.error({
                  message: '❌ Ошибка при отправке сообщения о генерации',
                  description: 'Error sending generation message',
                  error:
                    sendError instanceof Error
                      ? sendError.message
                      : 'Unknown error',
                  telegram_id,
                })
                // Продолжаем выполнение даже при ошибке отправки сообщения
              }
            }

            // Создаем уникальный task_id вместо вызова generateImage
            const taskId = `task-${uuidv4()}`

            logger.info({
              message: '✅ Создан тестовый task_id (заглушка)',
              description: 'Created test task_id (stub)',
              taskId,
              telegram_id,
              prompt: prompt.substring(0, 50) + '...',
            })

            // Сохраняем промпт и задачу в базе данных
            const savedTask = await saveNeuroPhotoPrompt(
              taskId,
              prompt,
              ModeEnum.NeuroPhotoV2,
              telegram_id,
              'PROCESSING'
            )

            return {
              taskId,
              status: 'PROCESSING',
              prompt,
              savedTask,
            }
          }
        )

        generatedTasks.push(generationResult)
      }

      logger.info({
        message: '🎉 Все задачи на генерацию успешно отправлены',
        description: 'All generation tasks successfully sent',
        tasksCount: generatedTasks.length,
        tasks: generatedTasks.map(task => task.taskId),
        telegram_id,
      })

      return {
        success: true,
        message: 'Generation tasks successfully initiated',
        tasks: generatedTasks,
        telegram_id,
      }
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при генерации нейрофото V2',
        description: 'Error during neurophoto V2 generation',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : null,
        data: event.data,
      })

      const { telegram_id, bot_name, is_ru, num_images } = event.data
      const numImagesToGenerate = num_images
        ? parseInt(String(num_images), 10)
        : 1

      // Обработка возврата средств
      try {
        // Расчет суммы для возврата
        const refundAmount = calculateModeCost({
          mode: ModeEnum.NeuroPhotoV2,
          steps: numImagesToGenerate,
        }).stars

        logger.info({
          message: '💸 Начало процесса возврата средств',
          description: 'Starting refund process due to generation error',
          telegram_id,
          refundAmount,
          error: error instanceof Error ? error.message : 'Unknown error',
        })

        // Отправляем событие возврата средств
        await inngest.send({
          id: `refund-${telegram_id}-${Date.now()}-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id,
            amount: refundAmount, // положительное значение для возврата
            type: TransactionType.REFUND,
            description: `Возврат средств за неудачную генерацию ${numImagesToGenerate} изображений V2`,
            bot_name,
            metadata: {
              service_type: ModeEnum.NeuroPhotoV2,
              error: error instanceof Error ? error.message : 'Unknown error',
              num_images: numImagesToGenerate,
            },
          },
        })

        logger.info({
          message: '✅ Возврат средств выполнен',
          description: 'Refund processed successfully',
          telegram_id,
          refundAmount,
        })

        // Отправляем уведомление пользователю
        const botResult = getBotByName(bot_name)
        if (botResult?.bot) {
          const { bot } = botResult
          const message = is_ru
            ? `❌ Произошла ошибка при генерации изображения. Средства (${refundAmount} ⭐️) возвращены на ваш баланс.`
            : `❌ An error occurred during image generation. Funds (${refundAmount} ⭐️) have been returned to your balance.`

          await bot.telegram.sendMessage(telegram_id, message)
        }
      } catch (refundError) {
        logger.error({
          message: '🚨 Ошибка при попытке возврата средств',
          description: 'Error during refund attempt',
          error:
            refundError instanceof Error
              ? refundError.message
              : 'Unknown error',
          originalError:
            error instanceof Error ? error.message : 'Unknown error',
          telegram_id,
        })
      }

      throw error
    }
  }
)
