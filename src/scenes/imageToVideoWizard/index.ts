import { Scenes, Markup } from 'telegraf'
import { generateImageToVideo } from '@/services/generateImageToVideo'
import { MyContext } from '@/interfaces'
import {
  cancelMenu,
  createHelpCancelKeyboard,
  sendGenerationCancelledMessage,
  sendGenericErrorMessage,
  videoModelKeyboard,
} from '@/menu'
import { isRussian } from '@/helpers/language'
import { ModeEnum } from '@/interfaces/modes'
import { getBotToken, handleHelpCancel } from '@/handlers'
import { VIDEO_MODELS_CONFIG } from '@/config/models.config'
import { logger } from '@/utils/logger'
import { calculateFinalPrice } from '@/price/helpers'
import { getUserBalance } from '@/core/supabase'
import { SYSTEM_CONFIG } from '@/price/constants/index'
import { levels } from '@/menu/mainMenu'

// Определяем тип ключей конфига
type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG

export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  'image_to_video',
  async ctx => {
    const isRu = isRussian(ctx)
    const keyboardMarkup = videoModelKeyboard(isRu)
    await ctx.reply(
      isRu ? 'Выберите модель для генерации:' : 'Choose generation model:',
      {
        reply_markup: keyboardMarkup.reply_markup,
      }
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    // --- НАЧАЛО ИСПРАВЛЕНИЙ ---
    // Ожидаем текстовое сообщение, а не callback_query
    const message = ctx.message as { text?: string }
    const selectedButtonText = message?.text // Получаем текст нажатой кнопки

    // --- НАЧАЛО ИСПРАВЛЕНИЯ ---
    // Сначала проверяем стандартные команды Помощь/Отмена
    const isHelpOrCancel = await handleHelpCancel(ctx)
    if (isHelpOrCancel) {
      return // handleHelpCancel уже сделал ctx.scene.leave() или ctx.scene.enter()
    }
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

    if (!selectedButtonText) {
      // Это сообщение теперь должно быть правильным
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель, нажав одну из кнопок внизу.'
          : 'Please select a model by pressing one of the buttons below.'
      )
      return // Остаемся на этом же шаге
    }

    // --- НАЧАЛО ИСПРАВЛЕНИЯ ---
    // Проверяем, не нажата ли кнопка "Главное меню"
    if (
      selectedButtonText === levels[104].title_ru ||
      selectedButtonText === levels[104].title_en
    ) {
      logger.info('Scene Handler: Главное меню / Main Menu')
      await ctx.reply(
        isRu ? 'Возвращаемся в главное меню...' : 'Returning to main menu...',
        Markup.removeKeyboard()
      )
      await ctx.scene.leave()
      return ctx.scene.enter(ModeEnum.MainMenu)
    }
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

    // Ищем ключ модели по тексту кнопки (формат: "Название (Цена ⭐)")
    let foundModelKey: VideoModelKey | null = null

    for (const [key, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
      // Рассчитываем ожидаемый текст кнопки с финальной ценой в звездах и эмодзи ⭐
      const finalPriceInStars = calculateFinalPrice(key)
      const expectedButtonText = `${config.title} (${finalPriceInStars} ⭐)` // Используем ⭐
      if (expectedButtonText === selectedButtonText) {
        foundModelKey = key as VideoModelKey
        break
      }
    }

    // Если ключ модели не найден по тексту кнопки
    if (!foundModelKey) {
      logger.warn('Could not map button text to model key:', {
        selectedButtonText,
      })
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель из предложенных кнопок ВНИЗУ.'
          : 'Please select a model using the provided buttons BELOW.'
      )
      return // Остаемся на этом шаге
    }

    // --- Логика проверки баланса с использованием calculateFinalPrice ---
    if (!ctx.from) {
      logger.error('imageToVideoWizard: Could not identify user')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id.toString()
    const bot_name = ctx.botInfo.username

    // 1. Вычисляем ФИНАЛЬНУЮ СТОИМОСТЬ в звездах (с интересом)
    const finalPriceInStars = calculateFinalPrice(foundModelKey)

    // 2. Получаем текущий баланс
    const currentBalance = await getUserBalance(telegram_id, bot_name)

    // 3. Проверяем, достаточно ли средств (используя финальную цену)
    if (currentBalance < finalPriceInStars) {
      logger.info(
        `Insufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs (final): ${finalPriceInStars}`
      )
      await ctx.reply(
        isRu
          ? `Недостаточно звезд для генерации (${finalPriceInStars} ★). Ваш баланс: ${currentBalance} ★. Пожалуйста, выберите другую модель или пополните баланс.`
          : `😕 Insufficient stars for generation (${finalPriceInStars} ★). Your balance: ${currentBalance} ★. Please select another model or top up your balance.`,
        {
          reply_markup: videoModelKeyboard(isRu).reply_markup,
        }
      )
      return // Остаемся на этом же шаге
    }

    // Если баланс достаточен:
    logger.info(
      `Sufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs (final): ${finalPriceInStars}. Proceeding to image request.`
    )
    ctx.session.videoModel = foundModelKey
    // Сохраняем ФИНАЛЬНУЮ стоимость в звездах
    ctx.session.paymentAmount = finalPriceInStars
    console.log('ctx.session.videoModel (config key):', ctx.session.videoModel)
    console.log(
      'ctx.session.paymentAmount (final stars):',
      ctx.session.paymentAmount
    )

    const selectedModelTitle =
      VIDEO_MODELS_CONFIG[foundModelKey]?.title || foundModelKey

    // Сообщаем о выбранной модели и убираем ReplyKeyboard
    await ctx.reply(
      isRu
        ? `Вы выбрали модель: ${selectedModelTitle}.`
        : `You have chosen the model: ${selectedModelTitle}.`,
      Markup.removeKeyboard() // Убираем клавиатуру
    )

    await ctx.reply(
      isRu
        ? 'Теперь отправьте изображение для генерации видео'
        : 'Now send an image for video generation',
      {
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
      }
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const message = ctx.message
    const isRu = isRussian(ctx)
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    } else {
      if (message && 'photo' in message) {
        const photo = message.photo[message.photo.length - 1]
        const file = await ctx.telegram.getFile(photo.file_id)
        const filePath = file.file_path

        if (!filePath) {
          await ctx.reply(
            isRu ? 'Не удалось получить изображение' : 'Failed to get image'
          )
          return ctx.scene.leave()
        }

        const botToken = getBotToken(ctx)
        ctx.session.imageUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
        await ctx.reply(
          isRu
            ? 'Отлично! Теперь опишите желаемое движение в видео'
            : 'Great! Now describe the desired movement in the video',
          {
            reply_markup: cancelMenu(isRu).reply_markup,
          }
        )
        return ctx.wizard.next()
      }
      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте изображение.' : 'Please send an image.',
        {
          reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
        }
      )
      return
    }
  },
  async ctx => {
    const message = ctx.message
    const isRu = isRussian(ctx)

    if (message && 'text' in message) {
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      } else {
        const prompt = message.text
        const configKey = ctx.session.videoModel as VideoModelKey
        const imageUrl = ctx.session.imageUrl

        if (!prompt) {
          await ctx.reply(
            isRu
              ? 'Требуется описание движения.'
              : 'Movement description is required.'
          )
          return
        }
        if (!configKey || !(configKey in VIDEO_MODELS_CONFIG)) {
          logger.error('Invalid configKey in session', { configKey })
          await ctx.reply(
            isRu
              ? 'Ошибка сессии (модель). Начните заново.'
              : 'Session error (model). Please start over.'
          )
          return ctx.scene.leave()
        }
        if (!imageUrl) {
          logger.error('Missing imageUrl in session', { configKey })
          await ctx.reply(
            isRu
              ? 'Ошибка сессии (URL изображения). Начните заново.'
              : 'Session error (image URL). Please start over.'
          )
          return ctx.scene.leave()
        }
        if (!ctx.from?.username) {
          logger.error('Missing username in context')
          await ctx.reply(
            isRu
              ? 'Ошибка пользователя. Начните заново.'
              : 'User error. Please start over.'
          )
          return ctx.scene.leave()
        }

        try {
          logger.info('Calling generateImageToVideo with:', {
            imageUrl,
            prompt,
            configKey,
            telegram_id: ctx.from.id,
            username: ctx.from.username,
            isRu,
          })

          await generateImageToVideo(
            imageUrl,
            prompt,
            configKey,
            ctx.from.id.toString(),
            ctx.from.username,
            isRu,
            ctx.botInfo?.username
          )
          ctx.session.prompt = prompt
          ctx.session.mode = ModeEnum.ImageToVideo

          const modelTitle = VIDEO_MODELS_CONFIG[configKey]?.title || configKey
          await ctx.reply(
            isRu
              ? `✅ Запрос на генерацию видео (${modelTitle}) отправлен! Ожидайте результат.`
              : `✅ Video generation request (${modelTitle}) sent! Please wait for the result.`
          )
        } catch (error) {
          logger.error('Ошибка при вызове generateImageToVideo:', {
            error,
            configKey,
            telegram_id: ctx.from.id,
          })
          await ctx.reply(
            isRu
              ? '❌ Произошла ошибка при запуске генерации видео. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
              : '❌ An error occurred starting video generation. Please try again later or contact support.'
          )
        }
        return ctx.scene.leave()
      }
    }
    await ctx.reply(
      isRu
        ? 'Пожалуйста, отправьте текстовое описание движения.'
        : 'Please send a text description of the movement.',
      Markup.removeKeyboard()
    )
    return
  }
)

export default imageToVideoWizard
