import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { ModeEnum } from '@/price/helpers/modelsCost'

import { Telegraf } from 'telegraf'

export function registerHearsActions(bot: Telegraf<MyContext>) {
  bot.hears(
    ['🎙️ Текст в голос', '🎙️ Text to speech'],
    async (ctx: MyContext) => {
      console.log('CASE bot: 🎙️ Текст в голос')
      ctx.session.mode = ModeEnum.TextToSpeech
      await ctx.scene.enter('text_to_speech')
    }
  )

  bot.hears(['🏠 Главное меню', '🏠 Main menu'], async (ctx: MyContext) => {
    console.log('CASE: Главное меню')
    ctx.session.mode = ModeEnum.MenuScene
    await ctx.scene.enter(ModeEnum.MenuScene)
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
