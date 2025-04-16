import { Context } from 'telegraf'
import { PaymentOption } from '@/price/priceCalculator'

interface BuyParams {
  ctx: Context
  isRu: boolean
  paymentOptions: PaymentOption[]
}

export async function handleSelectStars({
  ctx,
  isRu,
  paymentOptions,
}: BuyParams) {
  try {
    const inlineKeyboard = []

    // Создаем кнопки для покупки звезд
    for (let i = 0; i < paymentOptions.length; i += 2) {
      const row = [
        {
          text: isRu
            ? `${paymentOptions[i].amount}₽ → ${paymentOptions[i].stars}⭐️`
            : `${paymentOptions[i].amount}₽ → ${paymentOptions[i].stars}⭐️`,
          callback_data: `pay_rub_${paymentOptions[i].amount}_${paymentOptions[i].stars}`,
        },
      ]

      if (paymentOptions[i + 1]) {
        row.push({
          text: isRu
            ? `${paymentOptions[i + 1].amount}₽ → ${paymentOptions[i + 1].stars}⭐️`
            : `${paymentOptions[i + 1].amount}₽ → ${paymentOptions[i + 1].stars}⭐️`,
          callback_data: `pay_rub_${paymentOptions[i + 1].amount}_${paymentOptions[i + 1].stars}`,
        })
      }

      inlineKeyboard.push(row)
    }

    // Добавляем кнопку возврата
    inlineKeyboard.push([
      {
        text: isRu ? '🔙 Назад' : '🔙 Back',
        callback_data: 'back_to_payment',
      },
    ])

    await ctx.reply(
      isRu
        ? '💰 Выберите сумму пополнения в рублях:'
        : '💰 Choose the amount to top up in rubles:',
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
