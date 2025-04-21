import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import { getTranslation } from '@/core/supabase'
import { BOT_URLS } from '@/core/bot'
import { logger } from '@/utils/logger'
import { levels } from '@/menu/mainMenu'
import { ModeEnum } from '@/interfaces/modes'

export const startScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.StartScene,
  async ctx => {
    const telegramId = ctx.from?.id?.toString() || 'unknown'
    logger.info({
      message: '🚀 [StartScene] Начало работы с ботом',
      telegramId,
      function: 'startScene',
      username: ctx.from?.username,
      language: ctx.from?.language_code,
      sessionData: JSON.stringify(ctx.session || {}),
    })

    const isRu = ctx.from?.language_code === 'ru'
    const botName = ctx.botInfo.username

    logger.info({
      message: '📡 [StartScene] Получение перевода для стартового сообщения',
      telegramId,
      function: 'startScene',
      bot_name: botName,
      step: 'fetching_translation',
    })

    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
      bot_name: botName,
    })

    logger.info({
      message: '✅ [StartScene] Перевод получен',
      telegramId,
      function: 'startScene',
      translationReceived: !!translation,
      imageUrlReceived: !!url,
      step: 'translation_received',
    })

    if (url && url.trim() !== '') {
      logger.info({
        message:
          '🖼️ [StartScene] Отправка приветственного изображения с подписью',
        telegramId,
        function: 'startScene',
        url,
        step: 'sending_welcome_image',
      })

      await ctx.replyWithPhoto(url, {
        caption: translation,
        parse_mode: 'Markdown',
      })
    } else {
      logger.info({
        message: '📝 [StartScene] Отправка текстового приветствия',
        telegramId,
        function: 'startScene',
        step: 'sending_welcome_text',
      })

      await ctx.reply(translation, {
        parse_mode: 'Markdown',
      })
    }

    const tutorialUrl = BOT_URLS[botName]
    let replyKeyboard

    if (tutorialUrl) {
      logger.info({
        message: `🎬 [StartScene] Отправка ссылки на туториал для ${botName}`,
        telegramId,
        function: 'startScene',
        tutorialUrl,
        step: 'sending_tutorial',
      })

      const tutorialText = isRu
        ? `🎬 Посмотрите [видео-инструкцию](${tutorialUrl}), как создавать нейрофото в этом боте.\n\nВ этом видео вы научитесь тренировать свою модель (Цифровое тело аватара), создавать фотографии и получать prompt из любого фото, которым вы вдохновились.`
        : `🎬 Watch this [tutorial video](${tutorialUrl}) on how to create neurophotos in this bot.\n\nIn this video, you will learn how to train your model (Digital avatar body), create photos, and get a prompt from any photo that inspires you.`

      replyKeyboard = Markup.keyboard([
        Markup.button.text(isRu ? levels[105].title_ru : levels[105].title_en),
        Markup.button.text(isRu ? levels[103].title_ru : levels[103].title_en),
      ]).resize()

      logger.info({
        message: `📤 [StartScene] Отправка текста с туториалом и клавиатурой`,
        telegramId,
        function: 'startScene',
        step: 'sending_tutorial_text_with_keyboard',
        buttons: [
          isRu ? levels[105].title_ru : levels[105].title_en,
          isRu ? levels[103].title_ru : levels[103].title_en,
        ],
      })

      await ctx.reply(tutorialText, {
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard.reply_markup,
      })
    } else {
      logger.info({
        message: `ℹ️ [StartScene] Ссылка на туториал для ${botName} не найдена`,
        telegramId,
        function: 'startScene',
        step: 'tutorial_url_not_found',
      })

      replyKeyboard = Markup.keyboard([
        Markup.button.text(isRu ? levels[105].title_ru : levels[105].title_en),
        Markup.button.text(isRu ? levels[103].title_ru : levels[103].title_en),
      ]).resize()

      logger.info({
        message: `📤 [StartScene] Отправка простого меню выбора действия`,
        telegramId,
        function: 'startScene',
        step: 'sending_basic_menu',
        buttons: [
          isRu ? levels[105].title_ru : levels[105].title_en,
          isRu ? levels[103].title_ru : levels[103].title_en,
        ],
      })

      await ctx.reply(isRu ? 'Выберите действие:' : 'Choose an action:', {
        reply_markup: replyKeyboard.reply_markup,
      })
    }

    logger.info({
      message: `🏁 [StartScene] Завершение сцены старта`,
      telegramId,
      function: 'startScene',
      step: 'scene_leave',
    })

    return ctx.scene.leave()
  }
)
