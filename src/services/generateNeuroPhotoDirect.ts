import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
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
import crypto from 'crypto'
import { supabase } from '@/core/supabase'
import { Markup } from 'telegraf'

// --- Локальный кэш для идемпотентности ---
const idemCache = new Map<string, { result: any; expiresAt: number }>()
const IDEMPOTENCY_TTL_MS = 20 * 1000 // 20 секунд

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
 * @param explicitAspectRatio Явное соотношение сторон для изображения
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
  explicitAspectRatio?: string | null,
  options?: {
    disable_telegram_sending?: boolean
    bypass_payment_check?: boolean
  }
): Promise<{ data: string; success: boolean; urls?: string[] } | null> {
  // --- IDEMPOTENCY KEY ---
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${telegram_id}:${prompt}:${model_url}:${numImages}`)
    .digest('hex')
  const now = Date.now()
  const cacheEntry = idemCache.get(idempotencyKey)
  if (cacheEntry && cacheEntry.expiresAt > now) {
    logger.info({
      message: '[IDEMPOTENCY] Найден локальный результат',
      idempotencyKey,
    })
    return cacheEntry.result
  }
  // --- Проверка идемпотентности ---
  // Псевдокод: ищем в Supabase (таблица payments_v2 или idempotency_keys) запись с этим ключом и created_at > now() - TTL
  const { data: idemRows, error: idemError } = await supabase
    .from('idempotency_keys')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .gte(
      'created_at',
      new Date(Date.now() - IDEMPOTENCY_TTL_MS / 1000).toISOString()
    )
    .limit(1)
  if (idemError) {
    logger.error({
      message: '[IDEMPOTENCY] Ошибка поиска ключа',
      idempotencyKey,
      idemError,
    })
  }
  if (idemRows && idemRows.length > 0) {
    const row = idemRows[0]
    if (row.result) {
      logger.info({
        message: '[IDEMPOTENCY] Найден результат, возвращаю сохранённый',
        idempotencyKey,
      })
      idemCache.set(idempotencyKey, {
        result: row.result,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      })
      return row.result
    }
    logger.info({
      message: '[IDEMPOTENCY] Операция уже выполняется, возвращаю статус',
      idempotencyKey,
    })
    return { data: 'Processing', success: false }
  }
  // --- Сохраняем ключ как "в процессе" ---
  await supabase.from('idempotency_keys').insert({
    idempotency_key: idempotencyKey,
    created_at: new Date().toISOString(),
    status: 'processing',
    telegram_id,
    prompt,
    model_url,
    num_images: numImages,
    bot_name: botName,
  })
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
    const is_ru = isRussianFromState(ctx)
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

    let finalAspectRatio: string | null = null
    if (explicitAspectRatio) {
      finalAspectRatio = explicitAspectRatio
      logger.info({
        message: `🧙‍♂️ [DIRECT] Используется явный aspectRatio: ${finalAspectRatio}`,
        telegram_id,
      })
    } else {
      const numericTelegramId = parseInt(telegram_id, 10)
      const dbAspectRatio = await getAspectRatio(numericTelegramId)
      if (
        dbAspectRatio &&
        typeof dbAspectRatio === 'string' &&
        dbAspectRatio.includes(':')
      ) {
        finalAspectRatio = dbAspectRatio
        logger.info({
          message: `🧙‍♂️ [DIRECT] Используется aspectRatio из БД: ${finalAspectRatio}`,
          telegram_id,
        })
      } else {
        logger.warn({
          message: `⚠️ [DIRECT] Некорректное или отсутствующее значение aspectRatio из БД (${dbAspectRatio}), используется значение по умолчанию "1:1"`,
          original_value: dbAspectRatio,
          default_value: '1:1',
          telegram_id,
        })
        finalAspectRatio = '1:1' // Значение по умолчанию
      }
    }

    logger.info({
      message: '📐 [DIRECT] Итоговое соотношение сторон определено',
      aspect_ratio: finalAspectRatio,
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

        // Формируем input для Replicate API
        const replicateInput: any = {
          prompt: `${prompt}. Cinematic Lighting, realistic, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. Masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details, high quality, gorgeous, glamorous, 8K, super detail, gorgeous light and shadow, detailed decoration, detailed lines.`,
          negative_prompt:
            'nsfw, erotic, violence, bad anatomy, bad hands, deformed fingers, blurry, grainy, ugly, lowres',
          num_inference_steps: 40,
          output_format: 'jpg',
          guidance_scale: 3,
          output_quality: 80,
          num_outputs: 1,
        }

        if (finalAspectRatio) {
          replicateInput.aspect_ratio = finalAspectRatio
        }

        logger.info({
          message: '[DIAGNOSTIC] Перед вызовом replicate.run()',
          iteration: i,
          telegram_id,
        })

        const output = (await replicate.run(
          model_url as `${string}/${string}:${string}`,
          {
            input: replicateInput,
          }
        )) as ApiResponse
        logger.info({
          message: '[DIAGNOSTIC] Сразу после вызова replicate.run()',
          output_is_null: output === null,
          output_is_undefined: output === undefined,
          iteration: i,
          telegram_id,
        })
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
        })
        const imageUrl = await processApiResponse(output)
        logger.info({
          message: '[DIAGNOSTIC] Сразу после вызова processApiResponse()',
          imageUrl_is_null: imageUrl === null,
          imageUrl_is_undefined: imageUrl === undefined,
          iteration: i,
          telegram_id,
        })

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
            language: isRussianFromState(ctx) ? 'ru' : 'en',
            serviceType: ModeEnum.NeuroPhoto,
            prompt: prompt, // Передаем ПОЛНЫЙ промпт, без обрезки
            botName: botName,
            additionalInfo: {
              model_url: model_url,
              aspect_ratio: finalAspectRatio || '1:1',
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

          // СОХРАНЯЕМ URL последнего нейрофото в сессии для upscaler'а
          // Это должно происходить ВСЕГДА после успешной генерации, независимо от отправки
          if (ctx.session) {
            ctx.session.lastNeuroPhotoImageUrl = imageUrl
            ctx.session.lastNeuroPhotoPrompt = prompt
            
            logger.info({
              message: '💾 [DIRECT] URL нейрофото сохранен в сессии для upscaler',
              description: 'Neurophoto URL saved in session for upscaler',
              telegram_id,
              savedUrl: imageUrl.substring(0, 50) + '...',
              savedPrompt: prompt.substring(0, 50) + '...',
            })
          }

          // ОТПРАВЛЯЕМ ИЗОБРАЖЕНИЕ ПОЛЬЗОВАТЕЛЮ В ЛИЧНЫЕ СООБЩЕНИЯ
          try {
            if (!options?.disable_telegram_sending) {
              // Добавляем caption с информацией о нейрофото и кнопки
              const caption = is_ru
                ? `✨ Нейрофото сгенерировано!\n\n📝 Промпт: ${prompt.slice(
                    0,
                    100
                  )}${
                    prompt.length > 100 ? '...' : ''
                  }\n💎 Стоимость: ${costPerImage} ⭐`
                : `✨ Neurophoto generated!\n\n📝 Prompt: ${prompt.slice(
                    0,
                    100
                  )}${
                    prompt.length > 100 ? '...' : ''
                  }\n💎 Cost: ${costPerImage} ⭐`

              await bot.telegram.sendPhoto(
                telegram_id,
                { url: imageUrl },
                {
                  caption,
                  reply_markup:
                    createNeuroPhotoResultKeyboard(is_ru).reply_markup,
                }
              )

              logger.info({
                message: '📸 [DIRECT] Изображение отправлено пользователю',
                description: 'Image sent to user in private messages',
                telegram_id,
                imageUrl: imageUrl.substring(0, 50) + '...',
              })
            } else {
              logger.info({
                message:
                  '🔇 [DIRECT] Отправка изображения пользователю пропущена (режим тестирования)',
                description: 'Skipping image sending to user (test mode)',
                telegram_id,
              })
            }
          } catch (sendUserError) {
            logger.error({
              message:
                '❌ [DIRECT] Ошибка при отправке изображения пользователю',
              description: 'Error sending image to user',
              error:
                sendUserError instanceof Error
                  ? sendUserError.message
                  : 'Unknown error',
              telegram_id,
              imageUrl: imageUrl.substring(0, 50) + '...',
            })
          }

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

    // Сохраняем результат
    await supabase
      .from('idempotency_keys')
      .update({
        status: 'done',
        result: {
          data: 'Processing completed',
          success: true,
          urls: generatedUrls,
        },
      })
      .eq('idempotency_key', idempotencyKey)

    idemCache.set(idempotencyKey, {
      result: {
        data: 'Processing completed',
        success: true,
        urls: generatedUrls,
      },
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    })

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

        await ctx.reply(
          isRussianFromState(ctx) ? errorMessageRu : errorMessageEn
        )
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

// Создание клавиатуры для результатов нейрофотографий
const createNeuroPhotoResultKeyboard = (is_ru: boolean) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        is_ru ? '🆕 Новый промпт' : '🆕 New prompt',
        'new_neurophoto_prompt'
      ),
      Markup.button.callback(
        is_ru ? '📐 Изменить размер' : '📐 Change size',
        'change_size'
      ),
    ],
    [
      Markup.button.callback(
        is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt',
        'improve_prompt'
      ),
      Markup.button.callback(
        is_ru ? '⬆️ Увеличить качество' : '⬆️ Upscale Quality',
        'upscale_neurophoto_image'
      ),
    ],
    [
      Markup.button.callback(
        is_ru ? '🏠 Главное меню' : '🏠 Main menu',
        'go_main_menu'
      ),
    ],
  ])
}
