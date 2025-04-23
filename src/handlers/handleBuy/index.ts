import { Context } from 'telegraf'
import { starAmounts } from '@/price/helpers'
interface BuyParams {
  ctx: Context
  data: string
  isRu: boolean
}

export async function handleBuy({ ctx, data, isRu }: BuyParams) {
  try {
    console.log('CASE: handleBuy - Начало обработки', { data })

    let matchFound = false

    for (const amount of starAmounts) {
      if (data.endsWith(`top_up_${amount}`)) {
        console.log(`CASE: handleBuy - Найдено совпадение для amount=${amount}`)
        matchFound = true

        try {
          console.log('CASE: handleBuy - Отправляем invoice для', amount)
          await ctx.replyWithInvoice({
            title: `${amount} ⭐️`,
            description: isRu
              ? `💬 Получите ${amount} звезд.\nИспользуйте звезды для различных функций нашего бота и наслаждайтесь новыми возможностями!`
              : `💬 Get ${amount} stars.\nUse stars for various functions of our bot and enjoy new opportunities!`,
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
          console.log('CASE: handleBuy - Invoice успешно отправлен')
        } catch (invoiceError) {
          console.error(
            'CASE: handleBuy - Ошибка при отправке invoice:',
            invoiceError
          )
          throw invoiceError
        }

        return
      }
    }
    //
    if (!matchFound) {
      console.warn('CASE: handleBuy - Не найдено совпадений для data:', data)
      console.warn(
        'CASE: handleBuy - Доступные значения starAmounts:',
        starAmounts
      )
    }
  } catch (error) {
    console.error('CASE: handleBuy - Общая ошибка:', error)
    throw error
  }
}
