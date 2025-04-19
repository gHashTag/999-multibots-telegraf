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
    const isRu = ctx.from?.language_code === 'ru'
    const botName = ctx.botInfo.username
    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
      bot_name: botName,
    })

    if (url && url.trim() !== '') {
      await ctx.replyWithPhoto(url, {
        caption: translation,
      })
    } else {
      await ctx.reply(translation, {
        parse_mode: 'Markdown',
      })
    }

    const tutorialUrl = BOT_URLS[botName]
    let replyKeyboard

    if (tutorialUrl) {
      logger.info(`🎬 Отправка ссылки на туториал для ${botName}`, {
        tutorialUrl,
      })
      const tutorialText = isRu
        ? `🎬 Посмотрите [видео-инструкцию](${tutorialUrl}), как создавать нейрофото в этом боте.\n\nВ этом видео вы научитесь тренировать свою модель (Цифровое тело аватара), создавать фотографии и получать prompt из любого фото, которым вы вдохновились.`
        : `🎬 Watch this [tutorial video](${tutorialUrl}) on how to create neurophotos in this bot.\n\nIn this video, you will learn how to train your model (Digital avatar body), create photos, and get a prompt from any photo that inspires you.`

      replyKeyboard = Markup.keyboard([
        Markup.button.text(isRu ? levels[105].title_ru : levels[105].title_en),
        Markup.button.text(isRu ? levels[103].title_ru : levels[103].title_en),
      ]).resize()

      await ctx.reply(tutorialText, {
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard.reply_markup,
      })
    } else {
      logger.info(`ℹ️ Ссылка на туториал для ${botName} не найдена`)
      replyKeyboard = Markup.keyboard([
        Markup.button.text(isRu ? levels[105].title_ru : levels[105].title_en),
        Markup.button.text(isRu ? levels[103].title_ru : levels[103].title_en),
      ]).resize()
      await ctx.reply(isRu ? 'Выберите действие:' : 'Choose an action:', {
        reply_markup: replyKeyboard.reply_markup,
      })
    }

    return ctx.scene.leave()
  }
)
