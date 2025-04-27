import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { imageModelPrices } from '@/price/models'

export async function imageModelMenu(ctx: MyContext) {
  const isRu = ctx.from?.language_code === 'ru'

  // Фильтруем модели, исключая те, у которых есть 'dev' в inputType
  // и оставляем только те, у которых есть 'text' или 'text' и 'image'
  const filteredModels = Object.values(imageModelPrices).filter(
    model =>
      !model.inputType.includes('dev') &&
      (model.inputType.includes('text') ||
        (model.inputType.includes('text') && model.inputType.includes('image')))
  )

  // Создаем массив кнопок на основе shortName отфильтрованных моделей
  const modelButtons = filteredModels.map(model =>
    Markup.button.text(model.shortName)
  )

  // Разбиваем кнопки на строки по 2 кнопки в каждой
  const keyboardButtons = []
  for (let i = 0; i < modelButtons.length; i += 2) {
    keyboardButtons.push(modelButtons.slice(i, i + 2))
  }

  // Добавляем кнопки "Отмена" и "Главное меню"
  keyboardButtons.push(
    [
      Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
      Markup.button.text(isRu ? 'Справка по команде' : 'Help for the command'),
    ],
    [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')]
  )

  const keyboard = Markup.keyboard(keyboardButtons).resize().oneTime()

  await ctx.reply(
    isRu
      ? '🎨 Выберите модель для генерации:'
      : '🎨 Choose a model for generation:',
    {
      reply_markup: keyboard.reply_markup,
    }
  )
}
