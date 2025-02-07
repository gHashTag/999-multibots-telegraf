import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import { ruText, enText } from './texts' // Импорт текстов

export const startScene = new Scenes.WizardScene<MyContext>(
  'startScene',
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'

    await ctx.replyWithPhoto(
      'https://dmrooqbmxdhdyblqzswu.supabase.co/storage/v1/object/public/neuro_coder/bot/ava-16-9.jpg',
      {
        caption: isRu ? ruText : enText, // Использование импортированных текстов
        reply_markup: Markup.keyboard([
          [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')],
        ])
          .resize()
          .oneTime().reply_markup,
      }
    )
    ctx.wizard.next()
  },
  async (ctx: MyContext) => {
    ctx.scene.enter('menuScene')
  }
)
