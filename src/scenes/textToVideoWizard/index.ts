import { Scenes, Markup } from 'telegraf'
import { MyContext, VideoModelKey } from '@/interfaces'
import { calculateFinalPrice } from '@/price/helpers'
import { generateTextToVideo } from '@/modules/videoGenerator/generateTextToVideo'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage, videoModelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { getUserBalance } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { sendMediaToPulse, MediaPulseOptions } from '@/helpers/pulse'
import { logger } from '@/utils/logger'

// Определяем тип ключа конфига локально
type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

// Асинхронная функция для обработки генерации видео в фоне
async function processVideoGeneration(
  ctx: MyContext,
  prompt: string,
  videoModelKey: VideoModelConfigKey,
  isRu: boolean
) {
  try {
    // Проверка наличия необходимой информации о пользователе и боте
    if (!ctx.from || !ctx.from.id || !ctx.botInfo || !ctx.chat?.id) {
      logger.error(
        '[processVideoGeneration] Critical user/bot/chat info missing.',
        { from: ctx.from, botInfo: ctx.botInfo, chatId: ctx.chat?.id }
      )
      // Попытка отправить сообщение об ошибке, если chat.id известен
      if (ctx.chat?.id) {
        await ctx.telegram.sendMessage(
          ctx.chat.id,
          isRu
            ? 'Произошла внутренняя ошибка (отсутствует информация для обработки вашего запроса).'
            : 'An internal error occurred (missing information to process your request).'
        )
      }
      return
    }
    const telegramId = ctx.from.id.toString()
    const username = ctx.from.username || 'unknown_user' // Предоставить значение по умолчанию, если username отсутствует
    const botName = ctx.botInfo.username

    const videoUrl = await generateTextToVideo(
      prompt,
      telegramId,
      username,
      isRu,
      botName,
      videoModelKey
    )

    if (videoUrl) {
      await ctx.telegram.sendVideo(ctx.chat.id, videoUrl)

      try {
        const modelTitle =
          VIDEO_MODELS_CONFIG[videoModelKey]?.title || videoModelKey
        const pulseOptions: MediaPulseOptions = {
          mediaType: 'video',
          mediaSource: videoUrl,
          telegramId: telegramId,
          username: username,
          language: isRu ? 'ru' : 'en',
          serviceType: ModeEnum.TextToVideo,
          prompt: prompt,
          botName: botName,
          additionalInfo: {
            model_used: modelTitle,
            original_url:
              videoUrl.substring(0, 100) + (videoUrl.length > 100 ? '...' : ''),
          },
        }
        await sendMediaToPulse(pulseOptions)
        logger.info('[processVideoGeneration] Pulse sent successfully.', {
          telegram_id: telegramId,
        })
      } catch (pulseError) {
        logger.error('[processVideoGeneration] Error sending pulse:', {
          telegram_id: telegramId,
          error: pulseError,
        })
      }

      // Добавляем логирование ПЕРЕД отправкой кнопок
      logger.info(
        '[processVideoGeneration] Attempting to send final message with buttons.',
        { telegram_id: telegramId, chat_id: ctx.chat.id }
      )

      const keyboard = Markup.keyboard([
        [
          isRu
            ? '✨ Создать еще (Текст в Видео)'
            : '✨ Create More (Text to Video)',
        ],
        [
          isRu
            ? '🖼 Выбрать другую модель (Видео)'
            : '🖼 Select Another Model (Video)',
        ],
        [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
      ]).resize()
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        isRu
          ? 'Ваше видео готово! Что дальше?'
          : 'Your video is ready! What next?',
        keyboard
      )

      // Добавляем логирование ПОСЛЕ отправки кнопок
      logger.info(
        '[processVideoGeneration] Successfully sent final message with buttons.',
        { telegram_id: telegramId }
      )
    } else {
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        isRu
          ? 'Не удалось сгенерировать видео. Попробуйте другой промпт или модель.'
          : 'Failed to generate video. Try a different prompt or model.'
      )
    }
  } catch (error) {
    logger.error(
      '[processVideoGeneration] Error during background video processing:',
      { error, telegram_id: ctx.from?.id }
    )
    try {
      if (ctx.chat?.id) {
        await ctx.telegram.sendMessage(
          ctx.chat.id,
          isRu
            ? 'Произошла ошибка во время генерации видео.'
            : 'An error occurred during video generation.'
        )
      } else {
        logger.error(
          '[processVideoGeneration] ctx.chat.id is undefined, cannot send error message to user.'
        )
      }
    } catch (e) {
      logger.error(
        '[processVideoGeneration] Failed to send error message to user after background processing error',
        e
      )
    }
  }
}

