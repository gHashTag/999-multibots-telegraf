import { Markup } from 'telegraf'
import { MyContext } from '../../interfaces'

import { getAvailableModels } from './getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'

// Функция для получения доступных моделей
export async function selectModelCommand(ctx: MyContext) {
  const isRu = ctx.from?.language_code === 'ru'

  try {
    const models = await getAvailableModels()

    // Создаем кнопки для каждой модели, по 3 в ряд
    const buttons: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < models.length; i += 3) {
      const row: ReturnType<typeof Markup.button.callback>[] = []
      if (models[i]) {
        row.push(Markup.button.callback(models[i], `select_model_${models[i]}`))
      }
      if (models[i + 1]) {
        row.push(
          Markup.button.callback(models[i + 1], `select_model_${models[i + 1]}`)
        )
      }
      if (models[i + 2]) {
        row.push(
          Markup.button.callback(models[i + 2], `select_model_${models[i + 2]}`)
        )
      }
      buttons.push(row)
    }

    buttons.push([Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel')])

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
