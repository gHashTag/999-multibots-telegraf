import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import { getTranslation } from '@/core/supabase'

export const startScene = new Scenes.WizardScene<MyContext>(
  'startScene',
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    const { translation, url } = await getTranslation({
      key: isRu ? 'start_ru' : 'start_en',
      ctx,
    })
    await ctx.replyWithPhoto(url, {
      caption: translation,
      reply_markup: Markup.keyboard([
        [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')],
      ])
        .resize()
        .oneTime().reply_markup,
    })
    ctx.wizard.next()
  },
  async (ctx: MyContext) => {
    ctx.scene.enter('menuScene')
  }
)
