import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { handleMenu } from '@/handlers'
import { getTranslation } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { ModeEnum } from '@/interfaces/modes'
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { SubscriptionType } from '@/interfaces/subscription.interface'

type Subscription = 'neurophoto' | 'neurobase'

export function isValidPaymentSubscription(
  value: string
): value is Subscription {
  return ['neurobase', 'neurophoto', 'neurotester'].includes(value)
}

export const subscriptionScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.SubscriptionScene,
  async ctx => {
    console.log('CASE: subscriptionScene', ctx)
    const isRu = isRussian(ctx)
    const { translation, buttons } = await getTranslation(
      'subscriptionScene',
      ctx,
      ctx.botInfo?.username
    )
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

    ctx.session.buttons = buttons

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

    cleanedKeyboardRows.push([
      {
        text: isRu ? '🏠 Главное меню' : '🏠 Main menu',
        callback_data: 'mainmenu',
        remove_keyboard: true,
      },
    ])

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

      // Находим выбранный тариф
      const selectedPayment = paymentOptionsPlans.find(
        option => option.subscription === text
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
            type: subscription,
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
