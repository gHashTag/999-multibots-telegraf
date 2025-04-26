import { Markup } from 'telegraf'
import { type MyContext } from '@/interfaces'
import { starAmounts } from '@/price/helpers/starAmounts'
// import { BuyParams } from '../handleBuy/index' // Убираем старый импорт
import { logger } from '@/utils/logger'

// Создаем новый интерфейс для параметров этой функции
interface SelectStarsParams {
  ctx: MyContext
  starAmounts: number[]
  isRu: boolean
}

export async function handleSelectStars({
  ctx,
  starAmounts,
  isRu,
}: SelectStarsParams) {
  console.log(
    `[handleSelectStars LOG] === ENTER Function === (User: ${ctx.from?.id})`
  )
  logger.info('🌟 [handleSelectStars] Начало выбора звезд', {
    telegram_id: ctx.from?.id,
    language: isRu ? 'ru' : 'en',
  })
  try {
    const buttons = starAmounts.map(amount => [
      Markup.button.callback(`⭐️ ${amount}`, `top_up_${amount}`),
    ])

    const keyboard = Markup.inlineKeyboard(buttons)

    console.log(
      `[handleSelectStars LOG] Sending message with star amount buttons (User: ${ctx.from?.id})`
    )

    await ctx.reply(
      isRu
        ? 'Выберите количество звезд для покупки:'
        : 'Choose the number of stars to buy:',
      keyboard
    )
    console.log(
      `[handleSelectStars LOG] Message with buttons sent (User: ${ctx.from?.id})`
    )
  } catch (error) {
    console.error('Error in handleSelectStars:', error)
    logger.error('❌ [handleSelectStars] Ошибка при отображении выбора звезд', {
      telegram_id: ctx.from?.id,
      error: error instanceof Error ? error.message : String(error),
    })
    await ctx.reply(
      isRu ? 'Ошибка при выборе звезд.' : 'Error selecting stars.'
    )
  }
}
