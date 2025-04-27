import type { MyContext } from '../interfaces'
import { Markup } from 'telegraf'
import { levels } from './mainMenu'

export async function startMenu(ctx: MyContext, isRu: boolean) {
  await ctx.reply(
    isRu ? 'Выберите действие в меню:' : 'Choose an action in the menu:',
    Markup.keyboard([
      [Markup.button.text(isRu ? levels[104].title_ru : levels[104].title_en)],
    ]).resize()
  )
}
