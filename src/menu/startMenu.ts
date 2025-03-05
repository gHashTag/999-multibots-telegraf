import { MyContext } from '../interfaces'
import { Markup } from 'telegraf'
import { mainMenuButton } from './mainMenu'

export async function startMenu(ctx: MyContext, isRu: boolean) {
  await ctx.reply(
    isRu ? 'Выберите действие в меню:' : 'Choose an action in the menu:',
    Markup.keyboard([
      [
        Markup.button.text(
          isRu ? mainMenuButton.title_ru : mainMenuButton.title_en
        ),
      ],
    ]).resize()
  )
}
