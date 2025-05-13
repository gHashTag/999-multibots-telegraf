import { ModeEnum } from '@/interfaces/modes'
import { isRussian } from '@/helpers/language'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
  savePromptDirect,
} from '@/core/supabase'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { directPaymentProcessor } from '@/core/supabase/directPayment'
import { PaymentType } from '@/interfaces/payments.interface'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import { sendMediaToPulse, MediaPulseOptions } from '@/helpers/pulse'
import { processApiResponse } from '@/helpers/error/processApiResponse'
import { replicate } from '@/core/replicate'
import { getAspectRatio } from '@/core/supabase/ai'
import { v4 as uuidv4 } from 'uuid'
import { ApiResponse } from '@/interfaces/api.interface'
import { BotName } from '@/interfaces/telegram-bot.interface'
/**
 * Прямая генерация нейрофото V1 без использования Inngest.
 * Используется как резервный вариант при отсутствии доступа к Inngest.
 *
 * @param prompt Промпт для генерации изображения
 * @param model_url URL модели для генерации
 * @param numImages Количество изображений для генерации
 * @param telegram_id ID пользователя в Telegram
 * @param ctx Контекст Telegraf
 * @param botName Имя бота
 * @param options Опции для функции
 * @returns Объект с информацией о результате генерации
 */
