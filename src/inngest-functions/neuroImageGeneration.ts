import { inngest } from '@/core/inngest/clients'
import { replicate } from '@/core/replicate'
import { getAspectRatio } from '@/core/supabase/ai'
import { savePrompt } from '@/core/supabase/savePrompt'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { processApiResponse } from '@/helpers/processApiResponse'

import { saveFileLocally } from '@/helpers'
import { pulse } from '@/helpers/pulse'
import { modeCosts, ModeEnum } from '@/price/helpers/modelsCost'
import path from 'path'
import { API_URL } from '@/config'
import fs from 'fs'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'

import { getUserBalance } from '@/core/supabase/getUserBalance'

export const neuroImageGeneration = inngest.createFunction(
  {
    id: `neuro-image-generation`,
    // Включаю идемпотентность на основе telegram_id и промпта
    idempotency: 'event.data.telegram_id + "-" + event.data.prompt',
    retries: 3,
  },
  { event: 'neuro/photo.generate' },
  async ({ event, step }) => {
    try {
      const {
        prompt,
        model_url,
        num_images = 1,
        telegram_id,
        username,
        is_ru,
        bot_name,
      } = event.data

      const validNumImages = num_images ? parseInt(String(num_images), 10) : 1

      logger.info({
        message: '🎨 Starting neuro image generation',
        telegram_id,
        prompt: prompt.substring(0, 50) + '...',
        model_url,
        num_images: validNumImages,
      })

      const botData = (await step.run('get-bot', async () => {
        logger.info({
          message: '🤖 Getting bot instance',
          botName: bot_name,
          step: 'get-bot',
        })

        return getBotByName(bot_name)
      })) as { bot: any }
      console.log('botData', botData)
      const bot = botData.bot

      if (!bot) {
        logger.error({
          message: '❌ Bot instance not found',
          bot_name,
          telegram_id,
        })
      } else {
        logger.info({
          message: '✅ Bot instance found',
          bot_name,
          telegram_id,
        })
      }

      const userExists = await step.run('check-user', async () => {
        logger.info({
          message: '👤 Validating user existence',
          telegram_id,
        })
        const user = await getUserByTelegramIdString(telegram_id)
        if (!user) {
          logger.error({
            message: '❌ User not found in database',
            telegram_id: telegram_id,
            bot_name,
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
                message: '❌ Failed to send error message to user',
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
          message: '✅ User found in database',
          telegram_id,
          user_id: user.id,
          bot_name: user.bot_name,
        })

        return user
      })

      // Уровень пользователя
      if (userExists.level === 1) {
        await step.run('update-level', async () => {
          await updateUserLevelPlusOne(telegram_id, userExists.level)
          logger.info({
            message: '⬆️ User level upgraded',
            telegram_id,
            newLevel: userExists.level + 1,
          })
        })
      }

      const costPerImage = await step.run('calculate-cost', async () => {
        logger.info({
          message: '💰 Расчет стоимости',
          description: 'Calculating cost per image',
          num_images: validNumImages,
          mode: ModeEnum.NeuroPhoto,
        })

        // Дополнительное логирование типов и значений
        const rawCost = modeCosts[ModeEnum.NeuroPhoto]
        logger.info({
          message: '🔍 Детали расчета стоимости',
          description: 'Cost calculation details',
          rawCost,
          rawCostType: typeof rawCost,
          rawCostValue: String(rawCost),
        })

        // Используем фиксированную стоимость вместо функции и корректно обрабатываем умножение
        const costPerImage = parseFloat(
          Number(modeCosts[ModeEnum.NeuroPhoto]).toFixed(2)
        )

        // Проверка на корректность рассчитанной стоимости
        if (isNaN(costPerImage)) {
          logger.error({
            message: '❌ Некорректная стоимость изображения',
            description: 'Invalid image cost calculation',
            costPerImage,
            costPerImageType: typeof costPerImage,
            mode: ModeEnum.NeuroPhoto,
            num_images: validNumImages,
          })
          throw new Error('Invalid cost calculation')
        }

        // Для обратной совместимости с предыдущей реализацией
        const totalCost = parseFloat((costPerImage * validNumImages).toFixed(2))

        logger.info({
          message: '💸 Calculated image cost',
          description: 'Image cost calculated successfully',
          costPerImage,
          costPerImageType: typeof costPerImage,
          num_images: validNumImages,
          num_imagesType: typeof validNumImages,
          totalCost,
          totalCostType: typeof totalCost,
          telegram_id,
        })

        return costPerImage
      })

      const balanceCheck = await step.run('process-payment', async () => {
        // Убедимся, что все параметры корректны перед вызовом processBalanceOperation
        if (!telegram_id) {
          logger.error({
            message: '❌ Отсутствует telegram_id',
            description: 'Missing telegram_id for payment processing',
          })
          throw new Error('Missing telegram_id')
        }

        if (!costPerImage || isNaN(Number(costPerImage))) {
          logger.error({
            message: '❌ Некорректная стоимость изображения',
            description: 'Invalid cost per image for payment processing',
            costPerImage,
            telegram_id,
          })
          throw new Error('Invalid cost per image')
        }

        if (!validNumImages || isNaN(Number(validNumImages))) {
          logger.error({
            message: '❌ Некорректное количество изображений',
            description: 'Invalid number of images for payment processing',
            num_images: validNumImages,
            telegram_id,
          })
          throw new Error('Invalid number of images')
        }

        const paymentAmount = parseFloat(
          (Number(costPerImage) * validNumImages).toFixed(2)
        )

        logger.info({
          message: '💰 Списание средств',
          description: 'Processing payment',
          telegram_id,
          costPerImage: Number(costPerImage),
          num_images: validNumImages,
          totalAmount: paymentAmount,
          bot_name,
          operation_id: `${telegram_id}-${Date.now()}`, // Добавляем уникальный идентификатор операции
        })

        // Отправляем событие для обработки платежа с помощью processPaymentFunction
        const paymentResult = await inngest.send({
          id: `${telegram_id}-${Date.now()}-${prompt.substring(0, 10)}`,
          name: 'payment/process',
          data: {
            telegram_id,
            paymentAmount,
            is_ru,
            bot_name,
            bot,
            description: `Payment for generating ${validNumImages} image${
              validNumImages === 1 ? '' : 's'
            } with prompt: ${prompt.substring(0, 30)}...`,
            operation_id: `${telegram_id}-${Date.now()}-${prompt.substring(
              0,
              10
            )}`,
            metadata: {
              service_type: 'NeuroPhoto',
            },
          },
        })

        logger.info({
          message: '💸 Платеж отправлен на обработку',
          description: 'Payment sent for processing',
          telegram_id,
          paymentAmount,
          operation_id: `${telegram_id}-${Date.now()}-${prompt.substring(
            0,
            10
          )}`,
        })

        // Даем время на обработку платежа
        await new Promise(resolve => setTimeout(resolve, 500))

        // Получаем актуальный баланс пользователя напрямую из функции getUserBalance
        const newBalance = await getUserBalance(telegram_id)

        if (newBalance === null || newBalance === undefined) {
          logger.error({
            message: '❌ Ошибка при получении баланса пользователя',
            description: 'Error fetching user balance',
            telegram_id,
          })
          throw new Error(
            `Error fetching user balance for user: ${telegram_id}`
          )
        }

        logger.info({
          message: '✅ Платеж обработан, новый баланс из payments:',
          description:
            'Payment processed, new balance calculated from payments:',
          telegram_id,
          newBalance,
          paymentAmount,
        })

        return {
          success: true,
          newBalance,
          event: paymentResult,
        }
      })

      const aspect_ratio = await step.run('get-aspect-ratio', async () => {
        const ratio = await getAspectRatio(telegram_id)
        logger.info({
          message: '📐 Using aspect ratio',
          ratio,
        })
        return ratio
      })

      const generatedImages = []

      for (let i = 0; i < validNumImages; i++) {
        const generationResult = await step.run(
          `generate-image-${i}`,
          async () => {
            const { bot } = getBotByName(bot_name)
            await bot.telegram.sendMessage(
              telegram_id,
              is_ru
                ? `⏳ Генерация изображения ${i + 1} из ${validNumImages}`
                : `⏳ Generating image ${i + 1} of ${validNumImages}`
            )

            const input = {
              prompt: `Fashionable: ${prompt}. Cinematic Lighting, realistic, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. Masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details, high quality, gorgeous, glamorous, 8K, super detail, gorgeous light and shadow, detailed decoration, detailed lines.`,
              negative_prompt: 'nsfw, erotic, violence, bad anatomy...',
              num_inference_steps: 40,
              guidance_scale: 3,
              lora_scale: 1,
              megapixels: '1',
              output_quality: 80,
              prompt_strength: 0.8,
              extra_lora_scale: 1,
              go_fast: false,
              ...(aspect_ratio === '1:1'
                ? { width: 1024, height: 1024 }
                : aspect_ratio === '16:9'
                ? { width: 1368, height: 768 }
                : aspect_ratio === '9:16'
                ? { width: 768, height: 1368 }
                : { width: 1024, height: 1024 }),
              sampler: 'flowmatch',
              num_outputs: 1,
              aspect_ratio,
            }

            const output = await replicate.run(model_url, { input })
            const imageUrl = await processApiResponse(output)

            if (!imageUrl) throw new Error('Image generation failed')

            const localPath = await saveFileLocally(
              telegram_id,
              imageUrl,
              'neuro-photo',
              '.jpeg'
            )

            const prompt_id = await savePrompt(
              prompt,
              model_url,
              ModeEnum.NeuroPhoto,
              imageUrl,
              telegram_id,
              'SUCCESS'
            )

            if (!prompt_id) {
              logger.error('Failed to save prompt')
              throw new Error('Prompt save failed')
            }

            await pulse(
              localPath,
              prompt,
              `/${model_url}`,
              telegram_id,
              username,
              is_ru,
              bot_name
            )

            return {
              url: `${API_URL}/uploads/${telegram_id}/neuro-photo/${path.basename(
                localPath
              )}`,
              path: localPath,
              prompt_id,
            }
          }
        )

        await step.run(`notify-image-${i}`, async () => {
          const { bot } = getBotByName(bot_name)
          await bot.telegram.sendPhoto(telegram_id, {
            source: fs.createReadStream(generationResult.path),
          })
        })

        generatedImages.push(generationResult.url)
      }

      // Отдельный шаг для проверки баланса
      const userBalance = await step.run('check-balance', async () => {
        try {
          // Получаем актуальный баланс пользователя напрямую из функции getUserBalance
          let actualBalance
          try {
            actualBalance = await getUserBalance(telegram_id)
            logger.info({
              message: '💰 Получен баланс пользователя',
              description: 'User balance retrieved',
              telegram_id,
              actualBalance,
              actualBalanceType: typeof actualBalance,
              actualBalanceIsNull: actualBalance === null,
            })
          } catch (balanceError) {
            logger.error({
              message: '❌ Ошибка при получении баланса',
              description: 'Error while getting user balance',
              telegram_id,
              error:
                balanceError instanceof Error
                  ? balanceError.message
                  : 'Unknown error',
            })
            actualBalance = 0 // Устанавливаем значение по умолчанию
          }

          // Логируем для сравнения
          logger.info({
            message: '💵 Проверка баланса после операций',
            description: 'Balance check after operations',
            telegram_id,
            balanceFromOperation: balanceCheck?.newBalance || 'unknown',
            balanceFromPayments: actualBalance,
            costTotal: (costPerImage * validNumImages).toFixed(2),
          })

          // Безопасно форматируем баланс
          const formattedBalance =
            actualBalance !== null && actualBalance !== undefined
              ? Number(actualBalance).toFixed(2)
              : '0.00'

          return {
            rawBalance: actualBalance,
            formattedBalance,
            balanceFromOperation: balanceCheck?.newBalance,
          }
        } catch (error) {
          logger.error({
            message: '❌ Ошибка в шаге проверки баланса',
            description: 'Error in balance check step',
            telegram_id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          return {
            rawBalance: 0,
            formattedBalance: '0.00',
            balanceFromOperation: 'unknown',
          }
        }
      })

      await step.run('final-notification', async () => {
        try {
          // Безопасное получение бота
          const botResult = getBotByName(bot_name)
          if (!botResult || !botResult.bot) {
            logger.error({
              message: '❌ Не удалось получить экземпляр бота',
              description: 'Failed to get bot instance',
              bot_name,
              telegram_id,
              botResult: JSON.stringify(botResult),
            })
            return // Прерываем выполнение шага, если бот не получен
          }

          const { bot } = botResult

          // Формируем сообщение для отправки, используя результат из шага check-balance
          const message = is_ru
            ? `Ваши изображения сгенерированы! Стоимость: ${(
                costPerImage * validNumImages
              ).toFixed(2)} ⭐️\nНовый баланс: ${
                userBalance.formattedBalance
              } ⭐️`
            : `Your images generated! Cost: ${(
                costPerImage * validNumImages
              ).toFixed(2)} ⭐️\nNew balance: ${
                userBalance.formattedBalance
              } ⭐️`

          // Клавиатура для ответа
          const keyboard = {
            reply_markup: {
              keyboard: [
                [
                  { text: '1️⃣' },
                  { text: '2️⃣' },
                  { text: '3️⃣' },
                  { text: '4️⃣' },
                ],
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

          // Отправка сообщения с защитой от ошибок
          try {
            await bot.telegram.sendMessage(telegram_id, message, keyboard)
            logger.info({
              message: '✅ Отправлено финальное сообщение пользователю',
              description: 'Final message sent to user',
              telegram_id,
            })
          } catch (sendError) {
            logger.error({
              message: '❌ Ошибка при отправке сообщения',
              description: 'Error sending message to user',
              telegram_id,
              error:
                sendError instanceof Error
                  ? sendError.message
                  : 'Unknown error',
            })
          }
        } catch (finalStepError) {
          // Общий обработчик ошибок для всего шага
          logger.error({
            message: '❌ Общая ошибка в шаге final-notification',
            description: 'General error in final-notification step',
            telegram_id,
            error:
              finalStepError instanceof Error
                ? finalStepError.message
                : 'Unknown error',
            stack:
              finalStepError instanceof Error
                ? finalStepError.stack
                : undefined,
          })
        }
      })

      logger.info({
        message: '✅ Successfully completed neuro generation',
        telegram_id,
        numImages: generatedImages.length,
      })

      return { success: true, images: generatedImages }
    } catch (error) {
      logger.error({
        message: '🚨 Neuro image generation failed',
        error: error.message,
        stack: error.stack,
        telegram_id: event.data.telegram_id,
      })

      await inngest.send({
        name: 'neuro/photo.failed',
        data: {
          ...event.data,
          error: error.message,
        },
      })

      throw error
    }
  }
)
