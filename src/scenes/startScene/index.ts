import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import {
  checkPaymentStatus,
  getReferalsCountAndUserData,
  getTranslation,
} from '@/core/supabase'
import { levels } from '@/menu/mainMenu'

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
        [
          Markup.button.text(
            isRu ? levels[104].title_ru : levels[104].title_en
          ),
        ],
      ])
        .resize()
        .oneTime().reply_markup,
    })
    ctx.wizard.next()
  },
  async (ctx: MyContext) => {
    const telegram_id = ctx.from?.id?.toString() || ''
    const { subscription } = await getReferalsCountAndUserData(telegram_id)
    const hasFullAccess = await checkPaymentStatus(ctx, subscription)
    if (hasFullAccess) {
      await ctx.scene.enter('menuScene')
    } else {
      await ctx.scene.enter('subscriptionScene')
    }
  }
)
