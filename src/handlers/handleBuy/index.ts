import { Context } from 'telegraf'
import { starAmounts } from '@/price/helpers'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { ADMIN_IDS_ARRAY } from '@/config'

export async function handleBuy(ctx: MyContext) {
  const callbackData = (ctx.callbackQuery as any)?.data
  const callerId = ctx.from?.id
  const isRu = isRussian(ctx)

  if (!callbackData) {
    console.error('CASE: handleBuy - Ошибка: callbackData не определен')
    await ctx.answerCbQuery('Произошла ошибка')
    return
  }

  try {
    console.log('CASE: handleBuy - Начало обработки', { callbackData })

    let matchFound = false
    let amountToSend: number | null = null

    if (callbackData === 'top_up_1') {
      console.log('CASE: handleBuy - Обнаружен top_up_1')
      if (callerId && ADMIN_IDS_ARRAY.includes(callerId)) {
        console.log('CASE: handleBuy - Пользователь админ, разрешаем 1 звезду')
        matchFound = true
        amountToSend = 1
      } else {
        console.warn(
          'CASE: handleBuy - Не-админ попытался использовать top_up_1',
          { callerId }
        )
        await ctx.answerCbQuery('Действие недоступно')
        return
      }
    } else {
      for (const amount of starAmounts) {
        if (callbackData.endsWith(`top_up_${amount}`)) {
          console.log(
            `CASE: handleBuy - Найдено совпадение для amount=${amount}`
          )
          matchFound = true
          amountToSend = amount
          break
        }
      }
    }

    if (matchFound && amountToSend !== null) {
      try {
        console.log('CASE: handleBuy - Отправляем invoice для', amountToSend)
        await ctx.replyWithInvoice({
          title: `${amountToSend} ⭐️${amountToSend === 1 ? ' (Admin Test)' : ''}`,
          description: isRu
            ? `💬 Получите ${amountToSend} звезд.`
            : `💬 Get ${amountToSend} stars.`,
          payload: `${amountToSend}_${Date.now()}`,
          currency: 'XTR',
          prices: [
            {
              label: isRu ? 'Цена' : 'Price',
              amount: amountToSend,
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
