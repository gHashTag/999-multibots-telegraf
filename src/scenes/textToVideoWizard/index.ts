import { Scenes, Markup } from 'telegraf'
import { MyContext, VideoModelKey } from '@/interfaces'
import { calculateFinalPrice } from '@/price/helpers'
import { generateTextToVideo } from '@/modules/videoGenerator/generateTextToVideo'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage, videoModelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { getUserBalance } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { sendMediaToPulse, MediaPulseOptions } from '@/helpers/pulse'
import { logger } from '@/utils/logger'

// Определяем тип ключа конфига локально
type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

// Новая асинхронная функция для обработки генерации видео в фоне
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
  async ctx => {
    const isRu = isRussian(ctx)
    try {
      // Запрашиваем модель
      await ctx.reply(
        isRu ? 'Выберите модель для генерации:' : 'Choose generation model:',
        {
          reply_markup: videoModelKeyboard(isRu, 'text').reply_markup,
        }
      )

      return ctx.wizard.next()
    } catch (error: unknown) {
      console.error('Error in text_to_video:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      await ctx.reply(
        isRu
          ? `❌ Произошла ошибка: ${errorMessage}`
          : `❌ An error occurred: ${errorMessage}`
      )
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message as { text?: string }
    const selectedButtonText = message?.text // Получаем текст нажатой кнопки

    if (!selectedButtonText) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    // Ищем ключ модели по тексту кнопки (формат: "Название (Цена ⭐)")
    let foundModelKey: VideoModelConfigKey | null = null

    for (const [key, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
      // Рассчитываем ожидаемый текст кнопки с финальной ценой в звездах и эмодзи ⭐
      const finalPriceInStars = calculateFinalPrice(key)
      const expectedButtonText = `${config.title} (${finalPriceInStars} ⭐)` // Используем ⭐
      if (expectedButtonText === selectedButtonText) {
        foundModelKey = key as VideoModelConfigKey
        break
      }
    }

    // Обрабатываем Помощь и Отмену отдельно, если они были нажаты
    if (selectedButtonText === (isRu ? 'Помощь' : 'Help')) {
      // Логика для Помощи (если нужна)
      await ctx.reply(
        isRu
          ? 'Функция Помощи в разработке.'
          : 'Help function is under development.'
      )
      // Можно остаться в сцене или выйти
      // return ctx.wizard.selectStep(ctx.wizard.cursor) // Остаться на текущем шаге
      return ctx.scene.leave()
    }

    if (selectedButtonText === (isRu ? 'Отмена' : 'Cancel')) {
      await ctx.reply(
        isRu ? 'Отменено.' : 'Cancelled.',
        Markup.removeKeyboard()
      )
      return ctx.scene.leave()
    }

    // Если ключ модели не найден по тексту кнопки
    if (!foundModelKey) {
      console.error(
        'Could not map button text to model key:',
        selectedButtonText
      )
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель из предложенных кнопок.'
          : 'Please select a model using the provided buttons.'
      )
      // Остаемся на этом же шаге, чтобы пользователь выбрал снова
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    // --- Остальная логика остается похожей, но используем foundModelKey ---

    if (!ctx.from) {
      console.error('text_to_video: Could not identify user')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id.toString()
    const bot_name = ctx.botInfo.username

    // 1. Вычисляем стоимость
    const cost = calculateFinalPrice(foundModelKey)
    if (cost === null) {
      // calculateFinalPrice может вернуть null, если модель не найдена
      console.error('Could not calculate price for model key:', foundModelKey)
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.wizard.selectStep(ctx.wizard.cursor) // Даем выбрать снова
    }

    // 2. Получаем текущий баланс
    const currentBalance = await getUserBalance(telegram_id, bot_name)

    // 3. Проверяем, достаточно ли средств
    if (currentBalance < cost) {
      console.log(
        `Insufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs: ${cost}`
      )
      await ctx.reply(
        isRu
          ? `😕 Недостаточно звезд для генерации (${cost}). Ваш баланс: ${currentBalance} ★. Пожалуйста, выберите другую модель или пополните баланс.`
          : `😕 Insufficient stars for generation (${cost}). Your balance: ${currentBalance} ★. Please select another model or top up your balance.`,
        // Оставляем клавиатуру для выбора
        {
          reply_markup: videoModelKeyboard(isRu, 'text').reply_markup,
        }
      )
      // Остаемся на этом же шаге
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    // Если баланс достаточен:
    console.log(
      `Sufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs: ${cost}. Proceeding.`
    )

    // Сохраняем НАЙДЕННЫЙ ключ модели в сессии
    ctx.session.videoModel = foundModelKey

    await ctx.reply(
      isRu
        ? 'Пожалуйста, отправьте текстовое описание'
        : 'Please send a text description',
      // Важно убрать клавиатуру после успешного выбора модели
      Markup.removeKeyboard()
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (message && 'text' in message) {
      const prompt = message.text

      if (!prompt) {
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      // Получаем ключ модели из существующего поля сессии
      const videoModelKey = ctx.session.videoModel as
        | VideoModelConfigKey
        | undefined
      console.log('Selected video model key:', videoModelKey)

      if (!videoModelKey) {
        console.error('Video model key not found in session')
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      if (ctx.from && ctx.from.username) {
        const textStart = isRu
          ? '⏳ Запрос принят! Начинаю генерацию видео... Это может занять некоторое время. О результате сообщу отдельно.'
          : '⏳ Request accepted! Starting video generation... This might take a while. I will notify you separately about the result.'

        // 1. Сначала отправляем подтверждение пользователю
        await ctx.reply(textStart, Markup.removeKeyboard())

        // 2. Запускаем генерацию в фоновом режиме
        processVideoGeneration(ctx, prompt, videoModelKey, isRu)
          .then(() => {
            logger.info(
              `[TextToVideoWizard] Асинхронная обработка видео для ${ctx.from?.id} инициирована.`
            )
          })
          .catch(async error => {
            logger.error(
              `[TextToVideoWizard] Критическая ошибка при инициации асинхронной обработки видео для ${ctx.from?.id}:`,
              error
            )
            try {
              // Убедимся что ctx.chat.id доступен, прежде чем пытаться отправить сообщение
              if (ctx.chat?.id) {
                await ctx.telegram.sendMessage(
                  ctx.chat.id,
                  isRu
                    ? 'Не удалось запустить генерацию видео. Пожалуйста, попробуйте позже.'
                    : 'Failed to start video generation. Please try again later.'
                )
              } else {
                logger.error(
                  '[TextToVideoWizard] ctx.chat.id is undefined, cannot send critical error message to user.'
                )
              }
            } catch (e) {
              logger.error(
                '[TextToVideoWizard] Failed to send critical error message to user',
                e
              )
            }
          })

        ctx.session.prompt = prompt

        // Важно: не ждем завершения processVideoGeneration здесь.
        // Сцена должна либо завершиться, либо явно ожидать другого ввода,
        // но не блокироваться на долгой операции.
        // Поскольку пользователь получил сообщение "О результате сообщу отдельно",
        // и кнопки для дальнейших действий будут отправлены из processVideoGeneration,
        // можно оставить сцену "активной" без явного ctx.scene.leave() здесь,
        // если предполагается, что пользователь может что-то еще ввести в этой сцене.
        // Однако, если новые кнопки должны обрабатываться глобальными hears, то лучше выйти.
        // Пока что оставляем без ctx.scene.leave() здесь, чтобы минимизировать изменения,
        // но это место для потенциального улучшения управления состоянием.
        // Главная цель - убрать await долгой операции - достигнута.
      } else {
        console.error('User information missing for video generation')
        await sendGenericErrorMessage(ctx, isRu)
      }

      // После отправки видео и пульса, можно завершить сцену
      // или предложить пользователю что-то еще.
      // Для простоты пока завершим.
      // await ctx.scene.leave() // <--- Убираем завершение сцены здесь
    } else {
      await sendGenericErrorMessage(ctx, isRu)
      await ctx.scene.leave()
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
