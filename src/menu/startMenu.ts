import { type MyContext } from '../interfaces'
import { isRussian } from '@/helpers'
import { levels } from './mainMenu'
import { Markup } from 'telegraf'

export async function startMenu(ctx: MyContext, isRu: boolean) {
  await ctx.reply(
    isRu ? 'Выберите действие в меню:' : 'Choose an action in the menu:',
    Markup.keyboard([
      [Markup.button.text(isRu ? levels[104].title_ru : levels[104].title_en)],
    ]).resize()
  )
}
