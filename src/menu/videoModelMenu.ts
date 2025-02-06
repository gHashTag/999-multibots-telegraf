import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'

export const videoModelKeyboard = (
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> =>
  Markup.keyboard([
    [
      Markup.button.text(isRu ? 'Minimax' : 'Minimax'),
      Markup.button.text(isRu ? 'Haiper' : 'Haiper'),
    ],
    [
      Markup.button.text(isRu ? 'Ray' : 'Ray'),
      Markup.button.text(isRu ? 'I2VGen-XL' : 'I2VGen-XL'),
    ],
    [
      Markup.button.text(isRu ? 'Справка по команде' : 'Help for the command'),
      Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
    ],
  ]).resize()
