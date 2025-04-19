import { MyContext, ModeEnum } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { logger } from '@/utils/logger'

import { Telegraf } from 'telegraf'

export function registerHearsActions(bot: Telegraf<MyContext>) {
  logger.info('hearsActions - Registering hears handlers')

  bot.hears(
    ['🎙️ Текст в голос', '🎙️ Text to speech'],
    async (ctx: MyContext) => {
      logger.info('hearsActions - Heard 🎙️ Текст в голос')
      ctx.session.mode = ModeEnum.TextToSpeech
      await ctx.scene.enter('text_to_speech')
    }
  )

  bot.hears(['🏠 Главное меню', '🏠 Main menu'], async (ctx: MyContext) => {
    logger.info('hearsActions - Heard 🏠 Главное меню')
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter('menuScene')
  })

  bot.hears(
    ['🎥 Сгенерировать новое видео?', '🎥 Generate new video?'],
    async (ctx: MyContext) => {
      console.log('CASE: Сгенерировать новое видео')
      const mode = ctx.session.mode
      console.log('mode', mode)
      if (mode === 'text_to_video') {
        await ctx.scene.enter('text_to_video')
      } else if (mode === 'image_to_video') {
        await ctx.scene.enter('image_to_video')
      } else {
        await ctx.reply(
          isRussian(ctx)
            ? 'Вы не можете сгенерировать новое видео в этом режиме'
            : 'You cannot generate a new video in this mode'
        )
      }
    }
  )
}
