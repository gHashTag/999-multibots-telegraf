import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import { cancelHelpArray } from '../'

export function createHelpCancelKeyboard(
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> {
  return Markup.keyboard(cancelHelpArray(isRu)).resize()
}
