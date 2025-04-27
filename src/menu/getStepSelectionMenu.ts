import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'

export function getStepSelectionMenu(
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> {
  return Markup.keyboard([
    [
      Markup.button.text(isRu ? '1000 шагов' : '1000 steps'),
      Markup.button.text(isRu ? '1500 шагов' : '1500 steps'),
      Markup.button.text(isRu ? '2000 шагов' : '2000 steps'),
    ],
    [
      Markup.button.text(isRu ? '3000 шагов' : '2500 steps'),
      Markup.button.text(isRu ? '3500 шагов' : '3000 steps'),
      Markup.button.text(isRu ? '4000 шагов' : '3500 steps'),
    ],
    [
      Markup.button.text(isRu ? '5000 шагов' : '4000 steps'),
      Markup.button.text(isRu ? '5500 шагов' : '5000 steps'),
      Markup.button.text(isRu ? '6000 шагов' : '6000 steps'),
    ],
    [
      Markup.button.text(isRu ? 'Справка по команде' : 'Help for the command'),
      Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
    ],
  ])
    .resize()
    .oneTime()
}
