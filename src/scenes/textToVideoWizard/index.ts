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
  logger.info('[processVideoGeneration] FUNCTION ENTRY', {
    hasCtx: !!ctx,
    hasTelegram: !!(ctx && ctx.telegram),
    hasChat: !!(ctx && ctx.chat),
    hasFrom: !!(ctx && ctx.from),
    videoModelKey,
    prompt: prompt.substring(0, 30)
  })

  try {
    // Преобразуем VideoModelConfigKey в VideoModelId
    const modelMapping: Record<VideoModelConfigKey, VideoModelId> = {
      'kie-veo-3-fast': 'kie-veo-3-fast',
      'kie-veo-3': 'kie-veo-3',
      'kie-runway-aleph': 'kie-runway-aleph',
      'kling-v1.6-pro': 'kling-v1.6-pro',
      'ray-v2': 'ray-v2',
      'hunyuan-video-fast': 'hunyuan-video-fast',
      'wan-image-to-video': 'wan-image-to-video',
      'wan-text-to-video': 'wan-text-to-video',
      minimax: 'minimax',
    }

    const videoModelId = modelMapping[videoModelKey]
    if (!videoModelId) {
      logger.error('[processVideoGeneration] Unknown model key', {
        videoModelKey,
      })
      await ctx.reply(
        isRu ? '❌ Неизвестная модель видео.' : '❌ Unknown video model.'
      )
      return
    }

    // Логируем параметры перед отправкой на сервер
    logger.info(
      '[processVideoGeneration] ASPECT RATIO CHECK - calling handleTextToVideoDirect',
      {
        videoModelId,
        selectedDuration: ctx.session.selectedDuration,
        selectedAspectRatio: ctx.session.selectedAspectRatio,
        telegram_id: ctx.from?.id,
      }
    )

    // Проверяем контекст перед вызовом handleTextToVideoDirect
    logger.info('[processVideoGeneration] PRE-HANDLE-TEXT-TO-VIDEO-DIRECT CTX CHECK', {
      hasCtx: !!ctx,
      hasTelegram: !!(ctx && ctx.telegram),
      hasChat: !!(ctx && ctx.chat),
      hasBotInfo: !!(ctx && ctx.botInfo),
      videoModelId,
      selectedDuration: ctx.session.selectedDuration,
      selectedAspectRatio: ctx.session.selectedAspectRatio
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
    
    logger.info('[processVideoGeneration] POST-HANDLE-TEXT-TO-VIDEO-DIRECT CTX CHECK', {
      hasCtx: !!ctx,
      hasTelegram: !!(ctx && ctx.telegram),
      hasChat: !!(ctx && ctx.chat)
    })
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
    logger.info(
      `[TextToVideoWizard Step 0] 🚨 WIZARD STARTED for user ${ctx.from?.id}`,
      {
        currentStep: ctx.wizard.cursor,
        hasUpdate: !!ctx.update,
        updateType: Object.keys(ctx.update || {}),
      }
    )
    const isRu = isRussianFromState(ctx)
    await ctx.reply(isRu ? 'Выберите модель:' : 'Select a model:', {
      reply_markup: createVideoModelKeyboard(isRu, 'text').reply_markup,
    })
    return ctx.wizard.next()
  },

  // Шаг 1: Обработка выбора модели, проверка баланса и запрос промпта
  async ctx => {
    logger.info(
      `[TextToVideoWizard Step 1] 🚨 MODEL SELECTION STEP for user ${ctx.from?.id}`,
      {
        currentStep: ctx.wizard.cursor,
        hasUpdate: !!ctx.update,
        updateType: Object.keys(ctx.update || {}),
        isMessage: 'message' in (ctx.update || {}),
        messageText:
          'message' in (ctx.update || {}) &&
          (ctx.update as any).message &&
          'text' in (ctx.update as any).message
            ? (ctx.update as any).message.text
            : 'NO_TEXT',
      }
    )
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

      await ctx.reply(text, createAspectRatioKeyboard(foundModelKey, isRu))
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

  // Шаг 2: Обработка выбора соотношения сторон (простые кнопки)
  async ctx => {
    logger.info(
      `[TextToVideoWizard Step 2] 🚨 ASPECT RATIO SELECTION for user ${ctx.from?.id}`
    )
    const isRu = isRussianFromState(ctx)

    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    const message = ctx.message
    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите соотношение сторон, нажав на одну из кнопок.'
          : 'Please select aspect ratio by clicking one of the buttons.'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    const selectedText = message.text

    // Проверяем кнопку "Назад"
    if (
      selectedText === '⬅️ Назад в меню' ||
      selectedText === '⬅️ Back to Menu'
    ) {
      return ctx.scene.leave()
    }

    // Определяем выбранное соотношение сторон
    let selectedAspectRatio: string
    if (
      selectedText.includes('9:16') ||
      selectedText.includes('Вертикальное') ||
      selectedText.includes('Vertical')
    ) {
      selectedAspectRatio = '9:16'
    } else if (
      selectedText.includes('16:9') ||
      selectedText.includes('Горизонтальное') ||
      selectedText.includes('Horizontal')
    ) {
      selectedAspectRatio = '16:9'
    } else {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите соотношение сторон из предложенных вариантов.'
          : 'Please select aspect ratio from the provided options.'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    // Сохраняем выбор
    ctx.session.selectedAspectRatio = selectedAspectRatio

    const modelKey = ctx.session.videoModel as VideoModelConfigKey
    const modelConfig = VIDEO_MODELS_CONFIG[modelKey]

    logger.info(`[TextToVideoWizard Step 2] Aspect ratio selected:`, {
      telegramId: ctx.from?.id,
      modelKey,
      selectedAspectRatio,
    })

    // Показываем подтверждение и переходим к вводу промпта
    const aspectText = isRu
      ? selectedAspectRatio === '9:16'
        ? 'вертикальное (9:16)'
        : 'горизонтальное (16:9)'
      : selectedAspectRatio === '9:16'
        ? 'vertical (9:16)'
        : 'horizontal (16:9)'

    await ctx.reply(
      isRu
        ? `✅ Выбрано ${aspectText}. Теперь введите ваш промпт:`
        : `✅ Selected ${aspectText}. Now enter your prompt:`,
      Markup.removeKeyboard()
    )

    logger.info(`[TextToVideoWizard Step 2] 🚨 END OF STEP 2 - About to transition to Step 3`, {
      telegramId: ctx.from?.id,
      modelKey,
      selectedAspectRatio,
      hasCtx: !!ctx,
      hasTelegram: !!(ctx && ctx.telegram),
      hasChat: !!(ctx && ctx.chat),
      currentStep: ctx.wizard.cursor,
      nextStep: ctx.wizard.cursor + 1
    })

    return ctx.wizard.next() // Переход к шагу получения промпта
  },

  // Шаг 3: Получение промпта и запуск генерации
  async ctx => {
    logger.info(`[TextToVideoWizard Step 3] 🚨 STEP 3 ENTRY - VERY FIRST LINE`, {
      telegramId: ctx.from?.id,
      hasCtx: !!ctx,
      hasTelegram: !!(ctx && ctx.telegram),
      hasChat: !!(ctx && ctx.chat),
      hasMessage: !!(ctx && ctx.message),
      currentStep: ctx.wizard.cursor,
    })
    
    logger.info(
      `[TextToVideoWizard Step 3] 🚨 PROMPT INPUT STEP for user ${ctx.from?.id}`,
      {
        currentStep: ctx.wizard.cursor,
        hasUpdate: !!ctx.update,
        updateType: Object.keys(ctx.update || {}),
        isMessage: 'message' in (ctx.update || {}),
        messageText:
          'message' in (ctx.update || {}) &&
          (ctx.update as any).message &&
          'text' in (ctx.update as any).message
            ? (ctx.update as any).message.text?.substring(0, 50)
            : 'NO_TEXT',
        sessionSelectedAspectRatio: ctx.session.selectedAspectRatio,
        sessionSelectedDuration: ctx.session.selectedDuration,
      }
    )

    // Детальная проверка контекста
    logger.info('[TextToVideoWizard Step 3] CTX VALIDATION CHECK', {
      hasCtx: !!ctx,
      hasTelegram: !!(ctx && ctx.telegram),
      hasChat: !!(ctx && ctx.chat),
      hasMessage: !!(ctx && ctx.message),
      hasFrom: !!(ctx && ctx.from),
      chatId: ctx?.chat?.id,
      fromId: ctx?.from?.id,
      messageType: ctx?.message ? Object.keys(ctx.message) : 'NO_MESSAGE'
    })
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

    // ЗАПУСК СЕРВЕРНОЙ ГЕНЕРАЦИИ
    logger.info(
      `[TextToVideoWizard Step 3] ASPECT RATIO CHECK - Starting server generation for user ${ctx.from?.id}`,
      {
        videoModelKey,
        sessionSelectedDuration: ctx.session.selectedDuration,
        sessionSelectedAspectRatio: ctx.session.selectedAspectRatio,
        prompt: prompt.substring(0, 50),
      }
    )

    try {
      // Проверяем контекст перед запуском генерации
      logger.info('[TextToVideoWizard Step 3] PRE-GENERATION CTX CHECK', {
        hasCtx: !!ctx,
        hasTelegram: !!(ctx && ctx.telegram),
        hasChat: !!(ctx && ctx.chat),
        hasFrom: !!(ctx && ctx.from),
        prompt: prompt.substring(0, 30)
      })

      // Запускаем серверную генерацию и ждем результата
      await processVideoGeneration(ctx, prompt, videoModelKey, isRu)

      logger.info('[TextToVideoWizard Step 3] POST-GENERATION CTX CHECK', {
        hasCtx: !!ctx,
        hasTelegram: !!(ctx && ctx.telegram),
        hasChat: !!(ctx && ctx.chat)
      })

      // После успешного запуска генерации выходим из сцены
      return ctx.scene.leave()
    } catch (error) {
      logger.error('[TextToVideoWizard] Generation error:', error)
      
      logger.info('[TextToVideoWizard Step 3] ERROR CTX CHECK', {
        hasCtx: !!ctx,
        hasTelegram: !!(ctx && ctx.telegram),
        hasChat: !!(ctx && ctx.chat),
        errorMessage: error.message
      })

      if (ctx && ctx.reply) {
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при запуске генерации видео. Попробуйте еще раз.'
            : '❌ An error occurred while starting video generation. Please try again.'
        )
      } else {
        logger.error('[TextToVideoWizard] Cannot reply - ctx.reply is not available')
      }

      // В случае ошибки остаемся в сцене, чтобы пользователь мог попробовать снова
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }
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
