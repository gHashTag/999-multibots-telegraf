import { Context } from 'telegraf'
import { starAmounts } from '@/price/helpers'
interface BuyParams {
  ctx: Context
  data: string
  isRu: boolean
}

export async function handleBuy({ ctx, data, isRu }: BuyParams) {
  try {
    for (const amount of starAmounts) {
      if (data.endsWith(`top_up_${amount}`)) {
        await ctx.replyWithInvoice({
          title: `${amount} ⭐️`,
          description: isRu
            ? `💬 Получите ${amount} звезд.\nИспользуйте звезды для различных функций нашего бота и наслаждайтесь новыми возможностями!`
            : `💬 Get ${amount} stars.\nUse stars for various functions of our bot and enjoy new opportunities!`,
          payload: `${amount}_${Date.now()}`,
          currency: 'XTR', // Pass “XTR” for payments in Telegram Stars.
          prices: [
            {
              label: isRu ? 'Цена' : 'Price',
              amount: amount,
            },
          ],
          provider_token: '',
        })

        return
      }
    }
  } catch (error) {
    console.error('Error in handleBuy:', error)
    throw error
  }
}
