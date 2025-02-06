import { getUserBalance } from '@/core/supabase'
import { MyContext } from '@/interfaces'

export async function balanceCommand(ctx: MyContext) {
  try {
    console.log('CASE: balanceCommand')
    const isRu = ctx.from?.language_code === 'ru'

    const balance = await getUserBalance(ctx.from?.id || 0)

    await ctx.reply(
      isRu
        ? `💰✨ <b>Ваш баланс:</b> ${balance} ⭐️`
        : `💰✨ <b>Your balance:</b> ${balance} ⭐️`,
      { parse_mode: 'HTML' }
    )
    return
  } catch (error) {
    console.error('Error sending balance:', error)
    throw error
  }
}
