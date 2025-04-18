import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import { getReferalsCountAndUserData, getTranslation } from '@/core/supabase'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { levels } from '@/menu/mainMenu'

export const startScene = new Scenes.WizardScene<MyContext>(
  'startScene',
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
    })

    const keyboard = Markup.keyboard([
      [Markup.button.text(isRu ? levels[104].title_ru : levels[104].title_en)],
    ])
      .resize()
      .oneTime()

    if (url && url.trim() !== '') {
      await ctx.replyWithPhoto(url, {
        caption: translation,
        reply_markup: keyboard.reply_markup,
      })
    } else {
      // Если фото недоступно, отправляем только текст
      await ctx.reply(translation, {
        reply_markup: keyboard.reply_markup,
      })
    }

    ctx.wizard.next()
  },
  async (ctx: MyContext) => {
    const telegram_id = ctx.from?.id?.toString() || ''
    const { subscription } = await getReferalsCountAndUserData(telegram_id)
    const hasFullAccess = checkFullAccess(subscription)
    if (hasFullAccess) {
      await ctx.scene.enter('menuScene')
    } else {
      await ctx.scene.enter('subscriptionScene')
    }
  }
)
