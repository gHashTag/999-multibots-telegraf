import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { getUserInfo } from '@/handlers/getUserInfo'

/**
 * Команда /price и кнопка "Цены"
 * Отображает информацию о ценах на различные услуги бота
 */
export const priceCommand = async (ctx: MyContext) => {
  try {
    const { telegramId } = getUserInfo(ctx)
    const isRu = ctx.from?.language_code === 'ru'

    logger.info({
      message: '💰 [priceCommand] Запрос информации о ценах',
      telegramId,
      function: 'priceCommand',
    })

    // Формируем сообщение о ценах в зависимости от языка пользователя
    const priceMessage = isRu
      ? `
💰 *Цены на услуги NeuroBlogger*

*🌟 Звёздочки (Stars):*
• 100 звёзд - 300 ₽
• 500 звёзд - 1400 ₽
• 1000 звёзд - 2500 ₽

*🔄 Подписки:*
• Стандартная (30 дней) - 2900 ₽/мес
• Премиум (30 дней) - 4900 ₽/мес

*📊 Стоимость услуг (в звёздах):*
• Генерация текста - от 5 звёзд
• Нейрофото - от 10 звёзд
• Аватарки - от 50 звёзд
• Видеоролики - от 100 звёзд

💡 *Совет:* Выгоднее всего оформить подписку!
`
      : `
💰 *NeuroBlogger Pricing*

*🌟 Stars:*
• 100 stars - $5
• 500 stars - $20
• 1000 stars - $35

*🔄 Subscriptions:*
• Standard (30 days) - $39/month
• Premium (30 days) - $69/month

*📊 Service Costs (in stars):*
• Text generation - from 5 stars
• Neural photos - from 10 stars
• Avatars - from 50 stars
• Video clips - from 100 stars

💡 *Tip:* Subscription is the most cost-effective option!
`

    // Создаем кнопки для пополнения баланса и оформления подписки
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '💎 Пополнить баланс' : '💎 Top up balance',
          'top_up_balance'
        ),
        Markup.button.callback(
          isRu ? '💫 Оформить подписку' : '💫 Subscribe',
          'subscribe'
        ),
      ],
    ])

    // Отправляем сообщение с информацией о ценах и кнопками
    await ctx.replyWithMarkdown(priceMessage, keyboard)

    logger.info({
      message: '✅ [priceCommand] Информация о ценах успешно отправлена',
      telegramId,
      function: 'priceCommand',
    })
  } catch (error) {
    console.error('❌ [priceCommand] Ошибка при отображении цен:', error)
    logger.error({
      message: '❌ [priceCommand] Ошибка при отображении цен',
      error,
      function: 'priceCommand',
    })

    const isRu = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при получении информации о ценах. Пожалуйста, попробуйте позже.'
        : 'An error occurred while retrieving price information. Please try again later.'
    )
  }
}
