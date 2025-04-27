import { Markup, Scenes } from 'telegraf'
import type { Update } from 'telegraf/types'
import type { MyContext } from '../../interfaces'
import { handleMenu } from '@/handlers'
import { getTranslation } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { ModeEnum } from '@/interfaces/modes';
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import type { TranslationButton } from '@/interfaces/supabase.interface'
import { getUserDetailsSubscription } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'
// Проверка валидности типа подписки
export function isValidPaymentSubscription(value: string): value is string {
  // Преобразуем значение в верхний регистр для сравнения с SubscriptionType
  const upperValue = value.toUpperCase()

  // Проверяем по значению перечисления
  for (const plan of paymentOptionsPlans) {
    // Проверяем совпадение с типом подписки
    if (plan.subscription === (upperValue as SubscriptionType)) {
      return true
    }

    // Проверяем callback_data в нижнем регистре (neurophoto, neurobase, и т.д.)
    if (plan.subscription?.toString().toLowerCase() === value.toLowerCase()) {
      return true
    }
  }

  return false
}

export const subscriptionScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.SubscriptionScene,
  async ctx => {
    const userDetails = await getUserDetailsSubscription(
      ctx.from?.id.toString()
    )
    logger.info({
      message: `[SubscriptionScene] User: ${ctx.from?.id}, Mode: ${ModeEnum.CheckBalanceScene}`,
      userDetails,
    })
    const isRu = isRussian(ctx)
    const { translation, buttons } = await getTranslation({
      key: 'subscriptionScene',
      ctx,
      bot_name: ctx.botInfo?.username,
    })
    console.log('buttons!!!', buttons)

    // Проверяем, является ли пользователь администратором
    const adminIds = process.env.ADMIN_IDS
      ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10))
      : []

    const telegramId = ctx.from?.id.toString()
    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить ID пользователя'
          : '❌ Error: User ID not found'
      )
      return ctx.scene.leave()
    }

    // Добавляем тестовый план для администраторов
    if (adminIds.includes(parseInt(telegramId))) {
      buttons?.push({
        row: 4, // Укажите номер строки, где хотите разместить тестовый план
        text: '🧪 Тест', // Название тестового плана
        en_price: 1, // Тестовая цена в долларах
        ru_price: 1, // Тестовая цена в рублях
        description: 'Тестовый план для проверки функционала.',
        stars_price: 1, // Количество звезд для тестового плана
        callback_data: 'neurotester', // Уникальный идентификатор для тестового плана
        subscription: SubscriptionType.NEUROTESTER,
      })
    }

    ctx.session.buttons = buttons as TranslationButton[]

    if (!buttons) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить кнопки'
          : '❌ Error: Buttons not found'
      )
      return ctx.scene.leave()
    }

    // Формируем клавиатуру на основе кнопок
    const keyboardRows: any[] = []
    buttons.forEach(button => {
      const row = button.row || 0
      if (!keyboardRows[row]) {
        keyboardRows[row] = []
      }
      const text = `${button.text} - ${
        isRu ? `${button.ru_price} ₽` : `${button.en_price} $`
      }`

      keyboardRows[row].push({
        text,
        callback_data: button.callback_data,
        remove_keyboard: true,
      })
    })

    // Очистка от пустых элементов
    const cleanedKeyboardRows = keyboardRows.filter(
      row => row && row.length > 0
    )

    const inlineKeyboard = Markup.inlineKeyboard(cleanedKeyboardRows)

    await ctx.reply(translation, {
      reply_markup: inlineKeyboard.reply_markup,
      parse_mode: 'Markdown',
    })

    return ctx.wizard.next()
  },
  async (ctx: MyContext) => {
    console.log('CASE: subscriptionScene.next', ctx)
    if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
      const text = ctx.update.callback_query.data
      console.log('text', text)

      // Находим выбранный тариф, учитывая регистр callback_data
      const selectedPayment = paymentOptionsPlans.find(
        option =>
          option.subscription === (text as SubscriptionType) ||
          option.subscription?.toString().toLowerCase() === text.toLowerCase()
      )

      if (selectedPayment && selectedPayment.subscription) {
        console.log('Selected payment option:', selectedPayment)
        const subscription = selectedPayment.subscription
        if (isValidPaymentSubscription(subscription)) {
          ctx.session.subscription = subscription
          ctx.session.selectedPayment = {
            amount: selectedPayment.amount,
            stars: Number(selectedPayment.stars),
            subscription: subscription as SubscriptionType,
            type: PaymentType.MONEY_INCOME,
          }
          return ctx.scene.enter(ModeEnum.PaymentScene)
        } else {
          console.warn(
            'Subscription type not supported for payment:',
            subscription
          )
          const isRu = isRussian(ctx)
          await ctx.reply(
            isRu
              ? 'Этот тип подписки не поддерживает оплату. Пожалуйста, выберите другой вариант.'
              : 'This subscription type does not support payment. Please select another option.'
          )
        }
      } else if (text === 'mainmenu') {
        console.log('CASE: 🏠 Главное меню')
        return ctx.scene.enter(ModeEnum.MainMenu)
      } else {
        console.warn('Unknown subscription type:', text)
        const isRu = isRussian(ctx)
        await ctx.reply(
          isRu
            ? 'Неизвестный тип подписки. Пожалуйста, выберите другой вариант.'
            : 'Unknown subscription type. Please select another option.'
        )
      }
    } else {
      handleMenu(ctx)
      return ctx.scene.leave()
    }
  }
)
