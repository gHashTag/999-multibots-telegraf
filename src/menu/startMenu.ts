import { MyContext } from '../interfaces'
import { Markup } from 'telegraf'
import { levels } from './mainMenu'

// Проверка, есть ли ключ 104 в levels, иначе создаем собственный объект
const level104 = {
  ru: 'Начать',
  en: 'Start'
}

export async function startMenu(ctx: MyContext, isRu: boolean) {
  await ctx.reply(
    isRu ? 'Выберите действие в меню:' : 'Choose an action in the menu:',
    Markup.keyboard([
      [Markup.button.text(isRu ? level104.ru : level104.en)],
    ]).resize()
  )
}
