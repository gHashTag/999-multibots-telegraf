import { inngest } from '@/inngest-functions/clients'
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
import { ModeEnum, calculateModeCost } from '@/price/helpers'
import path from 'path'
import { API_URL } from '@/config'
import fs from 'fs'
import { Logger as logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { v4 as uuidv4 } from 'uuid'

import { getUserBalance } from '@/core/supabase/getUserBalance'
import { supabase } from '@/core/supabase'

export const neuroImageGeneration = inngest.createFunction(
  {
    id: `neuro-image-generation`,
    retries: 1,
  },
  { event: 'neuro/photo.generate' },
  async ({ event, step }) => {
    try {
      const {
        prompt,
        model_url,
        numImages,
        telegram_id,
        username,
        is_ru,
        bot_name,
      } = event.data

      // Проверяем, не обрабатывается ли уже этот запрос
      const isProcessing = await step.run('check-processing', async () => {
        const { data: existingPrompts } = await supabase
          .from('prompts')
          .select('*')
          .eq('telegram_id', telegram_id)
          .eq('prompt', prompt)
          .eq('status', 'PROCESSING')
          .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)

        return existingPrompts && existingPrompts.length > 0
      })

      if (isProcessing) {
        logger.info('⚠️ Запрос уже обрабатывается', {
          description: 'Request is already being processed',
          telegram_id,
          prompt: prompt.substring(0, 50) + '...',
        })
        return { success: false, error: 'Request is already being processed' }
      }

      // Сохраняем статус PROCESSING
      await step.run('save-processing-status', async () => {
        await savePrompt(
          prompt,
          model_url,
          ModeEnum.NeuroPhoto,
          '',
          telegram_id,
          'PROCESSING'
        )
      })

      // Гарантируем, что numImages будет числом
      const validNumImages = numImages ? parseInt(String(numImages), 10) : 1

      logger.info('🎨 Starting neuro image generation', {
        description: 'Starting neuro image generation process',
        telegram_id,
        prompt: prompt.substring(0, 50) + '...',
        model_url,
        num_images: validNumImages,
        original_numImages: numImages,
        original_numImages_type: typeof numImages,
      })

      const botData = (await step.run('get-bot', async () => {
        logger.info('🤖 Getting bot instance', {
          description: 'Retrieving bot instance by name',
          botName: bot_name,
          step: 'get-bot',
        })

        return getBotByName(bot_name)
      })) as { bot: any }
      console.log('botData 🤖', botData)
      const bot = botData.bot

      if (!bot) {
        logger.error('❌ Bot instance not found', {
          description: 'Bot instance not found by name',
          bot_name,
          telegram_id,
        })
      } else {
        logger.info('✅ Bot instance found', {
          description: 'Successfully found bot instance by name',
          bot_name,
          telegram_id,
        })
      }

      const userExists = await step.run('check-user', async () => {
        logger.info('👤 Validating user existence', {
          description: 'Checking if user exists in database',
          telegram_id,
        })
        const user = await getUserByTelegramIdString(telegram_id)
        if (!user) {
          logger.error('❌ User not found in database', {
            description: 'User telegram_id not found in users table',
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
              logger.error('❌ Failed to send error message to user', {
                description:
                  'Error occurred while sending error message to user',
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

        logger.info('✅ User found in database', {
          description: 'Successfully found user in database',
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
          logger.info('⬆️ User level upgraded', {
            description: 'User level was successfully increased',
            telegram_id,
            newLevel: userExists.level + 1,
          })
        })
      }

      const costPerImage = await step.run('calculate-cost', async () => {
        logger.info('💰 Расчет стоимости', {
          description: 'Calculating cost per image',
          num_images: validNumImages,
          mode: ModeEnum.NeuroPhoto,
        })

        const cost = calculateModeCost({
          mode: ModeEnum.NeuroPhoto,
          steps: validNumImages,
        })

        logger.info('💸 Calculated image cost', {
          description: 'Image cost calculated successfully',
          costPerImage: cost.stars,
          costPerImageType: typeof cost.stars,
          num_images: validNumImages,
          num_imagesType: typeof validNumImages,
          totalCost: cost.stars,
          totalCostType: typeof cost.stars,
          telegram_id,
        })

        return cost.stars
      })

      const balanceCheck = await step.run('process-payment', async () => {
        if (!telegram_id) {
          logger.error('❌ Отсутствует telegram_id', {
            description: 'Missing telegram_id for payment processing',
          })
          throw new Error('Missing telegram_id')
        }

        if (!costPerImage || isNaN(Number(costPerImage))) {
          logger.error('❌ Некорректная стоимость изображения', {
            description: 'Invalid cost per image for payment processing',
            costPerImage,
            telegram_id,
          })
          throw new Error('Invalid cost per image')
        }

        if (!validNumImages || isNaN(Number(validNumImages))) {
          logger.error('❌ Некорректное количество изображений', {
            description: 'Invalid number of images for payment processing',
            num_images: validNumImages,
            original_numImages: numImages,
            telegram_id,
          })
          throw new Error('Invalid number of images')
        }

        // Явно преобразуем в число перед использованием
        const validNumImagesAsNumber = Number(validNumImages)

        const paymentAmount = parseFloat(
          (Number(costPerImage) * validNumImagesAsNumber).toFixed(2)
        )

        // Генерируем уникальный ID для операции
        const payment_operation_id = uuidv4()

        // Отправляем событие для обработки платежа
        await inngest.send({
          id: payment_operation_id,
          name: 'payment/process',
          data: {
            telegram_id,
            amount: Math.abs(paymentAmount),
            stars: Math.abs(paymentAmount),
            type: 'money_expense',
            description: `Payment for generating ${numImages} image${
              numImages > 1 ? 's' : ''
            } with prompt: ${prompt.slice(0, 50)}...`,
            bot_name,
            inv_id: payment_operation_id,
            service_type: ModeEnum.NeuroPhoto,
            metadata: {
              num_images: numImages,
              operation_id: payment_operation_id,
              service_type: ModeEnum.NeuroPhoto,
              cost_per_image: costPerImage,
              prompt_preview: prompt.slice(0, 50),
            },
          },
        })

        logger.info('💸 Payment sent for processing', {
          description: 'Payment sent via payment/process event',
          telegram_id,
          payment_operation_id,
          paymentAmount: -Math.abs(paymentAmount),
        })

        return { success: true, payment_id: payment_operation_id }
      })

      if (!balanceCheck.success) {
        logger.error('❌ Payment processing failed', {
          description: 'Failed to process payment',
          telegram_id,
          payment_id: balanceCheck.payment_id,
        })
        throw new Error('Payment processing failed')
      }

      // Получаем аспект изображения
      const aspect_ratio = await getAspectRatio(telegram_id)

      const generatedImages = []

      // Преобразуем в число перед использованием в цикле
      const numImagesToGenerate = Number(validNumImages)
      let failedAttempts = 0

      for (let i = 0; i < numImagesToGenerate; i++) {
        try {
          const generationResult = await step.run(
            `generate-image-${i}`,
            async () => {
              const botResult = getBotByName(bot_name)
              if (!botResult?.bot) {
                throw new Error('Bot instance not found')
              }
              const { bot } = botResult

              await bot.telegram.sendMessage(
                telegram_id,
                is_ru
                  ? `⏳ Генерация изображения ${
                      i + 1
                    } из ${numImagesToGenerate}`
                  : `⏳ Generating image ${i + 1} of ${numImagesToGenerate}`
              )

              const input = {
                prompt: `${prompt}. Cinematic Lighting, realistic, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. Masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details, high quality, gorgeous, glamorous, 8K, super detail, gorgeous light and shadow, detailed decoration, detailed lines.`,
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
                'COMPLETED'
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
            const botResult = getBotByName(bot_name)
            if (!botResult?.bot) {
              throw new Error('Bot instance not found')
            }
            const { bot } = botResult

            await bot.telegram.sendPhoto(telegram_id, {
              source: fs.createReadStream(generationResult.path),
            })
          })

          generatedImages.push(generationResult.url)
        } catch (genError) {
          failedAttempts++
          logger.error({
            message: '🚨 Ошибка при генерации отдельного изображения',
            description: 'Error generating single image',
            attempt: i + 1,
            total_attempts: numImagesToGenerate,
            error:
              genError instanceof Error ? genError.message : 'Unknown error',
            telegram_id,
          })

          // Возврат средств за неудачную попытку
          try {
            const refundAmount = calculateModeCost({
              mode: ModeEnum.NeuroPhoto,
              steps: 1, // возвращаем за одно изображение
            }).stars

            await inngest.send({
              id: `refund-${telegram_id}-${Date.now()}-${uuidv4()}`,
              name: 'payment/process',
              data: {
                telegram_id,
                amount: refundAmount,
                type: 'refund',
                description: `Возврат за неудачную генерацию изображения ${
                  i + 1
                }/${numImagesToGenerate}`,
                bot_name,
                metadata: {
                  service_type: ModeEnum.NeuroPhoto,
                  error:
                    genError instanceof Error
                      ? genError.message
                      : 'Unknown error',
                  attempt: i + 1,
                  total_attempts: numImagesToGenerate,
                },
              },
            })

            // Уведомляем пользователя
            const botResult = getBotByName(bot_name)
            if (botResult?.bot) {
              const { bot } = botResult
              const message = is_ru
                ? `❌ Не удалось сгенерировать изображение ${
                    i + 1
                  }/${numImagesToGenerate}. ${refundAmount} ⭐️ возвращены на ваш баланс.`
                : `❌ Failed to generate image ${
                    i + 1
                  }/${numImagesToGenerate}. ${refundAmount} ⭐️ have been refunded.`

              await bot.telegram.sendMessage(telegram_id, message)
            }
          } catch (refundError) {
            logger.error({
              message: '🚨 Ошибка при возврате средств за неудачную генерацию',
              error:
                refundError instanceof Error
                  ? refundError.message
                  : 'Unknown error',
              originalError:
                genError instanceof Error ? genError.message : 'Unknown error',
              telegram_id,
              attempt: i + 1,
            })
          }
        }
      }

      // Если все попытки были неудачными, прерываем выполнение
      if (failedAttempts === numImagesToGenerate) {
        throw new Error('All image generation attempts failed')
      }

      // Отдельный шаг для проверки баланса
      await step.run('check-balance', async () => {
        try {
          logger.info('🔍 Начало шага проверки баланса', {
            description: 'Starting balance check step',
            telegram_id,
            bot_name,
          })

          // Получаем актуальный баланс пользователя напрямую из функции getUserBalance
          let actualBalance
          try {
            // Для всех ботов используем стандартную функцию
            actualBalance = await getUserBalance(telegram_id, bot_name)

            logger.info('💰 Получен баланс пользователя', {
              description: 'User balance retrieved',
              telegram_id,
              actualBalance,
              actualBalanceType: typeof actualBalance,
              actualBalanceIsNull: actualBalance === null,
            })
          } catch (balanceError) {
            logger.error('❌ Ошибка при получении баланса', {
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
          logger.info('💵 Проверка баланса после операций', {
            description: 'Balance check after operations',
            telegram_id,
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
          }
        } catch (error) {
          logger.error('❌ Ошибка в шаге проверки баланса', {
            description: 'Error in balance check step',
            telegram_id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          return {
            rawBalance: 0,
            formattedBalance: '0.00',
          }
        }
      })

      await step.run('final-notification', async () => {
        try {
          // Безопасное получение бота
          const botResult = getBotByName(bot_name)
          if (!botResult || !botResult.bot) {
            logger.error('❌ Не удалось получить экземпляр бота', {
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
            ? `Ваши изображения сгенерированы! ️`
            : `Your images generated!`

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
    } catch (error: unknown) {
      logger.error({
        message: '🚨 Ошибка генерации изображения',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegram_id: event.data.telegram_id,
      })

      // Обработка возврата средств
      try {
        const { telegram_id, bot_name, is_ru } = event.data
        const validNumImages = event.data.numImages
          ? parseInt(String(event.data.numImages), 10)
          : 1

        // Расчет суммы для возврата
        const refundAmount = calculateModeCost({
          mode: ModeEnum.NeuroPhoto,
          steps: validNumImages,
        }).stars

        logger.info({
          message: '💸 Начало процесса возврата средств',
          description: 'Starting refund process due to generation error',
          telegram_id,
          refundAmount,
          error: error instanceof Error ? error.message : String(error),
        })

        // Отправляем событие возврата средств
        await inngest.send({
          name: 'payment/process',
          data: {
            telegram_id,
            amount: refundAmount,
            type: 'refund',
            description: `Возврат средств за неудачную генерацию ${validNumImages} изображений`,
            bot_name,
            metadata: {
              service_type: ModeEnum.NeuroPhoto,
              error: error instanceof Error ? error.message : String(error),
              num_images: validNumImages,
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
      } catch (refundError: unknown) {
        logger.error({
          message: '🚨 Ошибка при попытке возврата средств',
          error:
            refundError instanceof Error
              ? refundError.message
              : String(refundError),
          originalError: error instanceof Error ? error.message : String(error),
          telegram_id: event.data.telegram_id,
        })
      }

      await inngest.send({
        name: 'neuro/photo.failed',
        data: {
          ...event.data,
          error: error instanceof Error ? error.message : String(error),
        },
      })

      throw error
    }
  }
)
