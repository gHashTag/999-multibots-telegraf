import { Context } from 'telegraf'
import { starAmounts } from '@/price/helpers'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'

export async function handleBuy(ctx: MyContext) {
  const callbackData = (ctx.callbackQuery as any)?.data
  const isRu = isRussian(ctx)

  if (!callbackData) {
    console.error('CASE: handleBuy - Ошибка: callbackData не определен')
    await ctx.answerCbQuery('Произошла ошибка')
    return
  }

  try {
    console.log('CASE: handleBuy - Начало обработки', { callbackData })

    let matchFound = false

    for (const amount of starAmounts) {
      if (callbackData.endsWith(`top_up_${amount}`)) {
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
          await ctx.answerCbQuery()
        } catch (invoiceError) {
          console.error(
            'CASE: handleBuy - Ошибка при отправке invoice:',
            invoiceError
          )
          await ctx.answerCbQuery('Ошибка при создании счета')
        }
        return
      }
    }
    //
    if (!matchFound) {
      console.warn(
        'CASE: handleBuy - Не найдено совпадений для callbackData:',
        callbackData
      )
      console.warn(
        'CASE: handleBuy - Доступные значения starAmounts:',
        starAmounts
      )
      await ctx.answerCbQuery('Неизвестное действие')
    }
  } catch (error) {
    console.error('CASE: handleBuy - Общая ошибка:', error)
    try {
      await ctx.answerCbQuery('Произошла внутренняя ошибка')
    } catch (cbError) {
      console.error(
        'CASE: handleBuy - Ошибка при ответе на callbackQuery в catch блоке',
        cbError
      )
    }
  }
}
