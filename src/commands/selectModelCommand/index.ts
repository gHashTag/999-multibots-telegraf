import { Markup } from 'telegraf'
import { MyContext } from '../../interfaces'

import { getAvailableModels, SelectableModel } from './getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

// Функция для получения доступных моделей
export async function selectModelCommand(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)

  try {
    const models: SelectableModel[] = await getAvailableModels()

    // Создаем кнопки для каждой модели, по 3 в ряд
    const buttons: ReturnType<typeof Markup.button.text>[][] = []
    for (let i = 0; i < models.length; i += 3) {
      const row: ReturnType<typeof Markup.button.text>[] = []
      if (models[i]) {
        row.push(Markup.button.text(models[i].name))
      }
      if (models[i + 1]) {
        row.push(Markup.button.text(models[i + 1].name))
      }
      if (models[i + 2]) {
        row.push(Markup.button.text(models[i + 2].name))
      }
      buttons.push(row)
    }

    const keyboard = Markup.keyboard(buttons).resize()

    await ctx.reply(
      isRu ? '🧠 Выберите модель:' : '🧠 Select AI Model:',
      keyboard
    )

    return
  } catch (error) {
    console.error('Error creating model selection menu:', error)
    await sendGenericErrorMessage(ctx, isRu, error)
  }
}
