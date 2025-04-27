import { type MyContext } from '@/interfaces/context.interface'
import { isRussian } from '@/helpers'
import { Markup } from 'telegraf'
import { levels } from './mainMenu'

export const startMenu = async (ctx: MyContext, isRu: boolean) => {
  const text = isRu
    ? 'Добро пожаловать в главное меню!'
    : 'Welcome to the main menu!'

  await ctx.reply(
    text,
    Markup.keyboard([
      [isRu ? levels[104].title_ru : levels[104].title_en],
    ]).resize()
  )
}
