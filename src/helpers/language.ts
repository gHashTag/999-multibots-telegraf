import { Context } from 'telegraf'

export const isRussian = (ctx: Context) => ctx.from?.language_code === 'ru'
