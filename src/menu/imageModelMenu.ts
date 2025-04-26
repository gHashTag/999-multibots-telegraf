import { Markup } from 'telegraf'
import { type MyContext /*, type ModelsConfig*/ } from '@/interfaces'
import { imageModelPrices } from '@/price/models/imageModelPrices'
import type { ReplyKeyboardMarkup } from 'telegraf/types'
import { levels } from './mainMenu'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'

export async function imageModelMenu(
  ctx: MyContext
): Promise<Markup.Markup<ReplyKeyboardMarkup>> {
  const isRu = ctx.from?.language_code === 'ru'

  // Фильтруем модели
  const filteredModels = Object.values(imageModelPrices).filter(
    model =>
      !model.inputType.includes('dev') &&
      (model.inputType.includes('text') ||
        (model.inputType.includes('text') && model.inputType.includes('image')))
  )

  // Создаем массив кнопок
  const modelButtons = filteredModels.map(model =>
    Markup.button.text(model.shortName)
  )

  // Разбиваем кнопки на строки
  const keyboardButtons = []
  for (let i = 0; i < modelButtons.length; i += 2) {
    keyboardButtons.push(modelButtons.slice(i, i + 2))
  }

  // Добавляем кнопки "Справка" и "Главное меню" используя levels
  keyboardButtons.push([
    Markup.button.text(isRu ? levels[106].title_ru : levels[106].title_en),
    Markup.button.text(isRu ? levels[104].title_ru : levels[104].title_en),
  ])

  // Клавиатура с моделями и навигацией
  const keyboard = Markup.keyboard(keyboardButtons).resize().oneTime()
  return keyboard
}
