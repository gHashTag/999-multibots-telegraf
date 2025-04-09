import { MyContext } from '@/types'

interface BuyParams {
  ctx: MyContext
  isRu: boolean
}

export async function handleBuySubscription({ ctx, isRu }: BuyParams) {
  try {
    const subscriptionType = ctx.session.subscription
    console.log('🔔 subscriptionType', subscriptionType)

    const selectedButton = ctx.session.buttons.find(
      button => button.callback_data === ctx.session.subscription
    )
    console.log('🔔 selectedButton', selectedButton)

    if (!selectedButton) {
      console.error('❌ Кнопка для подписки не найдена:', subscriptionType)
      await ctx.reply(
        isRu
          ? 'Ошибка: тип подписки не найден.'
          : 'Error: subscription type not found.'
      )
      return
    }

    const amount = selectedButton.stars_price
    console.log('🔔 amount', amount)

    const title = selectedButton.text || `${amount} ⭐️`
    const description =
      selectedButton.description ||
      (isRu
        ? `💬 Получите ${amount} звезд.\nИспользуйте звезды для различных функций нашего бота и наслаждайтесь новыми возможностями!`
        : `💬 Get ${amount} stars.\nUse stars for various functions of our bot and enjoy new opportunities!`)

    await ctx.replyWithInvoice({
      title,
      description,
      payload: `${amount}_${Date.now()}`,
      currency: 'XTR', // Pass "XTR" for payments in Telegram Stars.
      prices: [
        {
          label: isRu ? 'Цена' : 'Price',
          amount: amount,
        },
      ],
      provider_token: '',
    })

    return
  } catch (error) {
    console.error('❌ Error in handleBuySubscription:', error)
    throw error
  }
}
