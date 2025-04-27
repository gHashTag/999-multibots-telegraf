import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'

export const cancelMenu = (isRu: boolean): Markup.Markup<ReplyKeyboardMarkup> =>
  Markup.keyboard([[Markup.button.text(isRu ? 'Отмена' : 'Cancel')]]).resize()
