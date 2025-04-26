import type { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { getUserBalance } from '@/core/supabase'
import type { ModeEnum } from '@/interfaces/modes'
export const balanceScene = new Scenes.WizardScene<MyContext>(
  'balanceScene',
  async (ctx: MyContext) => {
    try {
      console.log('CASE: balanceScene')
      const isRu = ctx.from?.language_code === 'ru'

      const balance = await getUserBalance(ctx.from?.id.toString() || '')

      await ctx.reply(
        isRu
          ? `💰✨ <b>Ваш баланс:</b> ${balance} ⭐️`
          : `💰✨ <b>Your balance:</b> ${balance} ⭐️`,
        { parse_mode: 'HTML' }
      )
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      console.error('Error sending balance:', error)
      throw error
    }
  }
)
