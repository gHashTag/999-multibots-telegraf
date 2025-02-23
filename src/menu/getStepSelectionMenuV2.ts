import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'

export function getStepSelectionMenuV2(
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> {
  return Markup.keyboard([
    [
      Markup.button.text(isRu ? '100 шагов' : '100 steps'),
      Markup.button.text(isRu ? '200 шагов' : '200 steps'),
      Markup.button.text(isRu ? '300 шагов' : '300 steps'),
    ],
    [
      Markup.button.text(isRu ? '400 шагов' : '400 steps'),
      Markup.button.text(isRu ? '500 шагов' : '500 steps'),
      Markup.button.text(isRu ? '600 шагов' : '600 steps'),
    ],
    [
      Markup.button.text(isRu ? '700 шагов' : '700 steps'),
      Markup.button.text(isRu ? '800 шагов' : '800 steps'),
      Markup.button.text(isRu ? '1000 шагов' : '1000 steps'),
    ],
    [
      Markup.button.text(isRu ? 'Справка по команде' : 'Help for the command'),
      Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
    ],
  ])
    .resize()
    .oneTime()
}
