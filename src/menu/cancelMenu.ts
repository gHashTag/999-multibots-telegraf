import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types';import type { Message, Update } from "telegraf/types"

export const cancelMenu = (isRu: boolean): Markup.Markup<ReplyKeyboardMarkup> =>
  Markup.keyboard([[Markup.button.text(isRu ? 'Отмена' : 'Cancel')]]).resize()
