import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Создает унифицированную кнопку "Отмена" для всех сцен
 * @param isRu - флаг русского языка
 * @returns массив кнопок keyboardMarkup
 */
export function createCancelButton(isRu: boolean) {
  return [
    Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
  ]
}

/**
 * Унифицированная логика обработки кнопки "Отмена"
 * @param ctx - контекст бота
 * @returns boolean - true если была нажата отмена, false если нет
 */
export async function handleCancelButton(ctx: MyContext): Promise<boolean> {
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text?.toLowerCase()

    if (text === 'отмена' || text === 'cancel') {
      await ctx.reply(
        text === 'отмена' ? 'Операция отменена.' : 'Operation cancelled.'
      )
      ctx.scene.enter(ModeEnum.MainMenu)
      return true
    }
  }
  return false
}
