import type { Context } from 'telegraf'
import { Markup } from 'telegraf'
import { rubTopUpOptions } from '@/price/helpers/rubTopUpOptions'

interface SelectRubParams {
  ctx: Context
  isRu: boolean
}

export async function handleSelectRubAmount({ ctx, isRu }: SelectRubParams) {
  try {
    // Создаем массив рядов, где каждый ряд содержит одну кнопку
    const inlineKeyboardRows = rubTopUpOptions.map(option => [
      Markup.button.callback(
        `💰 ${option.amountRub} ₽ (~${option.stars}⭐️)`,
        `top_up_rub_${option.amountRub}`
      ),
    ])

    await ctx.reply(
      isRu
        ? 'Выберите сумму пополнения в рублях:'
        : 'Choose the top-up amount in rubles:',
      // Передаем массив рядов, где каждый ряд - одна кнопка
      Markup.inlineKeyboard(inlineKeyboardRows)
    )
  } catch (error) {
    console.error('Error in handleSelectRubAmount:', error)
    throw error
  }
}
