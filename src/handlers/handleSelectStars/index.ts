import { Context } from 'telegraf'

interface BuyParams {
  ctx: Context
  starAmounts: number[]
  isRu: boolean
}

export async function handleSelectStars({ ctx, starAmounts, isRu }: BuyParams) {
  try {
    const inlineKeyboard = []
    for (let i = 0; i < starAmounts.length; i += 3) {
      const row = [
        {
          text: isRu ? `${starAmounts[i]}⭐️` : `${starAmounts[i]}⭐️`,
          callback_data: `top_up_${starAmounts[i]}`,
        },
      ]

      if (starAmounts[i + 1] !== undefined) {
        row.push({
          text: isRu ? `${starAmounts[i + 1]}⭐️` : `${starAmounts[i + 1]}⭐️`,
          callback_data: `top_up_${starAmounts[i + 1]}`,
        })
      }

      if (starAmounts[i + 2] !== undefined) {
        row.push({
          text: isRu ? `${starAmounts[i + 2]}⭐️` : `${starAmounts[i + 2]}⭐️`,
          callback_data: `top_up_${starAmounts[i + 2]}`,
        })
      }

      inlineKeyboard.push(row)
    }

    await ctx.reply(
      isRu
        ? 'Выберите количество звезд для покупки:'
        : 'Choose the number of stars to buy:',
      {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      }
    )
  } catch (error) {
    console.error('Error in handleSelectStars:', error)
    throw error
  }
}
