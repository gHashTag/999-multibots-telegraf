import { MyContext } from '@/interfaces'
import { starAmounts } from '@/price/helpers'

export async function handleBuy(ctx: MyContext) {
  const isRu = ctx.from?.language_code === 'ru'
  try {
    const data = ctx.match?.[0]
    const daysMatch = ctx.match?.[1]

    if (!data || !daysMatch) {
      console.warn('CASE: handleBuy - Не удалось извлечь данные из ctx.match', {
        match: ctx.match,
      })
      await ctx.answerCbQuery('Ошибка обработки запроса.')
      return
    }

    console.log('CASE: handleBuy - Начало обработки', { data, days: daysMatch })

    const days = parseInt(daysMatch, 10)
    if (isNaN(days)) {
      console.warn('CASE: handleBuy - Некорректное количество дней:', daysMatch)
      await ctx.answerCbQuery('Ошибка: некорректное количество дней.')
      return
    }

    let matchFound = false
    for (const amount of starAmounts) {
      if (days === amount) {
        console.log(
          `CASE: handleBuy - Найдено (некорректное?) совпадение для amount=${amount} (извлекли как days=${days})`
        )
        matchFound = true

        try {
          console.log('CASE: handleBuy - Отправляем invoice для', amount)
          await ctx.replyWithInvoice({
            title: `${amount} ⭐️`,
            description: isRu
              ? `�� Получите ${amount} звезд.\nИспользуйте звезды для различных функций нашего бота и наслаждайтесь новыми возможностями!`
              : `💬 Get ${amount} stars.\nUse stars for various functions of our bot and enjoy new opportunities!`,
            payload: `${amount}_${Date.now()}`,
            currency: 'XTR',
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
          try {
            await ctx.answerCbQuery(
              isRu ? 'Ошибка отправки счета' : 'Invoice sending error'
            )
          } catch {
            /* ignore */
          }
        }

        return
      }
    }

    if (!matchFound) {
      console.warn(
        'CASE: handleBuy - Не найдено совпадений для извлеченного amount (days):',
        days
      )
      console.warn(
        'CASE: handleBuy - Доступные значения starAmounts:',
        starAmounts
      )
      await ctx.answerCbQuery(
        isRu ? 'Опция покупки не найдена' : 'Purchase option not found'
      )
    }
  } catch (error) {
    console.error('CASE: handleBuy - Общая ошибка:', error)
    try {
      await ctx.answerCbQuery(isRu ? 'Внутренняя ошибка' : 'Internal error')
    } catch {
      /* ignore */
    }
  }
}
