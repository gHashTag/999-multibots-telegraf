import { MyContext } from '../interfaces'
import { Markup } from 'telegraf'
import { levels } from './simpleMenu'

export async function startMenu(ctx: MyContext, isRu: boolean) {
  await ctx.reply(
    isRu ? 'Выберите действие в меню:' : 'Choose an action in the menu:',
    Markup.keyboard([
      [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')],
    ]).resize()
  )
}
