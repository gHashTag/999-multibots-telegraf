import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { sendGenericErrorMessage } from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { logger } from '@/utils/logger'
import {
  createVideoModelKeyboard,
  createResolutionKeyboard,
  createDurationKeyboard,
  createAspectRatioKeyboard,
} from '@/modules/videoGenerator/helpers/keyboard'
import {
  findModelByButtonText,
  VideoModelConfigKey,
} from '@/modules/videoGenerator/helpers/modelMapping'
import { VideoModelId } from '@/services/generateTextToVideo'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { calculateFinalPrice } from '@/price/helpers'
import { getUserBalance } from '@/core/supabase'

// Упрощенная функция для обработки генерации видео через сервер
async function processVideoGeneration(
  ctx: MyContext,
  prompt: string,
  videoModelKey: VideoModelConfigKey,
  isRu: boolean
) {
  try {
    // Преобразуем VideoModelConfigKey в VideoModelId
    const modelMapping: Record<VideoModelConfigKey, VideoModelId> = {
      'kie-veo-3-fast': 'kie-veo-3-fast',
      'kie-veo-3': 'kie-veo-3',
      'kie-runway-aleph': 'kie-runway-aleph',
      'veo-3': 'veo-3',
      'veo-3-fast': 'veo-3-fast',
      'veo-2': 'veo-2',
      minimax: 'minimax',
      'ray-v2': 'ray-v2',
      'hunyuan-video-fast': 'hunyuan-video-fast',
      'wan-image-to-video': 'wan-image-to-video',
      'wan-text-to-video': 'wan-text-to-video',
      'kling-v1.6-pro': 'kling-v1.6-pro',
    }

    const videoModelId = modelMapping[videoModelKey]
    if (!videoModelId) {
      logger.error('[processVideoGeneration] Unknown model key', { videoModelKey })
      await ctx.reply(
        isRu
          ? '❌ Неизвестная модель видео.'
          : '❌ Unknown video model.'
      )
      return
    }

    // Логируем параметры перед отправкой на сервер
    logger.info('[processVideoGeneration] ASPECT RATIO CHECK - calling handleTextToVideoDirect', {
      videoModelId,
      selectedDuration: ctx.session.selectedDuration,
      selectedAspectRatio: ctx.session.selectedAspectRatio,
      telegram_id: ctx.from?.id
    })

    // Используем серверную генерацию через handleTextToVideoDirect
    // Она уже включает проверку баланса, списание средств и отправку видео
    await handleTextToVideoDirect(
      ctx,
      prompt,
      videoModelId,
      ctx.session.selectedDuration,
      ctx.session.selectedAspectRatio
    )

  } catch (error) {
    logger.error('[processVideoGeneration] Error:', error)
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка во время генерации видео.'
        : '❌ An error occurred during video generation.'
    )
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

    // Проверяем, нужно ли показать выбор соотношения сторон для Kie.ai моделей
    const modelConfig = VIDEO_MODELS_CONFIG[foundModelKey]
    if (
      modelConfig.aspectRatioOptions &&
      modelConfig.aspectRatioOptions.length > 0
    ) {
      // Показываем клавиатуру выбора соотношения сторон
      logger.info(
        `[TextToVideoWizard Step 1] Showing aspect ratio selection for ${foundModelKey}`
      )

      const text = isRu
        ? `📱 Выберите соотношение сторон для ${modelConfig.title}:`
        : `📱 Select aspect ratio for ${modelConfig.title}:`

      await ctx.replyWithHTML(
        text,
        createAspectRatioKeyboard(foundModelKey, isRu)
      )
      return ctx.wizard.next() // Переход к шагу обработки выбора соотношения сторон
    }
    // Проверяем, нужно ли показать выбор длительности для Veo моделей
    else if (
      modelConfig.durationOptions &&
      modelConfig.durationOptions.length > 1
    ) {
      // Показываем клавиатуру выбора длительности только если есть выбор
      logger.info(
        `[TextToVideoWizard Step 1] Showing duration selection for ${foundModelKey}`
      )

      const text = isRu
        ? `⏱️ Выберите длительность для ${modelConfig.title}:`
        : `⏱️ Select duration for ${modelConfig.title}:`

      await ctx.replyWithHTML(text, createDurationKeyboard(foundModelKey, isRu))
      return ctx.wizard.next() // Переход к шагу обработки выбора длительности
    }
    // Если у модели только одна длительность, устанавливаем её автоматически
    else if (
      modelConfig.durationOptions &&
      modelConfig.durationOptions.length === 1
    ) {
      ctx.session.selectedDuration = modelConfig.durationOptions[0]
      logger.info(
        `[TextToVideoWizard Step 1] Auto-selected single duration for ${foundModelKey}: ${modelConfig.durationOptions[0]}`
      )
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
    logger.info(`[TextToVideoWizard Step 2] 🚨 CALLBACK HANDLER STARTED for user ${ctx.from?.id}`, {
      hasUpdate: !!ctx.update,
      updateType: Object.keys(ctx.update || {}),
      isCallbackQuery: 'callback_query' in (ctx.update || {}),
      callbackData: 'callback_query' in (ctx.update || {}) && ctx.update.callback_query ? ctx.update.callback_query.data : 'NO_DATA'
    })
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
      logger.info(`[TextToVideoWizard Step 2] CALLBACK DEBUG - Processing callback:`, {
        telegramId: ctx.from?.id,
        callbackData,
        hasCallbackQuery: !!ctx.update.callback_query,
        hasData: !!'data' in ctx.update.callback_query
      })
      
      await ctx.answerCbQuery()
      await ctx.editMessageReplyMarkup(undefined) // Удаляем inline keyboard

      if (callbackData?.startsWith('aspect_')) {
        // Парсим callback data: "aspect_kie-veo-3-fast_9:16"
        const parts = callbackData.split('_')
        if (parts.length >= 3) {
          const aspectRatio = parts[parts.length - 1] // Последняя часть - соотношение сторон
          ctx.session.selectedAspectRatio = aspectRatio

          const modelKey = ctx.session.videoModel as VideoModelConfigKey
          const modelConfig = VIDEO_MODELS_CONFIG[modelKey]

          logger.info(`[TextToVideoWizard Step 2] ASPECT RATIO CHECK - Aspect ratio selected and saved to session:`, {
            telegramId: ctx.from?.id,
            modelKey,
            aspectRatio,
            sessionSelectedAspectRatio: ctx.session.selectedAspectRatio,
          })

          // Теперь проверяем, нужно ли показать выбор длительности
          if (
            modelConfig.durationOptions &&
            modelConfig.durationOptions.length > 1
          ) {
            const text = isRu
              ? `⏱️ Выберите длительность для ${modelConfig.title}:`
              : `⏱️ Select duration for ${modelConfig.title}:`

            await ctx.replyWithHTML(
              text,
              createDurationKeyboard(modelKey, isRu)
            )
            return // Остаемся на том же шаге для выбора длительности
          } else {
            // Если у модели только одна длительность, устанавливаем её автоматически
            if (
              modelConfig.durationOptions &&
              modelConfig.durationOptions.length === 1
            ) {
              ctx.session.selectedDuration = modelConfig.durationOptions[0]
              logger.info(
                `[TextToVideoWizard Step 2] Auto-selected single duration after aspect ratio: ${modelConfig.durationOptions[0]}`
              )
            }
            
            // Переходим к вводу промпта
            await ctx.reply(
              isRu
                ? 'Отлично! Теперь введите ваш промпт (описание того, что вы хотите увидеть на видео):'
                : 'Great! Now enter your prompt (description of what you want to see in the video):'
            )
            return ctx.wizard.next() // Переход к следующему шагу
          }
        }
      } else if (callbackData?.startsWith('veo_')) {
        // Парсим callback data: "veo_kie-veo-3-fast_8"
        const parts = callbackData.split('_')
        if (parts.length >= 3) {
          const duration = parseInt(parts[parts.length - 1]) // Последняя часть - длительность
          ctx.session.selectedDuration = duration

          const modelKey = ctx.session.videoModel as VideoModelConfigKey
          const modelConfig = VIDEO_MODELS_CONFIG[modelKey]
          const price =
            modelConfig.priceByDuration?.[duration] ||
            modelConfig.basePrice * duration
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

    // ЗАПУСК СЕРВЕРНОЙ ГЕНЕРАЦИИ В ФОНЕ
    logger.info(
      `[TextToVideoWizard Step 3] ASPECT RATIO CHECK - Starting server generation for user ${ctx.from?.id}`, {
        videoModelKey,
        sessionSelectedDuration: ctx.session.selectedDuration,
        sessionSelectedAspectRatio: ctx.session.selectedAspectRatio,
        prompt: prompt.substring(0, 50)
      }
    )
    
    // Запускаем серверную генерацию в фоне (БЕЗ await)
    processVideoGeneration(ctx, prompt, videoModelKey, isRu).catch(error => {
      logger.error('[TextToVideoWizard] Background generation error:', error)
    })

    // НЕ показываем сообщение здесь - оно показывается в handleTextToVideoDirect

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
