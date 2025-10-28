import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { starAmounts } from '@/price/helpers/starAmounts'
// import { BuyParams } from '../handleBuy/index' // Убираем старый импорт
import { logger } from '@/utils/enhancedLogger'
import { ADMIN_IDS_ARRAY } from '@/config'

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
  logger.debug(
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

    const callerId = ctx.from?.id
    if (callerId && ADMIN_IDS_ARRAY.includes(callerId)) {
      logger.info('[handleSelectStars] Adding 1-star admin test button', {
        telegram_id: callerId,
      })
      buttons.unshift([
        Markup.button.callback('⭐️ 1 (Admin Test)', 'top_up_1'),
      ])
    }

    const keyboard = Markup.inlineKeyboard(buttons)

    logger.debug(
      `[handleSelectStars LOG] Sending message with star amount buttons (User: ${ctx.from?.id})`
    )

    await ctx.reply(
      isRu
        ? 'Выберите количество звезд для покупки:'
        : 'Choose the number of stars to buy:',
      keyboard
    )
    logger.debug(
      `[handleSelectStars LOG] Message with buttons sent (User: ${ctx.from?.id})`
    )
  } catch (error) {
    logger.error('Error in handleSelectStars:', error)
    logger.error('❌ [handleSelectStars] Ошибка при отображении выбора звезд', {
      telegram_id: ctx.from?.id,
      error: error instanceof Error ? error.message : String(error),
    })
    await ctx.reply(
      isRu ? 'Ошибка при выборе звезд.' : 'Error selecting stars.'
    )
  }
}
