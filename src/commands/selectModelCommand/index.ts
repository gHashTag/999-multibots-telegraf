import { Markup } from 'telegraf'
import { type MyContext } from '../../interfaces'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'

import { getAvailableModels } from './getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'

// Функция для получения доступных моделей
export async function selectModelCommand(ctx: MyContext) {
  const isRu = ctx.from?.language_code === 'ru'

  try {
    const models: string[] = await getAvailableModels()

    // Создаем инлайн-кнопки
    const buttons = models.map(modelId => {
      // Получаем расчетную цену в звездах
      const priceInStars = calculateFinalPrice(modelId)
      // Формируем текст кнопки (используем ID модели, так как title нет)
      const buttonText = `${modelId} (${priceInStars}⭐)`
      // Возвращаем кнопку для Markup
      return Markup.button.callback(buttonText, `select_model_${modelId}`)
    })

    // Разбиваем кнопки на строки по 2
    const rows = []
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2))
    }

    // Добавляем кнопку отмены
    rows.push([Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel')])

    // Создаем инлайн-клавиатуру
    const keyboard = Markup.inlineKeyboard(rows)

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