export async function generateNeuroPhotoDirect(
  prompt: string,
  model_url: string,
  numImages: number,
  telegram_id: string,
  ctx: MyContext,
  botName: string,
  options?: {
    disable_telegram_sending?: boolean
    bypass_payment_check?: boolean
  }
): Promise<{ data: string; success: boolean; urls?: string[] } | null> {
  // --- DEBUG LOG ---
  // console.log(
  //   '>>> generateNeuroPhotoDirect: Called with',
  //   {
  //     telegram_id: telegram_id,
  //     numImagesReceived: numImages, // Логируем исходное numImages
  //     promptSample: prompt ? prompt.substring(0, 70) + '...' : 'null',
  //     model_url: model_url,
  //     botName: botName
  //   }
  // );
  // --- END DEBUG LOG ---

  logger.info({
    message: '🚀 [DIRECT] Начало прямой генерации Neurophoto V1',
    description: 'Starting direct Neurophoto V1 generation',
    prompt: prompt.substring(0, 50) + '...',
    model_url,
    numImages,
    telegram_id,
    botName,
    disable_telegram_sending: options?.disable_telegram_sending,
  })

  try {
    // Проверяем наличие промпта и модели
    if (!prompt) {
      logger.error({
        message: '❌ [DIRECT] Отсутствует промпт для генерации',
        description: 'No prompt found for direct generation',
        telegram_id,
      })
      throw new Error('Prompt not found')
    }

    if (!model_url) {
      logger.error({
        message: '❌ [DIRECT] Отсутствует URL модели для генерации',
        description: 'No model URL found for direct generation',
        telegram_id,
      })
      throw new Error('Model URL not found')
    }

    // Убедимся что numImages имеет разумное значение
    const validNumImages = numImages && numImages > 0 ? numImages : 1
    // --- DEBUG LOG ---
    // console.log(
    //   '>>> generateNeuroPhotoDirect: Validated numImages',
    //   {
    //     telegram_id: telegram_id,
    //     originalNumImages: numImages,
    //     validNumImages: validNumImages
    //   }
    // );
    // --- END DEBUG LOG ---
    const is_ru = isRussian(ctx)
    const username = ctx.from?.username || 'unknown'

    // Получаем экземпляр бота
    logger.info({
      message: '🤖 [DIRECT] Получение экземпляра бота',
      description: 'Getting bot instance',
      botName,
    })

    const botResult = getBotByName(botName as BotName)
    if (!botResult.bot) {
      logger.error({
        message: '❌ [DIRECT] Бот не найден',
        description: 'Bot not found for direct generation',
        botName,
        error: botResult.error,
      })
      console.error(
        `❌ [DIRECT] Бот с именем ${botName} не найден: ${botResult.error}`
      )
      throw new Error(`Bot with name ${botName} not found`)
    }

    const bot = botResult.bot
    logger.info({
      message: '✅ [DIRECT] Экземпляр бота получен',
      description: 'Bot instance retrieved',
      botName,
    })

    // Проверяем существование пользователя
    logger.info({
      message: '👤 [DIRECT] Проверка существования пользователя',
      description: 'Checking if user exists in database (direct)',
      telegram_id,
    })

    const user = await getUserByTelegramId(ctx)

    if (!user) {
      logger.error({
        message: '❌ [DIRECT] Пользователь не найден в базе данных',
        description: 'User not found in database (direct)',
        telegram_id,
      })
      console.error(
        `❌ [DIRECT] Пользователь с ID ${telegram_id} не найден в базе данных`
      )

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
              '❌ [DIRECT] Не удалось отправить сообщение об ошибке пользователю',
            description: 'Failed to send error message to user (direct)',
            error:
              sendError instanceof Error ? sendError.message : 'Unknown error',
            telegram_id,
          })
        }
      }

      throw new Error(`User with ID ${telegram_id} not found in database`)
    }

    logger.info({
      message: '✅ [DIRECT] Пользователь найден в базе данных',
      description: 'User found in database (direct)',
      telegram_id,
      user_id: user.id,
    })

    // Увеличиваем уровень пользователя, если он на первом уровне
    if (user.level === 1) {
      if (!user.level) {
        await updateUserLevelPlusOne(telegram_id, 1)
      } else {
        await updateUserLevelPlusOne(telegram_id, user.level)
      }
    }

    // Расчёт стоимости генерации
    logger.info({
      message: '💰 [DIRECT] Расчет стоимости генерации',
      description: 'Calculating generation cost (direct)',
      num_images: validNumImages,
      mode: ModeEnum.NeuroPhoto,
    })

    const costResult = calculateModeCost({
      mode: ModeEnum.NeuroPhoto,
      steps: validNumImages,
    })
    const costPerImage = Number(costResult.stars)
    const totalCost = costPerImage * validNumImages

    logger.info({
      message: '💸 [DIRECT] Рассчитана стоимость генерации',
      description: 'Generation cost calculated (direct)',
      costPerImage,
      totalCost,
      num_images: validNumImages,
    })

    // Обработка оплаты напрямую через directPaymentProcessor
    logger.info({
      message: '💳 [DIRECT] Обработка оплаты',
      description: 'Processing payment (direct)',
      telegram_id,
      totalCost,
    })

    const paymentOperationId = `payment-${telegram_id}-${Date.now()}-${validNumImages}-${uuidv4()}`

    const paymentResult = await directPaymentProcessor({
      telegram_id,
      amount: totalCost,
      type: PaymentType.MONEY_OUTCOME,
      description: `Payment for generating ${validNumImages} image${
        validNumImages > 1 ? 's' : ''
      } with prompt: ${prompt.slice(0, 50)}...`,
      bot_name: botName,
      service_type: ModeEnum.NeuroPhoto,
      inv_id: paymentOperationId,
      bypass_payment_check:
        options?.bypass_payment_check || ctx?.session?.bypass_payment_check,
      metadata: {
        prompt: prompt.substring(0, 100),
        num_images: validNumImages,
        model_url,
      },
    })

    if (!paymentResult.success) {
      logger.error({
        message: '❌ [DIRECT] Ошибка при обработке платежа',
        description: 'Payment processing error (direct)',
        error: paymentResult.error,
        telegram_id,
      })
      console.error(
        `❌ [DIRECT] Ошибка при обработке платежа: ${paymentResult.error}`
      )

      // Добавляем проверку disable_telegram_sending
      if (!options?.disable_telegram_sending) {
        await bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? '❌ Не удалось обработать платеж. Пожалуйста, проверьте баланс и попробуйте еще раз.'
            : '❌ Failed to process payment. Please check your balance and try again.'
        )
      } else {
        logger.info({
          message:
            '🔇 [DIRECT] Отправка сообщения об ошибке платежа пропущена (режим тестирования)',
          description: 'Skipping payment error message (test mode)',
          telegram_id,
        })
      }

      return {
        data: 'Payment failed',
        success: false,
      }
    }

    // Получаем соотношение сторон для изображения
    logger.info({
      message: '📐 [DIRECT] Получение соотношения сторон',
      description: 'Getting aspect ratio',
      telegram_id,
      user_id: user.id,
    })

    const aspect_ratio = await getAspectRatio(Number(user.telegram_id))

    logger.info({
      message: '📐 [DIRECT] Соотношение сторон получено',
      description: 'Aspect ratio retrieved',
      aspect_ratio,
      telegram_id,
    })

    // Генерируем изображения
    const generatedUrls = []

    for (let i = 0; i < validNumImages; i++) {
      // --- DEBUG LOG ---
      // console.log(
      //   '>>> generateNeuroPhotoDirect: LOOP Iteration',
      //   {
      //     telegram_id: telegram_id,
      //     iteration: i,
      //     totalIterations: validNumImages,
      //     promptSample: prompt ? prompt.substring(0, 70) + '...' : 'null'
      //   }
      // );
      // --- END DEBUG LOG ---
      try {
        // Отправляем сообщение о начале генерации для каждого изображения
        if (!options?.disable_telegram_sending) {
          if (validNumImages > 1) {
            try {
              await bot.telegram.sendMessage(
                telegram_id,
                is_ru
                  ? `⏳ Генерация изображения ${i + 1} из ${validNumImages}`
                  : `⏳ Generating image ${i + 1} of ${validNumImages}`
              )
            } catch (sendError) {
              logger.error({
                message:
                  '❌ [DIRECT] Ошибка при отправке сообщения о генерации',
                description: 'Error sending generation message (direct)',
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
              await bot.telegram.sendMessage(
                telegram_id,
                is_ru ? '⏳ Генерация...' : '⏳ Generating...',
                {
                  reply_markup: { remove_keyboard: true },
                }
              )
            } catch (sendError) {
              logger.error({
                message:
                  '❌ [DIRECT] Ошибка при отправке сообщения о генерации',
                description: 'Error sending generation message (direct)',
                error:
                  sendError instanceof Error
                    ? sendError.message
                    : 'Unknown error',
                telegram_id,
              })
            }
          }
        } else {
          logger.info({
            message:
              '🔇 [DIRECT] Отправка статусного сообщения пропущена (режим тестирования)',
            description: 'Skipping status message (test mode)',
            telegram_id,
            image_index: i,
          })
        }

        logger.info({
          message: '🎨 [DIRECT] Запускаем прямую генерацию изображения',
          description: 'Starting direct image generation',
          telegram_id,
          prompt: prompt.substring(0, 50) + '...',
          model_url,
          iteration: i,
        })

        // Настраиваем параметры для модели
        const input = {
          prompt: `${prompt}. Cinematic Lighting, realistic, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. Masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details, high quality, gorgeous, glamorous, 8K, super detail, gorgeous light and shadow, detailed decoration, detailed lines.`,
          negative_prompt:
            'nsfw, erotic, violence, bad anatomy, bad hands, deformed fingers, blurry, grainy, ugly, lowres',
          num_inference_steps: 40,
          output_format: 'jpg',
          guidance_scale: 3,
          output_quality: 80,
          num_outputs: 1,
          aspect_ratio: aspect_ratio || '1:1',
        }

        // --- DEBUG LOG ---
        // console.log(
        //   '>>> generateNeuroPhotoDirect: Calling Replicate.run with input (num_outputs=1)',
        //   {
        //     telegram_id: telegram_id,
        //     iteration: i,
        //     model_url: model_url,
        //     // Не логируем весь input, он может быть большим, только ключевые моменты
        //     inputPromptSample: input.prompt.substring(0,70) + '...',
        //     inputNumOutputs: input.num_outputs
        //   }
        // );
        // --- END DEBUG LOG ---

        // Выполняем запрос к API
        logger.info({
          message: '[DIAGNOSTIC] Перед вызовом replicate.run()',
          iteration: i,
          telegram_id,
        }) // Новый лог
        const output = (await replicate.run(
          model_url as `${string}/${string}:${string}`,
          {
            input: input,
          }
        )) as ApiResponse
        logger.info({
          message: '[DIAGNOSTIC] Сразу после вызова replicate.run()',
          output_is_null: output === null,
          output_is_undefined: output === undefined,
          iteration: i,
          telegram_id,
        }) // Новый лог
        // --- ЛОГ: Ответ от API ---
        logger.info({
          message: '🔍 [DIRECT] Ответ от Replicate API получен',
          telegram_id,
          iteration: i,
          api_output: JSON.stringify(output),
        })
        // ---

        logger.info({
          message: '✅ [DIRECT] Получен ответ от API',
          description: 'API response received (direct)',
          output_type: typeof output,
          telegram_id,
        })

        // Обрабатываем API-ответ
        logger.info({
          message: '🔍 [DIRECT] Обработка ответа API Replicate',
          description: 'Processing Replicate API response',
          output_sample: JSON.stringify(output).substring(0, 100) + '...',
        })

        logger.info({
          message: '[DIAGNOSTIC] Перед вызовом processApiResponse()',
          iteration: i,
          telegram_id,
        }) // Новый лог
        const imageUrl = await processApiResponse(output)
        logger.info({
          message: '[DIAGNOSTIC] Сразу после вызова processApiResponse()',
          imageUrl_is_null: imageUrl === null,
          imageUrl_is_undefined: imageUrl === undefined,
          iteration: i,
          telegram_id,
        }) // Новый лог

        // --- ЛОГ: Результат обработки ответа ---
        logger.info({
          message: '🔍 [DIRECT] Результат processApiResponse',
          telegram_id,
          iteration: i,
          processed_image_url: imageUrl,
        })
        // ---

        // Проверка на валидность URL
        if (!imageUrl || !imageUrl.startsWith('http')) {
          logger.error({
            message: '❌ [DIRECT] Некорректный URL изображения',
            description: 'Invalid image URL returned from API',
            url: imageUrl,
            output_sample: JSON.stringify(output).substring(0, 100) + '...',
          })
          throw new Error('Invalid image URL from API')
        }

        // Сохраняем изображение локально для создания постоянной ссылки
        let localImageUrl = imageUrl
        try {
          // Сохраняем файл локально - используем правильную сигнатуру функции
          const savedLocalPath = await saveFileLocally(
            telegram_id,
            imageUrl,
            'neuro-photo-direct',
            '.jpg'
          )

          // Формируем URL для доступа к сохраненному файлу
          if (savedLocalPath) {
            // Используем оригинальный URL + путь для доступа к изображению
            localImageUrl = imageUrl

            logger.info({
              message: '✅ [DIRECT] Изображение успешно сохранено локально',
              description: 'Image successfully saved locally',
              localImageUrl,
              savedLocalPath,
              telegram_id,
            })
          }

          // Отправляем изображение в Pulse для аналитики
          const pulseOptions: MediaPulseOptions = {
            mediaType: 'photo',
            mediaSource: imageUrl, // Используем оригинальный URL для отправки
            telegramId: telegram_id,
            username: username || 'unknown',
            language: isRussian(ctx) ? 'ru' : 'en',
            serviceType: ModeEnum.NeuroPhoto,
            prompt: prompt, // Передаем ПОЛНЫЙ промпт, без обрезки
            botName: botName,
            additionalInfo: {
              model_url: model_url,
              aspect_ratio: aspect_ratio || '1:1',
              original_url: imageUrl.substring(0, 50) + '...',
            },
          }

          // ---> ЛОГ ПЕРЕД ВЫЗОВОМ
          logger.info({
            message: '🚦 [DIRECT] Параметры перед отправкой в sendMediaToPulse',
            description: 'Options before calling sendMediaToPulse',
            pulseOptions,
            telegram_id,
          })
          // <--- КОНЕЦ ЛОГА

          await sendMediaToPulse(pulseOptions)

          logger.info({
            message: '📊 [DIRECT] Изображение отправлено в Pulse',
            description: 'Image sent to Pulse analytics',
            telegram_id,
          })

          // Сохраняем промпт в базу данных для аналитики и истории
          await savePromptDirect(
            prompt,
            model_url,
            ModeEnum.NeuroPhoto,
            imageUrl,
            telegram_id.toString(),
            'success'
          )

          logger.info({
            message: '📝 [DIRECT] Промпт сохранен в базе данных',
            description: 'Prompt saved to database',
            telegram_id,
          })
        } catch (saveError) {
          // При ошибке сохранения локально продолжаем с оригинальным URL
          logger.error({
            message: '⚠️ [DIRECT] Ошибка при сохранении изображения локально',
            description: 'Error saving image locally',
            error:
              saveError instanceof Error ? saveError.message : 'Unknown error',
            originalUrl: imageUrl.substring(0, 50) + '...',
            telegram_id,
          })
          // Продолжаем с оригинальным URL, не прерываем процесс
        }

        // Добавляем URL в массив результатов
        generatedUrls.push(localImageUrl)

        // --- ЛОГ: Состояние массива URL ---
        logger.info({
          message: '📝 [DIRECT] URL добавлен в массив',
          telegram_id,
          iteration: i,
          current_url: localImageUrl.substring(0, 50) + '...',
          all_urls_so_far: generatedUrls.map(u => u.substring(u.length - 10)),
          all_urls_count: generatedUrls.length,
        })
        // ---

        logger.info({
          message: '📸 [DIRECT] Изображение успешно получено',
          description: 'Image URL obtained and added to results',
          imageUrl: localImageUrl.substring(0, 50) + '...',
          generatedUrls_count: generatedUrls.length,
          imageUrl_index: generatedUrls.indexOf(localImageUrl),
        })
      } catch (genError) {
        logger.error({
          message: '❌ [DIRECT] Ошибка при генерации изображения',
          description: 'Error generating image (direct)',
          error: genError instanceof Error ? genError.message : 'Unknown error',
          prompt: prompt.substring(0, 50) + '...',
          telegram_id,
          index: i,
        })
        console.error(
          `❌ [DIRECT] Ошибка при генерации изображения ${i + 1}: ${
            genError instanceof Error ? genError.message : 'Unknown error'
          }`
        )

        // Отправляем сообщение об ошибке пользователю
        try {
          if (!options?.disable_telegram_sending) {
            await bot.telegram.sendMessage(
              telegram_id,
              is_ru
                ? '❌ Произошла ошибка при генерации изображения. Мы вернем вам потраченные звезды в ближайшее время.'
                : '❌ An error occurred while generating the image. We will refund your stars soon.'
            )
          } else {
            logger.info({
              message:
                '🔇 [DIRECT] Отправка сообщения об ошибке генерации пропущена (режим тестирования)',
              description: 'Skipping generation error message (test mode)',
              telegram_id,
            })
          }
        } catch (sendError) {
          logger.error({
            message: '❌ [DIRECT] Ошибка при отправке сообщения об ошибке',
            description: 'Error sending error message (direct)',
            error:
              sendError instanceof Error ? sendError.message : 'Unknown error',
            telegram_id,
          })
        }

        // Выполняем возврат средств за неудачную генерацию
        try {
          const refundAmount = costPerImage
          const refundResult = await directPaymentProcessor({
            telegram_id,
            amount: refundAmount,
            type: PaymentType.REFUND,
            description: is_ru
              ? `Возврат за неудачную генерацию изображения с промптом: ${prompt.slice(
                  0,
                  30
                )}...`
              : `Refund for failed image generation with prompt: ${prompt.slice(
                  0,
                  30
                )}...`,
            bot_name: botName,
            service_type: ModeEnum.NeuroPhoto,
          })

          if (refundResult.success) {
            logger.info({
              message:
                '💰 [DIRECT] Выполнен возврат средств за неудачную генерацию',
              description: 'Refund processed for failed generation (direct)',
              refundAmount,
              telegram_id,
              refundResult,
            })

            try {
              if (!options?.disable_telegram_sending) {
                await bot.telegram.sendMessage(
                  telegram_id,
                  is_ru
                    ? `💰 Мы вернули вам ${refundAmount} звезд за неудачную генерацию изображения.`
                    : `💰 We have refunded you ${refundAmount} stars for the failed image generation.`
                )
              } else {
                logger.info({
                  message:
                    '🔇 [DIRECT] Отправка сообщения о возврате средств пропущена (режим тестирования)',
                  description: 'Skipping refund message (test mode)',
                  telegram_id,
                  refundAmount,
                })
              }
            } catch (sendError) {
              logger.error({
                message: '❌ [DIRECT] Ошибка при отправке сообщения о возврате',
                description: 'Error sending refund message (direct)',
                error:
                  sendError instanceof Error
                    ? sendError.message
                    : 'Unknown error',
                telegram_id,
              })
            }
          } else {
            logger.error({
              message: '❌ [DIRECT] Ошибка при возврате средств',
              description: 'Error processing refund (direct)',
              error: refundResult.error,
              telegram_id,
              refundAmount,
            })
          }
        } catch (refundError) {
          logger.error({
            message: '❌ [DIRECT] Критическая ошибка при возврате средств',
            description: 'Critical error during refund processing (direct)',
            error:
              refundError instanceof Error
                ? refundError.message
                : 'Unknown error',
            telegram_id,
          })
        }
      }
    }

    logger.info({
      message: '🎉 [DIRECT] Все задачи на генерацию успешно выполнены',
      description: 'All generation tasks successfully completed (direct)',
      urlsCount: generatedUrls.length,
      urls: generatedUrls,
      telegram_id,
    })

    // Проверка корректности сохраненных URL перед возвратом
    const validUrls = generatedUrls.filter(
      url => typeof url === 'string' && url.startsWith('http')
    )

    logger.info({
      message: '🔄 [DIRECT] Подготовка результатов генерации',
      description: 'Preparing generation results',
      all_urls_count: generatedUrls.length,
      valid_urls_count: validUrls.length,
      urls: validUrls,
    })

    if (validUrls.length === 0) {
      logger.warn({
        message: '⚠️ [DIRECT] Нет валидных URL в результатах генерации',
        description: 'No valid URLs in generation results',
        generatedUrls: generatedUrls,
      })
    }

    // Возвращаем результат с правильным объектом
    logger.info({
      message: '🏁 [DIRECT] Завершение функции generateNeuroPhotoDirect',
      description: 'Completing generateNeuroPhotoDirect function',
      success: true,
      url_count: generatedUrls.length,
      telegram_id,
    })

    // Если API не вернул URL изображений, возвращаем ошибку
    if (generatedUrls.length === 0) {
      logger.error({
        message: '❌ [DIRECT] API не вернул URL изображений',
        description: 'API returned success but no image URLs',
        telegram_id,
      })

      return {
        data: 'API returned no images',
        success: false,
      }
    }

    return {
      data: 'Processing completed',
      success: true,
      urls: generatedUrls,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined

    logger.error({
      message: '❌ [DIRECT] Критическая ошибка при прямой генерации нейрофото',
      description: 'Critical error during direct neurophoto generation',
      error: errorMessage,
      stack: errorStack,
      telegram_id,
      session_data: JSON.stringify(ctx.session || {}),
    })

    console.error(
      `❌ [DIRECT] Критическая ошибка при прямой генерации нейрофото: ${errorMessage}`
    )
    console.error(`📚 [DIRECT] Стек ошибки:`)
    console.error(errorStack)
    console.error(
      `📊 [DIRECT] Данные сессии: ${JSON.stringify(ctx.session || {})}`
    )

    // Отправляем пользователю сообщение об ошибке
    try {
      if (
        ctx.reply &&
        typeof ctx.reply === 'function' &&
        !options?.disable_telegram_sending
      ) {
        const errorMessageRu =
          'Извините, произошла ошибка при генерации изображения. Мы уже работаем над её устранением.'
        const errorMessageEn =
          'Sorry, an error occurred while generating the image. We are already working on fixing it.'

        await ctx.reply(isRussian(ctx) ? errorMessageRu : errorMessageEn)
      } else if (options?.disable_telegram_sending) {
        logger.info({
          message:
            '🔇 [DIRECT] Отправка сообщения о критической ошибке пропущена (режим тестирования)',
          description: 'Skipping critical error message (test mode)',
          telegram_id,
          errorMessage,
        })
      }
    } catch (replyError) {
      logger.error({
        message: '❌ [DIRECT] Не удалось отправить сообщение об ошибке',
        description: 'Failed to send error message (direct)',
        error:
          replyError instanceof Error ? replyError.message : 'Unknown error',
        telegram_id,
      })
    }

    return null
  }
}
