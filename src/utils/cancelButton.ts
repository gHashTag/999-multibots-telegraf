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
  console.log('🔍 [handleCancelButton] Called', {
    hasMessage: !!ctx.message,
    messageType: ctx.message ? Object.keys(ctx.message) : 'no message',
    telegramId: ctx.from?.id,
  })

  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text?.toLowerCase()

    console.log('🔍 [handleCancelButton] Text received:', {
      originalText: ctx.message.text,
      lowerText: text,
      telegramId: ctx.from?.id,
    })

    if (text === 'отмена' || text === 'cancel') {
      console.log('✅ [handleCancelButton] CANCEL DETECTED!', {
        telegramId: ctx.from?.id,
        text,
      })

      await ctx.reply(
        text === 'отмена' ? 'Операция отменена.' : 'Operation cancelled.'
      )
      ctx.scene.enter(ModeEnum.MainMenu)
      return true
    } else {
      console.log('❌ [handleCancelButton] Text does not match cancel', {
        text,
        expected: 'отмена or cancel',
      })
    }
  } else {
    console.log('❌ [handleCancelButton] No text message', {
      messageExists: !!ctx.message,
    })
  }
  return false
}
