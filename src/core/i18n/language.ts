import { Context } from 'telegraf'

export function isRussian(ctx: Context): boolean {
  return ctx.from?.language_code === 'ru'
}
