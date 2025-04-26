import { type MyContext, type Translation } from '@/interfaces'
import { type KeyboardButton } from 'telegraf/types'
import { Markup } from 'telegraf'
// import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram' // Удаляем старый путь
import type { ReplyKeyboardMarkup } from 'telegraf/types' // Используем правильный путь

export const cancelMenu = (isRu: boolean): Markup.Markup<ReplyKeyboardMarkup> =>
  Markup.keyboard([[Markup.button.text(isRu ? 'Отмена' : 'Cancel')]]).resize()
