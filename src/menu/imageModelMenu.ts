import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { imageModelPrices } from '@/pricing/models/imageModelPrices'
import { calculateFinalStarPrice } from '@/pricing/calculator'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

export async function imageModelMenu(ctx: MyContext) {
  const isRu = ctx.from?.language_code === 'ru'

  const availableModels = Object.entries(imageModelPrices)
    .filter(([, model]) => {
      const modelInfo = model as { inputType: string[]; shortName: string }
      return (
        !modelInfo.inputType.includes('dev') &&
        (modelInfo.inputType.includes('text') ||
          (modelInfo.inputType.includes('text') &&
            modelInfo.inputType.includes('image')))
      )
    })
    .map(([modelId, model]) => {
      const modelInfo = model as { shortName: string }
      let priceText = 'N/A'
      try {
        const costResult = calculateFinalStarPrice(ModeEnum.TextToImage, {
          modelId,
        })
        if (costResult) {
          priceText = `${costResult.stars} ⭐`
        }
      } catch (error) {
        logger.error('Error calculating price for image model button:', {
          modelId,
          modelInfo,
          error,
        })
        priceText = 'Error'
      }
      return Markup.button.text(`${modelInfo.shortName} (${priceText})`)
    })

  // Разбиваем кнопки на строки по 2 кнопки в каждой
  const keyboardButtons = []
  for (let i = 0; i < availableModels.length; i += 2) {
    keyboardButtons.push(availableModels.slice(i, i + 2))
  }

  // Добавляем кнопки "Отмена" и "Главное меню"
  keyboardButtons.push(
    [
      Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
      Markup.button.callback(isRu ? '❓ Справка' : '❓ Help', 'go_help'),
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
