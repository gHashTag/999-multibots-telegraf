import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { sendGenericErrorMessage } from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { ModeEnum } from '@/interfaces/modes'
import { sendMediaToPulse, MediaPulseOptions } from '@/helpers/pulse'
import { logger } from '@/utils/logger'
import {
  createVideoModelKeyboard,
  createResolutionKeyboard,
  createDurationKeyboard,
} from '@/modules/videoGenerator/helpers/keyboard'
import {
  findModelByButtonText,
  VideoModelConfigKey,
  supportsResolution,
  getAvailableResolutions,
  getPriceForResolution,
} from '@/modules/videoGenerator/helpers/modelMapping'
import { VIDEO_MODELS, getModelPriceInStars } from '@/services/videoModels'
import { VideoModelId } from '@/services/generateTextToVideo'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { calculateFinalPrice } from '@/price/helpers'
import { getUserBalance } from '@/core/supabase'
import { processBalanceVideoOperationHelper } from '@/modules/videoGenerator/helpers/priceHelper'
import { generateTextToVideo } from '@/modules/videoGenerator/generateTextToVideo'

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

    // ===== ДОБАВЛЯЕМ СПИСАНИЕ БАЛАНСА =====
    logger.info(
      '[processVideoGeneration] Processing balance for text_to_video',
      { telegramId: ctx.from.id, modelId: videoModelKey }
    )

    const balanceResult = await processBalanceVideoOperationHelper(
      String(ctx.from.id),
      videoModelKey,
      isRu,
      ctx.botInfo.username,
      'text_to_video'
    )

    if (!balanceResult.success || balanceResult.newBalance === undefined) {
      logger.error('[processVideoGeneration] Balance check failed', {
        telegramId,
        error: balanceResult.error,
      })
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        balanceResult.error ||
          (isRu ? '❌ Ошибка проверки баланса' : '❌ Balance check failed')
      )
      return
    }

    logger.info('[processVideoGeneration] Balance sufficient and deducted', {
      telegramId,
      paymentAmount: balanceResult.paymentAmount,
      newBalance: balanceResult.newBalance,
    })
    // ===== КОНЕЦ СПИСАНИЯ БАЛАНСА =====

    const videoUrl = await generateTextToVideo(
      prompt,
      telegramId,
      username,
      isRu,
      botName,
      videoModelKey,
      ctx.session.selectedResolution, // Передаём выбранное разрешение для Seedance
      ctx.session.selectedDuration // Передаём выбранную длительность для Veo моделей
    )

    if (videoUrl) {
      // Добавляем информацию о стоимости в сообщение с видео
      const modelTitle =
        VIDEO_MODELS_CONFIG[videoModelKey]?.title || videoModelKey
      const caption = isRu
        ? `✨ Ваше видео (${modelTitle}) готово!\n💰 Списано: ${balanceResult.paymentAmount} ✨\n💎 Остаток: ${balanceResult.newBalance} ✨`
        : `✨ Your video (${modelTitle}) is ready!\n💰 Cost: ${balanceResult.paymentAmount} ✨\n💎 Balance: ${balanceResult.newBalance} ✨`

      await ctx.telegram.sendVideo(ctx.chat.id, videoUrl, { caption })

      try {
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
      // Средства автоматически возвращаются при любой ошибке генерации
      const refundMessage = isRu
        ? ' Средства возвращены на ваш баланс.'
        : ' Funds have been refunded to your balance.'

      await ctx.telegram.sendMessage(
        ctx.chat.id,
        isRu
          ? `Не удалось сгенерировать видео. Попробуйте другой промпт или модель.${refundMessage}`
          : `Failed to generate video. Try a different prompt or model.${refundMessage}`
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

// Определяем наш Wizard
export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',

  // Шаг 0: Вход и выбор модели
  async ctx => {
    logger.info(`[TextToVideoWizard Step 0] Entered for user ${ctx.from?.id}`)
    const isRu = isRussianFromState(ctx)
    await ctx.reply(isRu ? 'Выберите модель:' : 'Select a model:', {
      reply_markup: createVideoModelKeyboard(isRu, 'text').reply_markup,
    })
    return ctx.wizard.next()
  },

  // Шаг 1: Обработка выбора модели, проверка баланса и запрос промпта
  async ctx => {
    logger.info(`[TextToVideoWizard Step 1] Entered for user ${ctx.from?.id}`)
    const isRu = isRussianFromState(ctx)

    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    const message = ctx.message
    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель, нажав на одну из кнопок.'
          : 'Please select a model by clicking one of the buttons.'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    const selectedButtonText = message.text
    const foundModelKey = findModelByButtonText(selectedButtonText)

    if (!foundModelKey) {
      logger.warn(
        '[TextToVideoWizard Step 1] Could not map button text to model key',
        { selectedButtonText, telegramId: ctx.from?.id }
      )
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель из предложенных кнопок.'
          : 'Please select a model using the provided buttons.'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    const cost = calculateFinalPrice(foundModelKey)
    if (cost === null || cost === 0) {
      logger.error(
        '[TextToVideoWizard Step 1] Could not calculate price for model',
        { foundModelKey, telegramId: ctx.from?.id }
      )
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    if (!ctx.from?.id || !ctx.botInfo?.username) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const userBalance = await getUserBalance(
      ctx.from.id.toString(),
      ctx.botInfo.username
    )

    if (userBalance < cost) {
      await ctx.reply(
        isRu
          ? `😕 Недостаточно звезд (${cost} ⭐). Ваш баланс: ${Math.floor(
              userBalance
            )} ⭐.`
          : `😕 Insufficient stars (${cost} ⭐). Your balance: ${Math.floor(
              userBalance
            )} ⭐.`
      )
      return ctx.scene.leave()
    }

    ctx.session.videoModel = foundModelKey
    logger.info(
      `[TextToVideoWizard Step 1] Model ${foundModelKey} selected and balance checked for ${ctx.from.id}.`
    )

    // Проверяем, нужно ли показать выбор длительности для Veo моделей
    const modelConfig = VIDEO_MODELS_CONFIG[foundModelKey]
    if (
      modelConfig.durationOptions &&
      modelConfig.durationOptions.length > 0
    ) {
      // Показываем клавиатуру выбора длительности
      logger.info(
        `[TextToVideoWizard Step 1] Showing duration selection for ${foundModelKey}`
      )

      const text = isRu
        ? `⏱️ Выберите длительность для ${modelConfig.title}:`
        : `⏱️ Select duration for ${modelConfig.title}:`

      await ctx.replyWithHTML(
        text,
        createDurationKeyboard(foundModelKey, isRu)
      )
      return ctx.wizard.next() // Переход к шагу обработки выбора длительности
    }
    // Проверяем, нужно ли показать выбор разрешения для WAN моделей
    else if (
      modelConfig.resolutionOptions &&
      modelConfig.resolutionOptions.length > 0
    ) {
      // Показываем клавиатуру выбора разрешения
      logger.info(
        `[TextToVideoWizard Step 1] Showing resolution selection for ${foundModelKey}`
      )

      const text = isRu
        ? `🎬 Выберите разрешение для ${modelConfig.title}:`
        : `🎬 Select resolution for ${modelConfig.title}:`

      await ctx.replyWithHTML(
        text,
        createResolutionKeyboard(foundModelKey, isRu)
      )
      return ctx.wizard.next() // Переход к шагу обработки выбора разрешения
    } else {
      // Стандартная модель без выбора разрешения/длительности
      await ctx.reply(
        isRu
          ? 'Отлично! Теперь введите ваш промпт (описание того, что вы хотите увидеть на видео):'
          : 'Great! Now enter your prompt (a description of what you want to see in the video):',
        Markup.removeKeyboard()
      )
      return ctx.wizard.selectStep(3) // Пропускаем шаг выбора разрешения/длительности
    }
  },

  // Шаг 2: Обработка выбора длительности для Veo моделей или разрешения для WAN моделей (Callback Query)
  async ctx => {
    logger.info(`[TextToVideoWizard Step 2] Entered for user ${ctx.from?.id}`)
    const isRu = isRussianFromState(ctx)

    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    // Обрабатываем callback query для выбора разрешения WAN
    if (
      'callback_query' in ctx.update &&
      ctx.update.callback_query &&
      'data' in ctx.update.callback_query
    ) {
      const callbackData = ctx.update.callback_query.data
      await ctx.answerCbQuery()
      await ctx.editMessageReplyMarkup(undefined) // Удаляем inline keyboard

      if (callbackData?.startsWith('veo_')) {
        // Парсим callback data: "veo_kie-veo-3-fast_8"
        const parts = callbackData.split('_')
        if (parts.length >= 3) {
          const duration = parseInt(parts[parts.length - 1]) // Последняя часть - длительность
          ctx.session.selectedDuration = duration

          const modelKey = ctx.session.videoModel as VideoModelConfigKey
          const modelConfig = VIDEO_MODELS_CONFIG[modelKey]
          const price = modelConfig.priceByDuration?.[duration] || (modelConfig.basePrice * duration)
          const finalPrice = Math.floor(price / 0.016) // Конвертация в звезды

          logger.info(`[TextToVideoWizard Step 2] Veo duration selected:`, {
            telegramId: ctx.from?.id,
            modelKey,
            duration,
            price,
            finalPrice,
          })

          // Проверяем баланс для выбранной длительности
          if (!ctx.from?.id || !ctx.botInfo?.username) {
            await sendGenericErrorMessage(ctx, isRu)
            return ctx.scene.leave()
          }

          const userBalance = await getUserBalance(
            ctx.from.id.toString(),
            ctx.botInfo.username
          )

          if (userBalance < finalPrice) {
            await ctx.reply(
              isRu
                ? `😕 Недостаточно звезд для ${duration} сек (${finalPrice} ⭐). Ваш баланс: ${Math.floor(userBalance)} ⭐.`
                : `😕 Insufficient stars for ${duration} sec (${finalPrice} ⭐). Your balance: ${Math.floor(userBalance)} ⭐.`
            )
            return ctx.scene.leave()
          }

          const textDurationChosen = isRu
            ? `✅ Выбрано: ${modelConfig.title} ${duration} сек (${finalPrice} ⭐).`
            : `✅ Selected: ${modelConfig.title} ${duration} sec (${finalPrice} ⭐).`
          await ctx.reply(textDurationChosen)

          await ctx.reply(
            isRu
              ? 'Отлично! Теперь введите ваш промпт (описание того, что вы хотите увидеть на видео):'
              : 'Great! Now enter your prompt (a description of what you want to see in the video):',
            Markup.removeKeyboard()
          )
          return ctx.wizard.next() // Переход к шагу получения промпта
        }
      } else if (callbackData?.startsWith('wan_')) {
        // Парсим callback data: "wan_wan-2.2-t2v-fast_720p"
        const parts = callbackData.split('_')
        if (parts.length >= 3) {
          const resolution = parts[parts.length - 1] // Последняя часть - разрешение
          ctx.session.selectedResolution = resolution

          const modelKey = ctx.session.videoModel as VideoModelConfigKey
          const modelConfig = VIDEO_MODELS_CONFIG[modelKey]
          const price =
            modelConfig.priceByResolution?.[resolution] || modelConfig.basePrice
          const finalPrice = Math.floor(((price * 5) / 0.016) * 1.5)

          logger.info(`[TextToVideoWizard Step 2] WAN resolution selected:`, {
            telegramId: ctx.from?.id,
            modelKey,
            resolution,
            price,
            finalPrice,
          })

          // Проверяем баланс для выбранного разрешения
          if (!ctx.from?.id || !ctx.botInfo?.username) {
            await sendGenericErrorMessage(ctx, isRu)
            return ctx.scene.leave()
          }

          const userBalance = await getUserBalance(
            ctx.from.id.toString(),
            ctx.botInfo.username
          )

          if (userBalance < finalPrice) {
            await ctx.reply(
              isRu
                ? `😕 Недостаточно звезд для ${resolution.toUpperCase()} (${finalPrice} ⭐). Ваш баланс: ${Math.floor(userBalance)} ⭐.`
                : `😕 Insufficient stars for ${resolution.toUpperCase()} (${finalPrice} ⭐). Your balance: ${Math.floor(userBalance)} ⭐.`
            )
            return ctx.scene.leave()
          }

          const textResolutionChosen = isRu
            ? `✅ Выбрано: ${modelConfig.title} ${resolution.toUpperCase()} (${finalPrice} ⭐).`
            : `✅ Selected: ${modelConfig.title} ${resolution.toUpperCase()} (${finalPrice} ⭐).`
          await ctx.reply(textResolutionChosen)

          await ctx.reply(
            isRu
              ? 'Отлично! Теперь введите ваш промпт (описание того, что вы хотите увидеть на видео):'
              : 'Great! Now enter your prompt (a description of what you want to see in the video):',
            Markup.removeKeyboard()
          )
          return ctx.wizard.next() // Переход к шагу получения промпта
        }
      }

      // Неопознанный callback
      logger.error('[TextToVideoWizard Step 2] Unexpected callback data:', {
        callbackData,
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    // Если не callback query, то ошибка
    await ctx.reply(
      isRu
        ? 'Пожалуйста, выберите длительность или разрешение, нажав на одну из кнопок.'
        : 'Please select duration or resolution by clicking one of the buttons.'
    )
    return ctx.wizard.selectStep(ctx.wizard.cursor)
  },

  // Шаг 3: Получение промпта и запуск генерации
  async ctx => {
    logger.info(`[TextToVideoWizard Step 3] Entered for user ${ctx.from?.id}`)
    const isRu = isRussianFromState(ctx)

    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    if (!('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте текстовое описание для видео.'
          : 'Please send a text description for the video.'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    // Очищаем промпт от возможного "мусора" (текста кнопок, инструкций)
    const videoModelKey = ctx.session.videoModel as VideoModelConfigKey
    const modelConfig = VIDEO_MODELS_CONFIG[videoModelKey]
    const finalPriceInStars = calculateFinalPrice(videoModelKey)
    const buttonText = `${modelConfig.title} (${finalPriceInStars} ⭐)`
    const requestTextRu =
      'Отлично! Теперь введите ваш промпт (описание того, что вы хотите увидеть на видео):'
    const requestTextEn =
      'Great! Now enter your prompt (a description of what you want to see in the video):'
    const fallbackRequestRu =
      'Пожалуйста, отправьте текстовое описание для видео.'
    const fallbackRequestEn = 'Please send a text description for the video.'

    const cleanPrompt = ctx.message.text
      .replace(buttonText, '')
      .replace(requestTextRu, '')
      .replace(requestTextEn, '')
      .replace(fallbackRequestRu, '')
      .replace(fallbackRequestEn, '')
      .trim()

    logger.info('[TextToVideoWizard Step 3] Cleaned prompt:', {
      original: ctx.message.text,
      cleaned: cleanPrompt,
      telegramId: ctx.from?.id,
    })

    const prompt = cleanPrompt
    if (!prompt) {
      await ctx.reply(
        isRu
          ? 'Вы отправили пустой промпт. Пожалуйста, введите описание для видео.'
          : 'You sent an empty prompt. Please enter a description for the video.'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    ctx.session.prompt = prompt

    // ЗАПУСК ГЕНЕРАЦИИ В ФОНЕ
    // Мы уже получили videoModelKey ранее для очистки промпта
    logger.info(
      `[TextToVideoWizard Step 3] Starting background generation for user ${ctx.from?.id}`
    )
    // `videoModelKey` уже определена выше
    processVideoGeneration(ctx, prompt, videoModelKey, isRu)

    // Немедленно отвечаем пользователю и выходим из сцены
    await ctx.reply(
      isRu
        ? '⏳ Запрос принят! Начинаю генерацию видео... Это может занять некоторое время. О результате сообщу отдельно.'
        : '⏳ Request accepted! Starting video generation... This might take a while. I will notify you separately about the result.'
    )

    return ctx.scene.leave()
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
