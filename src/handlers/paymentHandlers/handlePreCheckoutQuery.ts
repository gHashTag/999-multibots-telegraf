import { Context } from 'telegraf'

export async function handlePreCheckoutQuery(ctx: Context) {
  try {
    await ctx.answerPreCheckoutQuery(true)
  } catch (error) {
    console.error('Error handling pre-checkout query:', error)
  }
}
