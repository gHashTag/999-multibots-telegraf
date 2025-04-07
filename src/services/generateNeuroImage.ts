import { v4 as uuidv4 } from 'uuid'
import { isRussian } from '@/helpers'
import { Context } from 'telegraf'
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import { processApiResponse } from '@/helpers/processApiResponse'
import { saveFileLocally } from '@/helpers'
import { calculateModeCost, ModeEnum } from '@/price/helpers'
import { inngest } from '@/inngest-functions/clients'
import path from 'path'
import fs from 'fs'
import { API_URL } from '@/config'
import { savePrompt } from '@/core/supabase/savePrompt'
import { getAspectRatio } from '@/core/supabase/ai'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { pulse } from '@/helpers/pulse'
import { getBotByName } from '@/core/bot'

/**
 * Генерирует нейроизображение для пользователя напрямую, без использования Inngest
 */
export async function generateNeuroImage(
  prompt: string,
  model_url: string,
  numImages: number | string,
  telegram_id: string,
  ctx: Context,
  botName: string
): Promise<void> {
  // Валидация входных данных
  if (!prompt) {
    throw new Error('Prompt not found')
  }

  if (!model_url) {
    throw new Error('Model URL not found')
  }

  // Преобразуем numImages в число, даже если это строка
  const validNumImages = numImages ? parseInt(String(numImages), 10) : 1

  if (isNaN(validNumImages)) {
    logger.error('❌ Некорректное значение numImages:', {
      description: 'Invalid numImages value',
      received_value: numImages,
      received_type: typeof numImages,
    })
  }

  // Отправляем пользователю сообщение о том, что запрос принят
  try {
    await ctx.reply(
      isRussian(ctx)
        ? '🚀 Ваш запрос на генерацию изображения принят! Результат будет отправлен в этот чат в ближайшее время.'
        : '🚀 Your image generation request has been accepted! The result will be sent to this chat shortly.'
    )
  } catch (error) {
    logger.error('❌ Ошибка при отправке сообщения:', {
      description: 'Error sending message',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
    })
  }

  try {
    logger.info('🚀 Запуск прямой генерации изображения:', {
      description: 'Starting direct image generation',
      prompt,
      model_url,
      numImages: validNumImages,
      telegram_id,
      botName,
    })

    // Проверяем существование пользователя
    const user = await getUserByTelegramIdString(telegram_id)
    if (!user) {
      logger.error('❌ Пользователь не найден:', {
        description: 'User not found',
        telegram_id,
        botName,
      })
      await ctx.reply(
        isRussian(ctx)
          ? '❌ Ваш аккаунт не найден в базе данных. Пожалуйста, запустите бота заново с помощью команды /start'
          : '❌ Your account was not found in our database. Please restart the bot using the /start command'
      )
      return
    }

    // Обновляем уровень пользователя если нужно
    if (user.level === 1) {
      await updateUserLevelPlusOne(telegram_id, user.level)
    }

    // Рассчитываем стоимость
    const cost = calculateModeCost({
      mode: ModeEnum.NeuroPhoto,
      steps: validNumImages,
    })

    // Создаем уникальный ID операции
    const operationId = `neuro-photo-payment-${telegram_id}-${Date.now()}-${uuidv4().slice(
      0,
      8
    )}`

    // Списываем средства
    const paymentOperation = await inngest.send({
      id: operationId, // Используем уникальный ID для предотвращения дублирования
      name: 'payment/process',
      data: {
        telegram_id,
        amount: Math.abs(cost.stars), // Используем отрицательное значение для расхода
        type: 'money_expense',
        description: `Payment for generating ${validNumImages} image${
          validNumImages === 1 ? '' : 's'
        } with prompt: ${prompt.substring(0, 30)}...`,
        bot_name: botName,
        operation_id: operationId, // Передаем ID операции для отслеживания
        service_type: ModeEnum.NeuroPhoto,
        metadata: {
          service_type: ModeEnum.NeuroPhoto,
          prompt_preview: prompt.substring(0, 50),
          num_images: validNumImages,
          cost_per_image: cost.stars,
        },
      },
    })

    logger.info('💸 Платеж отправлен на обработку:', {
      description: 'Payment sent for processing',
      telegram_id,
      amount: -Math.abs(cost.stars),
      payment_id: paymentOperation.ids?.[0] || 'unknown',
    })

    // Получаем аспект изображения
    const aspect_ratio = await getAspectRatio(telegram_id)

    // Генерируем изображения
    const generatedImages = []
    const is_ru = isRussian(ctx)
    const username = ctx.message?.from?.username
    let failedAttempts = 0

    for (let i = 0; i < validNumImages; i++) {
      try {
        // Уведомляем о начале генерации
        const botResult = getBotByName(botName)
        if (!botResult?.bot) {
          throw new Error('Bot instance not found')
        }
        const { bot } = botResult

        await bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? `⏳ Генерация изображения ${i + 1} из ${validNumImages}`
            : `⏳ Generating image ${i + 1} of ${validNumImages}`
        )

        // Настраиваем параметры генерации
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

        // Преобразуем model_url в правильный формат для Replicate
        // Так как тип ожидает строки формата "namespace/model" или "namespace/model:version"
        const formattedModelUrl = model_url.includes('/')
          ? (model_url as `${string}/${string}`)
          : (`replicate/${model_url}` as `${string}/${string}`)

        const output = await replicate.run(formattedModelUrl, { input })
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
          username || '',
          is_ru,
          botName
        )

        // Отправляем изображение пользователю
        await bot.telegram.sendPhoto(telegram_id, {
          source: fs.createReadStream(localPath),
        })

        generatedImages.push(
          `${API_URL}/uploads/${telegram_id}/neuro-photo/${path.basename(
            localPath
          )}`
        )
      } catch (genError) {
        failedAttempts++
        logger.error({
          message: '🚨 Ошибка при генерации отдельного изображения',
          description: 'Error generating single image',
          attempt: i + 1,
          total_attempts: validNumImages,
          error: genError instanceof Error ? genError.message : 'Unknown error',
          telegram_id,
        })

        // Возврат средств за неудачную попытку
        try {
          const refundAmount = calculateModeCost({
            mode: ModeEnum.NeuroPhoto,
            steps: 1, // возвращаем за одно изображение
          }).stars

          // Создаем уникальный ID для операции возврата
          const refundOperationId = `refund-${telegram_id}-${Date.now()}-${uuidv4().slice(
            0,
            8
          )}`

          await inngest.send({
            id: refundOperationId,
            name: 'payment/process',
            data: {
              telegram_id,
              amount: refundAmount, // Для возврата используем положительное значение
              type: 'refund',
              description: `Возврат за неудачную генерацию изображения ${
                i + 1
              }/${validNumImages}`,
              bot_name: botName,
              operation_id: refundOperationId, // Передаем ID операции
              metadata: {
                service_type: ModeEnum.NeuroPhoto,
                error:
                  genError instanceof Error
                    ? genError.message
                    : 'Unknown error',
                attempt: i + 1,
                total_attempts: validNumImages,
              },
            },
          })

          // Уведомляем пользователя
          const botResult = getBotByName(botName)
          if (botResult?.bot) {
            const { bot } = botResult
            const message = is_ru
              ? `❌ Не удалось сгенерировать изображение ${
                  i + 1
                }/${validNumImages}. ${refundAmount} ⭐️ возвращены на ваш баланс.`
              : `❌ Failed to generate image ${
                  i + 1
                }/${validNumImages}. ${refundAmount} ⭐️ have been refunded.`

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
    if (failedAttempts === validNumImages) {
      throw new Error('All image generation attempts failed')
    }

    // Финальное сообщение с клавиатурой
    const botResult = getBotByName(botName)
    if (botResult?.bot) {
      const { bot } = botResult

      // Формируем сообщение для отправки
      const message = is_ru
        ? `Ваши изображения сгенерированы! ️`
        : `Your images generated!`

      // Клавиатура для ответа
      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '1️⃣' }, { text: '2️⃣' }, { text: '3️⃣' }, { text: '4️⃣' }],
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

      await bot.telegram.sendMessage(telegram_id, message, keyboard)
    }

    logger.info('✅ Генерация изображений завершена успешно:', {
      description: 'Image generation completed successfully',
      telegram_id,
      numImages: generatedImages.length,
    })
  } catch (error) {
    logger.error('❌ Критическая ошибка при генерации изображения:', {
      description: 'Critical error in image generation',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : null,
      telegram_id,
    })

    try {
      const botResult = getBotByName(botName)
      if (botResult?.bot) {
        const { bot } = botResult
        await bot.telegram.sendMessage(
          telegram_id,
          isRussian(ctx)
            ? '😔 Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
            : '😔 An error occurred while generating the image. Please try again later.'
        )
      }
    } catch (msgError) {
      logger.error('❌ Не удалось отправить сообщение об ошибке:', {
        description: 'Failed to send error message',
        error: msgError instanceof Error ? msgError.message : 'Unknown error',
        telegram_id,
      })
    }
  }
}
