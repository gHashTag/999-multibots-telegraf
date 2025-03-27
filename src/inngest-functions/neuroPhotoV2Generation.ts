import { inngest } from '@/core/inngest/clients'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
  saveNeuroPhotoPrompt,
  getFineTuneIdByTelegramId,
  getAspectRatio,
} from '@/core/supabase'
import { API_URL } from '@/config'
import { modeCosts, ModeEnum } from '@/price/helpers/modelsCost'
import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

/**
 * Inngest функция для генерации нейрофото V2
 */
export const neuroPhotoV2Generation = inngest.createFunction(
  {
    id: 'neuro-photo-v2-generation',
    retries: 3,
  },
  { event: 'neuro/photo-v2.generate' },
  async ({ event, step }) => {
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
          await updateUserLevelPlusOne(telegram_id, userExists.level)
          logger.info({
            message: '⬆️ Уровень пользователя увеличен',
            description: 'User level increased',
            telegram_id,
            newLevel: userExists.level + 1,
          })
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

        let costPerImage: number
        if (typeof modeCosts[ModeEnum.NeuroPhotoV2] === 'function') {
          costPerImage = modeCosts[ModeEnum.NeuroPhotoV2](numImagesToGenerate)
        } else {
          costPerImage = modeCosts[ModeEnum.NeuroPhotoV2]
        }

        const totalCost = costPerImage * numImagesToGenerate

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
      const paymentResult = await step.run('process-payment', async () => {
        logger.info({
          message: '💳 Обработка оплаты',
          description: 'Processing payment',
          telegram_id,
          totalCost: costCalculation.totalCost,
        })

        // Отправляем событие для обработки платежа
        return await inngest.send({
          name: 'payment/process',
          data: {
            telegram_id,
            paymentAmount: costCalculation.totalCost,
            is_ru,
            bot_name,
            description: `Payment for generating ${numImagesToGenerate} image${
              numImagesToGenerate === 1 ? '' : 's'
            } with prompt: ${prompt.substring(0, 30)}...`,
            type: 'NeuroPhotoV2',
            metadata: {
              prompt,
              num_images: numImagesToGenerate,
            },
          },
        })
      })

      logger.info({
        message: '✅ Платеж обработан',
        description: 'Payment processed',
        telegram_id,
        paymentResult,
      })

      // Получаем соотношение сторон и ID файнтюна пользователя
      const aspectRatio = await step.run('get-aspect-ratio', async () => {
        return await getAspectRatio(telegram_id)
      })

      const finetuneId = await step.run('get-finetune-id', async () => {
        return await getFineTuneIdByTelegramId(telegram_id)
      })

      logger.info({
        message: '📏 Параметры генерации получены',
        description: 'Generation parameters retrieved',
        telegram_id,
        aspectRatio,
        finetuneId,
      })

      // Определяем размеры изображения в зависимости от соотношения сторон
      const dimensions = await step.run('calculate-dimensions', () => {
        if (aspectRatio === '1:1') {
          return { width: 1024, height: 1024 }
        } else if (aspectRatio === '16:9') {
          return { width: 1368, height: 768 }
        } else if (aspectRatio === '9:16') {
          return { width: 768, height: 1368 }
        } else {
          return { width: 1024, height: 1024 }
        }
      })

      // Формируем входные данные для API
      const input = {
        finetune_id: finetuneId,
        finetune_strength: 2,
        prompt: `Fashionable: ${prompt}. Cinematic Lighting, realistic, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. Masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details, high quality, gorgeous, glamorous, 8K, super detail, gorgeous light and shadow, detailed decoration, detailed lines.`,
        aspect_ratio: aspectRatio,
        width: dimensions.width,
        height: dimensions.height,
        safety_tolerance: 0,
        output_format: 'jpeg',
        prompt_upsampling: true,
        webhook_url: `${API_URL}/webhooks/neurophoto`,
        webhook_secret: process.env.BFL_WEBHOOK_SECRET,
      }

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

            // Вызываем API для генерации изображения
            const response = await fetch(
              'https://api.us1.bfl.ai/v1/flux-pro-1.1-ultra-finetuned',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Key': process.env.BFL_API_KEY,
                },
                body: JSON.stringify(input),
              }
            )

            if (!response.ok) {
              const errorText = await response.text()
              logger.error({
                message: '❌ Ошибка при вызове API для генерации',
                description: 'API error during generation',
                status: response.status,
                statusText: response.statusText,
                error: errorText,
              })
              throw new Error(
                `API error: ${response.statusText} - ${errorText}`
              )
            }

            const data = await response.json()

            logger.info({
              message: '✅ Запрос на генерацию отправлен',
              description: 'Generation request sent successfully',
              taskId: data.id,
              status: data.status,
            })

            // Сохраняем промпт и задачу в базе данных
            const savedTask = await saveNeuroPhotoPrompt(
              data.id,
              prompt,
              ModeEnum.NeuroPhotoV2,
              telegram_id,
              data.status
            )

            return {
              taskId: data.id,
              status: data.status,
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

      const { telegram_id, bot_name, is_ru } = event.data

      try {
        // Пытаемся отправить сообщение об ошибке пользователю
        const botResult = getBotByName(bot_name)

        if (!botResult.bot) {
          logger.error({
            message:
              '❌ Бот не найден при попытке отправки сообщения об ошибке',
            description: 'Bot not found when trying to send error message',
            bot_name,
            error: botResult.error,
          })
          return
        }

        const bot = botResult.bot as Telegraf<MyContext>

        let errorMessageToUser = '❌ Произошла ошибка.'

        if (
          error instanceof Error &&
          error.message.includes('NSFW content detected')
        ) {
          errorMessageToUser = is_ru
            ? '❌ Обнаружен NSFW контент. Пожалуйста, попробуйте другой запрос.'
            : '❌ NSFW content detected. Please try another prompt.'
        } else if (error instanceof Error) {
          const match = error.message.match(/{"detail":"(.*?)"/)
          if (match && match[1]) {
            errorMessageToUser = is_ru
              ? `❌ Ошибка: ${match[1]}`
              : `❌ Error: ${match[1]}`
          } else {
            errorMessageToUser = is_ru
              ? '❌ Произошла ошибка. Попробуйте еще раз.'
              : '❌ An error occurred. Please try again.'
          }
        }

        try {
          await bot.telegram.sendMessage(telegram_id, errorMessageToUser)
        } catch (msgError) {
          logger.error({
            message: '❌ Не удалось отправить сообщение об ошибке',
            description: 'Failed to send error message',
            error:
              msgError instanceof Error ? msgError.message : 'Unknown error',
            telegram_id,
          })
        }
      } catch (sendError) {
        logger.error({
          message: '❌ Не удалось отправить сообщение об ошибке пользователю',
          description: 'Failed to send error message to user',
          error:
            sendError instanceof Error ? sendError.message : 'Unknown error',
          telegram_id,
        })
      }

      throw error
    }
  }
)