export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',
  // Шаг 0: Запрос выбора модели
  async ctx => {
    logger.info(`[TextToVideoWizard Step 0] Entered for user ${ctx.from?.id}`)
    const isRu = isRussian(ctx)

    // Сначала проверяем, не отменил ли пользователь или не запросил ли помощь
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave() // handleHelpCancel сам обработает выход или переход в helpScene
    }

    try {
      await ctx.reply(
        isRu ? 'Выберите модель для генерации:' : 'Choose generation model:',
        {
          reply_markup: videoModelKeyboard(isRu, 'text').reply_markup,
        }
      )
      return ctx.wizard.next()
    } catch (error: unknown) {
      logger.error('[TextToVideoWizard Step 0] Error:', { error })
      await sendGenericErrorMessage(
        ctx,
        isRu,
        error instanceof Error ? error : undefined
      )
      return ctx.scene.leave()
    }
  },

  // Шаг 1: Обработка выбора модели, проверка баланса, запрос промпта
  async ctx => {
    logger.info(`[TextToVideoWizard Step 1] Entered for user ${ctx.from?.id}`)
    const isRu = isRussian(ctx)

    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    const message = ctx.message as { text?: string }
    const selectedButtonText = message?.text?.trim()

    if (!selectedButtonText) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель кнопкой.'
          : 'Please select a model using the buttons.'
      )
      // Остаемся на этом же шаге, чтобы пользователь выбрал снова
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    let foundModelKey: VideoModelConfigKey | null = null
    for (const [key, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
      const finalPriceInStars = calculateFinalPrice(key)
      const expectedButtonText = `${config.title} (${finalPriceInStars} ⭐)`
      if (expectedButtonText === selectedButtonText) {
        foundModelKey = key as VideoModelConfigKey
        break
      }
    }

    if (!foundModelKey) {
      logger.warn(
        '[TextToVideoWizard Step 1] Could not map button text to model key:',
        { selectedButtonText, telegramId: ctx.from?.id }
      )
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель из предложенных кнопок.'
          : 'Please select a model using the provided buttons.',
        {
          reply_markup: videoModelKeyboard(isRu, 'text').reply_markup, // Показываем клавиатуру снова
        }
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    if (!ctx.from?.id || !ctx.botInfo?.username) {
      logger.error(
        '[TextToVideoWizard Step 1] Critical user or bot info missing',
        { from: ctx.from, botInfo: ctx.botInfo }
      )
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id.toString()
    const bot_name = ctx.botInfo.username
    const cost = calculateFinalPrice(foundModelKey)

    if (cost === null) {
      logger.error(
        '[TextToVideoWizard Step 1] Could not calculate price for model key:',
        { foundModelKey, telegramId: ctx.from?.id }
      )
      await sendGenericErrorMessage(ctx, isRu)
      await ctx.reply(isRu ? 'Выберите модель:' : 'Select a model:', {
        reply_markup: videoModelKeyboard(isRu, 'text').reply_markup,
      })
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    const currentBalance = await getUserBalance(telegram_id, bot_name)
    if (currentBalance < cost) {
      logger.info(
        `[TextToVideoWizard Step 1] Insufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs: ${cost}`
      )
      await ctx.reply(
        isRu
          ? `😕 Недостаточно звезд для генерации (${cost}). Ваш баланс: ${currentBalance} ★. Пожалуйста, выберите другую модель или пополните баланс.`
          : `😕 Insufficient stars for generation (${cost}). Your balance: ${currentBalance} ★. Please select another model or top up your balance.`,
        {
          reply_markup: videoModelKeyboard(isRu, 'text').reply_markup,
        }
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    logger.info(
      `[TextToVideoWizard Step 1] Sufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs: ${cost}. Proceeding.`
    )
    ctx.session.videoModel = foundModelKey
    await ctx.reply(
      isRu
        ? 'Пожалуйста, отправьте текстовое описание для видео:'
        : 'Please send a text description for the video:',
      Markup.removeKeyboard() // Убираем клавиатуру выбора модели
    )
    return ctx.wizard.next()
  },

  // Шаг 2: Обработка промпта и запуск генерации
  async ctx => {
    logger.info(`[TextToVideoWizard Step 2] Entered for user ${ctx.from?.id}`)
    const isRu = isRussian(ctx)

    // Проверяем, не является ли сам текст промпта командой отмены или помощи
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    const message = ctx.message
    if (message && 'text' in message) {
      const prompt = message.text.trim()

      if (!prompt) {
        await ctx.reply(
          isRu
            ? 'Промпт не может быть пустым. Пожалуйста, введите описание.'
            : 'Prompt cannot be empty. Please enter a description.'
        )
        return ctx.wizard.selectStep(ctx.wizard.cursor) // Остаемся на этом шаге для повторного ввода
      }

      const videoModelKey = ctx.session.videoModel as
        | VideoModelConfigKey
        | undefined
      if (!videoModelKey) {
        logger.error(
          '[TextToVideoWizard Step 2] Video model key not found in session',
          { telegramId: ctx.from?.id }
        )
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      if (!ctx.from?.id || !ctx.botInfo?.username) {
        logger.error(
          '[TextToVideoWizard Step 2] Critical user or bot info missing for generation',
          { from: ctx.from, botInfo: ctx.botInfo }
        )
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      const textStart = isRu
        ? '⏳ Запрос принят! Начинаю генерацию видео... Это может занять некоторое время. О результате сообщу отдельно.'
        : '⏳ Request accepted! Starting video generation... This might take a while. I will notify you separately about the result.'

      await ctx.reply(textStart, Markup.removeKeyboard())

      processVideoGeneration(ctx, prompt, videoModelKey, isRu)
        .then(() => {
          logger.info(
            `[TextToVideoWizard Step 2] Async video processing initiated for ${ctx.from?.id}`
          )
        })
        .catch(async error => {
          logger.error(
            `[TextToVideoWizard Step 2] Critical error initiating async video processing for ${ctx.from?.id}:`,
            { error }
          )
          try {
            if (ctx.chat?.id) {
              await ctx.telegram.sendMessage(
                ctx.chat.id,
                isRu
                  ? 'Не удалось запустить генерацию видео. Пожалуйста, попробуйте позже.'
                  : 'Failed to start video generation. Please try again later.'
              )
            }
          } catch (e) {
            logger.error(
              '[TextToVideoWizard Step 2] Failed to send critical error message to user',
              { error: e }
            )
          }
        })

      ctx.session.prompt = prompt // Сохраняем промпт на всякий случай, если понадобится

      // Важно: НЕ выходим из сцены здесь (return ctx.scene.leave()),
      // так как processVideoGeneration отправит финальные кнопки,
      // которые должны обрабатываться глобальными hears-обработчиками.
      // Ожидание ввода пользователя здесь также не требуется.
      // Сцена завершится неявно, когда Telegram получит ответ от reply (textStart).
      // Если пользователь что-то напишет ДО того, как придет видео с кнопками,
      // это сообщение обработается как новый апдейт (возможно, handleTextMessage).

      // =====> НОВОЕ ИСПРАВЛЕНИЕ: ЯВНЫЙ ВЫХОД ИЗ СЦЕНЫ <=====
      return ctx.scene.leave() // Выходим из сцены, чтобы глобальные hears могли обработать кнопки
      // =======================================================
    } else {
      // Если пришло не текстовое сообщение (например, стикер, фото и т.д.)
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте текстовое описание.'
          : 'Please send a text description.'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor) // Остаемся на этом шаге для повторного ввода
    }
  }
)

// Добавляем обработчик для новых кнопок
textToVideoWizard.hears(
  ['🎬 Да, создать еще (эта же модель)', '🎬 Yes, create more (same model)'], // <--- ИЗМЕНЕНО
  async ctx => {
    // Просто перезапускаем текущий шаг запроса промпта (шаг 2, индекс 2)
    // ... existing code ...
  }
)

textToVideoWizard.hears(
  ['🔄 Выбрать другую модель', '🔄 Choose another model'], // <--- ИЗМЕНЕНО
  async ctx => {
    // Возвращаемся к первому шагу выбора модели (индекс 0)
    return ctx.wizard.selectStep(0) // Индекс шага выбора модели
  }
)

export default textToVideoWizard
