import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
  savePromptDirect,
} from '@/core/supabase'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { directPaymentProcessor } from '@/core/supabase/directPayment'
import { PaymentType } from '@/interfaces/payments.interface'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import fs from 'fs'
import { sendMediaToPulse, MediaPulseOptions } from '@/helpers/pulse'
import { getAspectRatio } from '@/core/supabase/ai'
import { DEFAULT_ASPECT_RATIO } from '@/config/aspectRatio'
import { randomUUID as uuidv4 } from 'node:crypto'
import crypto from 'crypto'
import { supabase } from '@/core/supabase'
import { generateNeuroPhotoViaKie } from './generateNeuroPhotoKie'

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
  },
  userModel?: any // ✅ Add userModel parameter for FAL support
): Promise<{ data: string; success: boolean; urls?: string[] } | null> {
  console.log('🔔 [DIRECT] ВХОД В generateNeuroPhotoDirect', {
    telegram_id,
    numImages,
    botName,
    explicitAspectRatio,
    disable_telegram_sending: options?.disable_telegram_sending,
  })
  logger.info({
    message: '🔔 [DIRECT] ВХОД В generateNeuroPhotoDirect',
    description: 'ENTERING generateNeuroPhotoDirect',
    telegram_id,
    numImages,
    botName,
    explicitAspectRatio,
    disable_telegram_sending: options?.disable_telegram_sending,
    promptSample: prompt.substring(0, 50) + '...',
  })
  // --- IDEMPOTENCY KEY ---
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${telegram_id}:${prompt}:${model_url}:${numImages}`)
    .digest('hex')
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
    logger.error('[IDEMPOTENCY] Ошибка поиска ключа', {
      idempotencyKey,
      idemError,
    })
  }
  if (idemRows && idemRows.length > 0) {
    const row = idemRows[0]
    if (row.result) {
      logger.info('[IDEMPOTENCY] Найден результат, возвращаю сохранённый', {
        idempotencyKey,
      })
      // ❌ ПРОБЛЕМА: Возвращаем закэшированный результат, но изображение НЕ отправляется!
      // ✅ РЕШЕНИЕ: Для повторных генераций нужно генерировать новое изображение
      // Временно отключаем кэш для повторных генераций
      // return row.result
    }
    logger.info('[IDEMPOTENCY] Операция уже выполняется, возвращаю статус', {
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

  logger.info('🚀 [DIRECT] Начало прямой генерации Neurophoto V1', {
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
      logger.error('❌ [DIRECT] Отсутствует промпт для генерации', {
        description: 'No prompt found for direct generation',
        telegram_id,
      })
      throw new Error('Prompt not found')
    }

    // model_url is legacy routing metadata now: generation itself goes
    // through kie.ai, which takes no model URL. It is still validated here
    // because the payment idempotency key and the pulse report below read it.
    // A userModel trained on fal (`userModel.api === 'fal'`) used to swap in
    // LoRA weights; kie.ai has no LoRA path, so the personalization is gone
    // with the provider and the log says so instead of pretending.
    if (!model_url) {
      logger.error('❌ [DIRECT] Отсутствует URL модели для генерации', {
        description: 'No model URL found for direct generation',
        telegram_id,
        userModel: userModel
          ? { api: userModel.api, model_name: userModel.model_name }
          : 'not provided',
      })
      throw new Error('Model URL not found')
    }

    if (userModel?.api === 'fal') {
      logger.info(
        '🎭 [DIRECT] FAL LoRA больше не поддерживается — генерация через Kie без персонализации',
        {
          telegram_id,
          model_name: userModel.model_name,
          note: 'kie.ai has no LoRA path; the fal account is closed',
        }
      )
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

    // ✅ ИСПРАВЛЕНИЕ: Используем ctx.telegram напрямую вместо getBotByName
    // Это более надежно и не зависит от регистрации ботов в глобальной коллекции
    logger.info('🤖 [DIRECT] Используем ctx.telegram для отправки сообщений', {
      description: 'Using ctx.telegram directly',
      botName,
    })

    const bot = ctx.telegram
    logger.info('✅ [DIRECT] Экземпляр бота получен', {
      description: 'Bot instance retrieved',
      botName,
      botInstanceExists: !!bot,
    })

    // Проверяем существование пользователя
    logger.info('👤 [DIRECT] Проверка существования пользователя', {
      description: 'Checking if user exists in database (direct)',
      telegram_id,
    })

    const user = await getUserByTelegramId(ctx)

    if (!user) {
      logger.error('❌ [DIRECT] Пользователь не найден в базе данных', {
        description: 'User not found in database (direct)',
        telegram_id,
      })
      console.error(
        `❌ [DIRECT] Пользователь с ID ${telegram_id} не найден в базе данных`
      )

      try {
        await bot.sendMessage(
          parseInt(telegram_id),
          is_ru
            ? '❌ Ваш аккаунт не найден в базе данных. Пожалуйста, запустите бота заново с помощью команды /start'
            : '❌ Your account was not found in our database. Please restart the bot using the /start command'
        )
      } catch (sendError) {
        logger.error(
          '❌ [DIRECT] Не удалось отправить сообщение об ошибке пользователю',
          {
            description: 'Failed to send error message to user (direct)',
            error:
              sendError instanceof Error ? sendError.message : 'Unknown error',
            telegram_id,
          }
        )
      }

      throw new Error(`User with ID ${telegram_id} not found in database`)
    }

    logger.info('✅ [DIRECT] Пользователь найден в базе данных', {
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
    logger.info('💰 [DIRECT] Расчет стоимости генерации', {
      description: 'Calculating generation cost (direct)',
      num_images: validNumImages,
      mode: ModeEnum.NeuroPhoto,
    })

    // ✅ ИСПРАВЛЕНИЕ ЦЕНООБРАЗОВАНИЯ: Рассчитываем стоимость ЗА ОДНО изображение
    // ВАЖНО: Всегда передаем numImages: 1, чтобы получить цену за 1 изображение!
    // Затем умножаем на validNumImages для получения общей стоимости
    const costResult = calculateModeCost({
      mode: ModeEnum.NeuroPhoto,
      numImages: 1, // ← ВСЕГДА 1! Это стоимость ЗА ОДНО изображение
    })
    const costPerImage = Number(costResult.stars) // 7.5⭐ за 1 изображение
    const totalCost = costPerImage * validNumImages // 7.5⭐ × количество изображений

    logger.info('💸 [DIRECT] Рассчитана стоимость генерации', {
      description: 'Generation cost calculated (direct)',
      costPerImage,
      totalCost,
      num_images: validNumImages,
    })

    // Обработка оплаты напрямую через directPaymentProcessor
    logger.info('💳 [DIRECT] Обработка оплаты', {
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
      // Trust ONLY the explicit per-call option. ctx.session.bypass_payment_check
      // is set by the AvatarTransform lead magnet (avatarTransformScene:1115) and
      // never cleared on cancel; OR-ing it in here let a stale flag skip the
      // balance check on a normal paid NeuroPhoto run (Plan B) = free generation.
      // Every caller passes bypass explicitly via options; the legitimate
      // AvatarTransform free path is honored (and the flag cleared) in
      // processBalanceOperation, not on this direct-charge path. #1335
      bypass_payment_check: options?.bypass_payment_check ?? false,
      metadata: {
        prompt: prompt.substring(0, 100),
        num_images: validNumImages,
        model_url,
      },
    })

    if (!paymentResult.success) {
      logger.error('❌ [DIRECT] Ошибка при обработке платежа', {
        description: 'Payment processing error (direct)',
        error: paymentResult.error,
        telegram_id,
      })
      console.error(
        `❌ [DIRECT] Ошибка при обработке платежа: ${paymentResult.error}`
      )

      // Добавляем проверку disable_telegram_sending
      if (!options?.disable_telegram_sending) {
        await bot.sendMessage(
          parseInt(telegram_id),
          is_ru
            ? '❌ Не удалось обработать платеж. Пожалуйста, проверьте баланс и попробуйте еще раз.'
            : '❌ Failed to process payment. Please check your balance and try again.'
        )
      } else {
        logger.info(
          '🔇 [DIRECT] Отправка сообщения об ошибке платежа пропущена (режим тестирования)',
          {
            description: 'Skipping payment error message (test mode)',
            telegram_id,
          }
        )
      }

      return {
        data: 'Payment failed',
        success: false,
      }
    }

    // Получаем соотношение сторон для изображения
    logger.info('📐 [DIRECT] Получение соотношения сторон', {
      description: 'Getting aspect ratio',
      telegram_id,
      user_id: user.id,
    })

    let finalAspectRatio: string | null = null
    if (explicitAspectRatio) {
      finalAspectRatio = explicitAspectRatio
      logger.info(
        `🧙‍♂️ [DIRECT] Используется явный aspectRatio: ${finalAspectRatio}`,
        {
          telegram_id,
        }
      )
    } else {
      const numericTelegramId = parseInt(telegram_id, 10)
      const dbAspectRatio = await getAspectRatio(numericTelegramId)
      if (
        dbAspectRatio &&
        typeof dbAspectRatio === 'string' &&
        dbAspectRatio.includes(':')
      ) {
        finalAspectRatio = dbAspectRatio
        logger.info(
          `🧙‍♂️ [DIRECT] Используется aspectRatio из БД: ${finalAspectRatio}`,
          {
            telegram_id,
          }
        )
      } else {
        logger.warn(
          '[DIRECT] aspectRatio from DB unusable, using the default',
          {
            original_value: dbAspectRatio,
            default_value: DEFAULT_ASPECT_RATIO,
            telegram_id,
          }
        )
        finalAspectRatio = DEFAULT_ASPECT_RATIO
      }
    }

    logger.info('📐 [DIRECT] Итоговое соотношение сторон определено', {
      aspect_ratio: finalAspectRatio,
      telegram_id,
    })

    // Генерируем изображения
    const generatedUrls = []

    console.log('🔄 [DIRECT] НАЧАЛО ЦИКЛА ГЕНЕРАЦИИ ИЗОБРАЖЕНИЙ', {
      telegram_id,
      validNumImages,
    })
    logger.info({
      message: '🔄 [DIRECT] НАЧАЛО ЦИКЛА ГЕНЕРАЦИИ ИЗОБРАЖЕНИЙ',
      description: 'STARTING IMAGE GENERATION LOOP',
      telegram_id,
      validNumImages,
      totalIterations: validNumImages,
    })

    for (let i = 0; i < validNumImages; i++) {
      logger.info({
        message: '🔄 [DIRECT] ИТЕРАЦИЯ ЦИКЛА ГЕНЕРАЦИИ',
        description: 'LOOP ITERATION',
        telegram_id,
        iteration: i,
        totalIterations: validNumImages,
        promptSample: prompt ? prompt.substring(0, 70) + '...' : 'null',
      })

      try {
        // Отправляем сообщение о начале генерации для каждого изображения
        if (!options?.disable_telegram_sending) {
          if (validNumImages > 1) {
            try {
              await bot.sendMessage(
                parseInt(telegram_id),
                is_ru
                  ? `⏳ Генерация изображения ${i + 1} из ${validNumImages}`
                  : `⏳ Generating image ${i + 1} of ${validNumImages}`
              )
            } catch (sendError) {
              logger.error(
                '❌ [DIRECT] Ошибка при отправке сообщения о генерации',
                {
                  description: 'Error sending generation message (direct)',
                  error:
                    sendError instanceof Error
                      ? sendError.message
                      : 'Unknown error',
                  telegram_id,
                }
              )
              // Продолжаем выполнение даже при ошибке отправки сообщения
            }
          } else {
            try {
              await bot.sendMessage(
                parseInt(telegram_id),
                is_ru ? '⏳ Генерация...' : '⏳ Generating...',
                {
                  reply_markup: { remove_keyboard: true },
                }
              )
            } catch (sendError) {
              logger.error(
                '❌ [DIRECT] Ошибка при отправке сообщения о генерации',
                {
                  description: 'Error sending generation message (direct)',
                  error:
                    sendError instanceof Error
                      ? sendError.message
                      : 'Unknown error',
                  telegram_id,
                }
              )
            }
          }
        } else {
          logger.info(
            '🔇 [DIRECT] Отправка статусного сообщения пропущена (режим тестирования)',
            {
              description: 'Skipping status message (test mode)',
              telegram_id,
              image_index: i,
            }
          )
        }

        logger.info('🎨 [DIRECT] Запускаем прямую генерацию изображения', {
          description: 'Starting direct image generation',
          telegram_id,
          prompt: prompt.substring(0, 50) + '...',
          model_url,
          iteration: i,
        })

        // One provider: kie.ai (owner's rule, 2026-10-02). The fal->Replicate
        // chain this replaces was two dead accounts routing to each other:
        // fal balance 0.0, Replicate 402 "account disabled" -- every request
        // fell through Plan A, failed on fal, fell back to Replicate and
        // failed again, both after the user had been charged. No fallback
        // exists behind Kie, so a throw here goes to the catch below, which
        // refunds.
        const imageUrl = await generateNeuroPhotoViaKie(
          prompt,
          finalAspectRatio!
        )

        // Проверка на валидность URL
        if (!imageUrl || !imageUrl.startsWith('http')) {
          logger.error('❌ [DIRECT] Некорректный URL изображения', {
            description: 'Invalid image URL returned from API',
            url: imageUrl,
            provider: 'kie.ai',
          })
          throw new Error('Invalid image URL from API')
        }

        // Сохраняем изображение локально для создания постоянной ссылки
        let localImageUrl = imageUrl
        try {
          // Save the file locally, isolated in its OWN try/catch: a local-save
          // failure (CDN 404 / disk full / timeout) must NOT skip the delivery
          // block below and leave the user charged with no photo. The served
          // reference is the REMOTE imageUrl anyway (localImageUrl defaults to it),
          // so on failure we simply deliver that. Fixes the saveError-swallow gap.
          let savedLocalPath: string | null = null
          try {
            savedLocalPath = await saveFileLocally(
              telegram_id,
              imageUrl,
              'neuro-photo-direct',
              '.jpg'
            )
          } catch (localSaveError) {
            logger.warn(
              '⚠️ [DIRECT] Local save failed; continuing to deliver the remote URL',
              {
                telegram_id,
                error:
                  localSaveError instanceof Error
                    ? localSaveError.message
                    : String(localSaveError),
              }
            )
          }

          // Формируем URL для доступа к сохраненному файлу
          if (savedLocalPath) {
            // Используем оригинальный URL + путь для доступа к изображению
            localImageUrl = imageUrl

            logger.info('✅ [DIRECT] Изображение успешно сохранено локально', {
              description: 'Image successfully saved locally',
              localImageUrl,
              savedLocalPath,
              telegram_id,
            })

            // The local copy is a true orphan here: the served reference and the
            // pulse media both use the REMOTE imageUrl, and this path is never
            // turned into a /uploads URL. Remove it per loop iteration so we do
            // not orphan one .jpg per generated image on the long-running
            // process. Balance-neutral (the file is not delivered).
            try {
              fs.unlinkSync(savedLocalPath)
            } catch {
              /* already gone or never created */
            }
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
              aspect_ratio: finalAspectRatio || DEFAULT_ASPECT_RATIO,
              original_url: imageUrl.substring(0, 50) + '...',
            },
          }

          // ---> ЛОГ ПЕРЕД ВЫЗОВОМ
          logger.info(
            '🚦 [DIRECT] Параметры перед отправкой в sendMediaToPulse',
            {
              description: 'Options before calling sendMediaToPulse',
              pulseOptions,
              telegram_id,
            }
          )
          // <--- КОНЕЦ ЛОГА

          await sendMediaToPulse(pulseOptions)

          logger.info('📊 [DIRECT] Изображение отправлено в Pulse', {
            description: 'Image sent to Pulse analytics',
            telegram_id,
          })

          // СОХРАНЯЕМ URL последнего нейрофото в сессии для upscaler'а
          // Это должно происходить ВСЕГДА после успешной генерации, независимо от отправки
          if (ctx.session) {
            ctx.session.lastNeuroPhotoImageUrl = imageUrl
            ctx.session.lastNeuroPhotoPrompt = prompt

            logger.info(
              '💾 [DIRECT] URL нейрофото сохранен в сессии для upscaler',
              {
                description: 'Neurophoto URL saved in session for upscaler',
                telegram_id,
                savedUrl: imageUrl.substring(0, 50) + '...',
                savedPrompt: prompt.substring(0, 50) + '...',
              }
            )
          }

          // ОТПРАВЛЯЕМ ИЗОБРАЖЕНИЕ ПОЛЬЗОВАТЕЛЮ В ЛИЧНЫЕ СООБЩЕНИЯ
          console.log('🚀 [DIRECT] ДОСТИГНУТ БЛОК ОТПРАВКИ ИЗОБРАЖЕНИЯ', {
            telegram_id,
            iteration: i,
            imageUrl: imageUrl.substring(0, 50) + '...',
            disable_telegram_sending: options?.disable_telegram_sending,
          })
          logger.info({
            message: '🚀 [DIRECT] ДОСТИГНУТ БЛОК ОТПРАВКИ ИЗОБРАЖЕНИЯ',
            description: 'REACHED IMAGE SENDING BLOCK',
            telegram_id,
            iteration: i,
            imageUrl: imageUrl.substring(0, 50) + '...',
            disable_telegram_sending: options?.disable_telegram_sending,
          })

          try {
            logger.info({
              message: '🔍 [DIRECT] Проверка перед отправкой изображения',
              description: 'Checking before sending image',
              telegram_id,
              disable_telegram_sending: options?.disable_telegram_sending,
              imageUrl: imageUrl.substring(0, 50) + '...',
            })

            if (!options?.disable_telegram_sending) {
              logger.info({
                message:
                  '✅ [DIRECT] Отправка изображения разрешена, начинаем отправку',
                description: 'Image sending allowed, starting send',
                telegram_id,
                imageUrl: imageUrl.substring(0, 50) + '...',
              })
              // The model that actually did the work: kie.ai nano-banana.
              // model_url stays in Model ID as the user's legacy model
              // identifier but no longer drives generation.
              const modelDisplay = 'Nano Banana 🍌 (kie.ai)'

              // Рассчитываем размеры изображения
              let dimensions = '1024×1024'
              if (finalAspectRatio) {
                const [w, h] = finalAspectRatio.split(':').map(Number)
                if (w && h) {
                  if (w === h) {
                    dimensions = '1024×1024 (1:1)'
                  } else if (w > h) {
                    const width = 1024
                    const height = Math.round(1024 * (h / w))
                    dimensions = `${width}×${height} (${w}:${h})`
                  } else {
                    const height = 1365
                    const width = Math.round(1365 * (w / h))
                    dimensions = `${width}×${height} (${w}:${h})`
                  }
                }
              }

              // Generation time (kie.ai Jobs API: seconds up to ~a minute)
              const avgTime = '15-60'

              // Формируем красивый caption в стиле Midjourney/DALL-E
              const imageNumber = i + 1
              const caption = is_ru
                ? `✨ <b>Изображение создано!</b>

━━━━━━━━━━━━━━━━━━━━
🎨 <b>Детали генерации</b>
├ 🤖 Модель: <b>${modelDisplay}</b>
├ 📐 Размер: <b>${dimensions}</b>
├ ⏱ Время: ~<b>${avgTime}с</b>
└ 💰 Стоимость: <b>${costPerImage} ⭐</b>

━━━━━━━━━━━━━━━━━━━━
🔍 <b>Техническая информация</b>
Model ID: <code>kie.ai/google/nano-banana</code>
User model: <code>${model_url}</code>
Изображение: ${imageNumber}/${validNumImages}
Сгенерировано: ${new Date().toLocaleString('ru-RU')}

<i>Создано с помощью AI • @999-agents</i>`
                : `✨ <b>Image created!</b>

━━━━━━━━━━━━━━━━━━━━
🎨 <b>Generation Details</b>
├ 🤖 Model: <b>${modelDisplay}</b>
├ 📐 Size: <b>${dimensions}</b>
├ ⏱ Time: ~<b>${avgTime}s</b>
└ 💰 Cost: <b>${costPerImage} ⭐</b>

━━━━━━━━━━━━━━━━━━━━
🔍 <b>Technical Information</b>
Model ID: <code>kie.ai/google/nano-banana</code>
User model: <code>${model_url}</code>
Image: ${imageNumber}/${validNumImages}
Generated: ${new Date().toLocaleString('en-US')}

<i>Created with AI • @999-agents</i>`

              // Отправляем фото С красивым caption
              await ctx.telegram.sendPhoto(
                telegram_id,
                { url: imageUrl },
                {
                  caption,
                  parse_mode: 'HTML',
                }
              )

              logger.info('📸 [DIRECT] Изображение отправлено пользователю', {
                description: 'Image sent to user in private messages',
                telegram_id,
                imageUrl: imageUrl.substring(0, 50) + '...',
              })
            } else {
              logger.info(
                '🔇 [DIRECT] Отправка изображения пользователю пропущена (режим тестирования)',
                {
                  description: 'Skipping image sending to user (test mode)',
                  telegram_id,
                }
              )
            }
          } catch (sendUserError) {
            logger.error(
              '❌ [DIRECT] Ошибка при отправке изображения пользователю',
              {
                description: 'Error sending image to user',
                error:
                  sendUserError instanceof Error
                    ? sendUserError.message
                    : 'Unknown error',
                telegram_id,
                imageUrl: imageUrl.substring(0, 50) + '...',
              }
            )

            // The user was charged up front (MONEY_OUTCOME above). Delivery just
            // failed, and this catch swallows the error, so it never reaches the
            // generation-failure refund below — without this the user paid for an
            // image they never received. Refund this one image, like the sibling
            // generators do by rethrowing. A refund only ever returns money.
            try {
              const refundResult = await directPaymentProcessor({
                telegram_id,
                amount: costPerImage,
                type: PaymentType.REFUND,
                description: is_ru
                  ? 'Возврат за недоставленное изображение (ошибка отправки)'
                  : 'Refund for an image that could not be delivered',
                bot_name: botName,
                service_type: ModeEnum.NeuroPhoto,
              })
              if (!refundResult?.success) {
                logger.error(
                  '❌ [DIRECT] Возврат за недоставленное изображение не прошёл',
                  { telegram_id, refundResult }
                )
              }
            } catch (refundError) {
              logger.error(
                '❌ [DIRECT] Ошибка возврата за недоставленное изображение',
                {
                  telegram_id,
                  error:
                    refundError instanceof Error
                      ? refundError.message
                      : 'Unknown error',
                }
              )
            }
          }

          // Сохраняем промпт в базу данных для аналитики и истории
          // ✅ ИСПРАВЛЕНИЕ: Передаем правильный model_type ('fal' или 'replicate'), а не model_url!
          await savePromptDirect(
            prompt,
            'kie', // Generation provider (kie-only, 2026-10-02)
            ModeEnum.NeuroPhoto,
            imageUrl,
            telegram_id.toString(),
            'success'
          )

          logger.info('📝 [DIRECT] Промпт сохранен в базе данных', {
            description: 'Prompt saved to database',
            telegram_id,
          })
        } catch (saveError) {
          // При ошибке сохранения локально продолжаем с оригинальным URL
          logger.error(
            '⚠️ [DIRECT] Ошибка при сохранении изображения локально',
            {
              description: 'Error saving image locally',
              error:
                saveError instanceof Error
                  ? saveError.message
                  : 'Unknown error',
              originalUrl: imageUrl.substring(0, 50) + '...',
              telegram_id,
            }
          )
          // Продолжаем с оригинальным URL, не прерываем процесс
        }

        // Добавляем URL в массив результатов
        generatedUrls.push(localImageUrl)

        // --- ЛОГ: Состояние массива URL ---
        logger.info('📝 [DIRECT] URL добавлен в массив', {
          telegram_id,
          iteration: i,
          current_url: localImageUrl.substring(0, 50) + '...',
          all_urls_so_far: generatedUrls.map(u => u.substring(u.length - 10)),
          all_urls_count: generatedUrls.length,
        })
        // ---

        logger.info('📸 [DIRECT] Изображение успешно получено', {
          description: 'Image URL obtained and added to results',
          imageUrl: localImageUrl.substring(0, 50) + '...',
          generatedUrls_count: generatedUrls.length,
          imageUrl_index: generatedUrls.indexOf(localImageUrl),
        })
      } catch (genError) {
        logger.error('❌ [DIRECT] Ошибка при генерации изображения', {
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
            await bot.sendMessage(
              parseInt(telegram_id),
              is_ru
                ? '❌ Произошла ошибка при генерации изображения. Мы вернем вам потраченные звезды в ближайшее время.'
                : '❌ An error occurred while generating the image. We will refund your stars soon.'
            )
          } else {
            logger.info(
              '🔇 [DIRECT] Отправка сообщения об ошибке генерации пропущена (режим тестирования)',
              {
                description: 'Skipping generation error message (test mode)',
                telegram_id,
              }
            )
          }
        } catch (sendError) {
          logger.error('❌ [DIRECT] Ошибка при отправке сообщения об ошибке', {
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
            logger.info(
              '💰 [DIRECT] Выполнен возврат средств за неудачную генерацию',
              {
                description: 'Refund processed for failed generation (direct)',
                refundAmount,
                telegram_id,
                refundResult,
              }
            )

            try {
              if (!options?.disable_telegram_sending) {
                await bot.sendMessage(
                  parseInt(telegram_id),
                  is_ru
                    ? `💰 Мы вернули вам ${refundAmount} звезд за неудачную генерацию изображения.`
                    : `💰 We have refunded you ${refundAmount} stars for the failed image generation.`
                )
              } else {
                logger.info(
                  '🔇 [DIRECT] Отправка сообщения о возврате средств пропущена (режим тестирования)',
                  {
                    description: 'Skipping refund message (test mode)',
                    telegram_id,
                    refundAmount,
                  }
                )
              }
            } catch (sendError) {
              logger.error(
                '❌ [DIRECT] Ошибка при отправке сообщения о возврате',
                {
                  description: 'Error sending refund message (direct)',
                  error:
                    sendError instanceof Error
                      ? sendError.message
                      : 'Unknown error',
                  telegram_id,
                }
              )
            }
          } else {
            logger.error('❌ [DIRECT] Ошибка при возврате средств', {
              description: 'Error processing refund (direct)',
              error: refundResult.error,
              telegram_id,
              refundAmount,
            })
          }
        } catch (refundError) {
          logger.error('❌ [DIRECT] Критическая ошибка при возврате средств', {
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

    // ИСПРАВЛЕНО: Отправляем итоговое сообщение с клавиатурой (как в AI сервере)
    if (generatedUrls.length > 0 && !options?.disable_telegram_sending) {
      try {
        const exactCostPerImage = costPerImage
        const totalCost = exactCostPerImage * generatedUrls.length
        const finalMessage = is_ru
          ? `✅ Готово! Успешно сгенерировано ${generatedUrls.length} из ${validNumImages} изображений.\nСписано: ${totalCost.toFixed(2)} ⭐️`
          : `✅ Done! Successfully generated ${generatedUrls.length} out of ${validNumImages} images.\nDeducted: ${totalCost.toFixed(2)} ⭐️`

        // 🚨 ИСПРАВЛЕНИЕ: Отправляем БЕЗ inline кнопок (wizard добавит reply keyboard)
        await bot.sendMessage(parseInt(telegram_id), finalMessage)

        logger.info('✅ [DIRECT] Итоговое сообщение отправлено (без кнопок)', {
          telegram_id,
          totalImages: generatedUrls.length,
          totalCost,
        })
      } catch (sendError) {
        logger.error('❌ [DIRECT] Ошибка при отправке итогового сообщения', {
          telegram_id,
          error: sendError,
        })
      }
    }

    logger.info('🎉 [DIRECT] Все задачи на генерацию успешно выполнены', {
      description: 'All generation tasks successfully completed (direct)',
      urlsCount: generatedUrls.length,
      urls: generatedUrls,
      telegram_id,
    })

    // Проверка корректности сохраненных URL перед возвратом
    const validUrls = generatedUrls.filter(
      url => typeof url === 'string' && url.startsWith('http')
    )

    logger.info('🔄 [DIRECT] Подготовка результатов генерации', {
      description: 'Preparing generation results',
      all_urls_count: generatedUrls.length,
      valid_urls_count: validUrls.length,
      urls: validUrls,
    })

    if (validUrls.length === 0) {
      logger.warn('⚠️ [DIRECT] Нет валидных URL в результатах генерации', {
        description: 'No valid URLs in generation results',
        generatedUrls: generatedUrls,
      })
    }

    // Возвращаем результат с правильным объектом
    logger.info('🏁 [DIRECT] Завершение функции generateNeuroPhotoDirect', {
      description: 'Completing generateNeuroPhotoDirect function',
      success: true,
      url_count: generatedUrls.length,
      telegram_id,
    })

    // Если API не вернул URL изображений, возвращаем ошибку
    if (generatedUrls.length === 0) {
      logger.error('❌ [DIRECT] API не вернул URL изображений', {
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

    return {
      data: 'Processing completed',
      success: true,
      urls: generatedUrls,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined

    logger.error(
      '❌ [DIRECT] Критическая ошибка при прямой генерации нейрофото',
      {
        description: 'Critical error during direct neurophoto generation',
        error: errorMessage,
        stack: errorStack,
        telegram_id,
        session_data: JSON.stringify(ctx.session || {}),
      }
    )

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
        logger.info(
          '🔇 [DIRECT] Отправка сообщения о критической ошибке пропущена (режим тестирования)',
          {
            description: 'Skipping critical error message (test mode)',
            telegram_id,
            errorMessage,
          }
        )
      }
    } catch (replyError) {
      logger.error('❌ [DIRECT] Не удалось отправить сообщение об ошибке', {
        description: 'Failed to send error message (direct)',
        error:
          replyError instanceof Error ? replyError.message : 'Unknown error',
        telegram_id,
      })
    }

    return null
  }
}

// 🚨 ФУНКЦИЯ УДАЛЕНА: Reply keyboard теперь создаётся в wizard'е
// Это предотвращает дублирование кнопок (inline над сообщением + reply внизу)
