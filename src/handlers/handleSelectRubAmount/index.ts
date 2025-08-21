import { Context, Markup } from 'telegraf'
import { rubTopUpOptions, getDynamicRubTopUpOptions } from '@/price/helpers/rubTopUpOptions'
import { ADMIN_IDS_ARRAY } from '@/config'

interface SelectRubParams {
  ctx: Context
  isRu: boolean
}

export async function handleSelectRubAmount({ ctx, isRu }: SelectRubParams) {
  try {
    // Получаем динамические пакеты пополнения с fallback на статические
    const topUpOptions = await getDynamicRubTopUpOptions()
    
    // Создаем массив рядов, где каждый ряд содержит одну кнопку
    const inlineKeyboardRows = topUpOptions.map(option => [
      Markup.button.callback(
        `💰 ${option.amountRub} ₽ (~${option.stars}⭐️)`,
        `top_up_rub_${option.amountRub}`
      ),
    ])

    // Добавляем тестовую кнопку "1 рубль" для админов
    const userId = ctx.from?.id
    if (userId && ADMIN_IDS_ARRAY.includes(userId)) {
      // Добавляем кнопку в самый верх для админов
      inlineKeyboardRows.unshift([
        Markup.button.callback(
          isRu ? '🧪 1 ₽ (Админ-тест)' : '🧪 1 RUB (Admin Test)',
          'top_up_rub_1'
        ),
      ])
    }

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
