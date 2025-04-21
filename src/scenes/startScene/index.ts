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
      bot_name: currentBotName,
      step: 'fetching_translation',
    })

    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
      bot_name: currentBotName,
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
        message: '📝 [StartScene] Отправка текстового приветствия (упрощенная)',
        telegramId,
        function: 'startScene',
        step: 'sending_welcome_text_simplified',
      })

      await ctx.reply(translation, {
        parse_mode: 'Markdown',
      })
    }

    logger.info({
      message: `🏁 [StartScene] Завершение сцены старта (упрощенное)`,
      telegramId,
      function: 'startScene',
      step: 'scene_leave_simplified',
    })

    return ctx.scene.leave()
  }
)
