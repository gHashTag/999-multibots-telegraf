import { Context } from 'telegraf'

export async function handlePreCheckoutQuery(ctx: Context) {
  await ctx.answerPreCheckoutQuery(true)
}
