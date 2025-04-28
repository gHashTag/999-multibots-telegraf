import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'
import { cancelHelpArray } from '@/menu/cancelHelpArray'

export function createHelpCancelKeyboard(
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> {
  return Markup.keyboard(cancelHelpArray(isRu)).resize()
}
