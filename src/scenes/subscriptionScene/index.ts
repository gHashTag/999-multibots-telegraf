import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { handleMenu } from '@/handlers'
import { getTranslation, getUserDetailsSubscription } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { ModeEnum } from '@/interfaces/modes'
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { TranslationButton } from '@/interfaces/supabase.interface'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'

// Проверка валидности типа подписки
export function isValidPaymentSubscription(value: string): boolean {
  if (!value) return false

  // Преобразуем искомое значение в верхний регистр ОДИН РАЗ
  const upperValueToFind = value.toUpperCase()

  // Проверяем, существует ли такой тип подписки в наших планах
  for (const plan of paymentOptionsPlans) {
    // Сравниваем строковые представления в верхнем регистре
    if (plan.subscription?.toString().toUpperCase() === upperValueToFind) {
      return true
    }
  }

  // Если цикл завершился, и мы не нашли совпадения
  logger.warn(
    'Unknown subscription type encountered in isValidPaymentSubscription',
    { value }
  )
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

    // Формируем клавиатуру
    const keyboardRows: any[] = []
    buttons.forEach(button => {
      const row = button.row || 0
      if (!keyboardRows[row]) {
        keyboardRows[row] = []
      }

      const showRubles = shouldShowRubles(ctx)
      let buttonText = button.text

      if (!showRubles) {
        if (button.stars_price !== undefined) {
          buttonText += ` - ${button.stars_price} ⭐`
        }
      } else {
        buttonText += ` - ${isRu ? `${button.ru_price} ₽` : `${button.en_price} $`}`
      }

      keyboardRows[row].push(
        Markup.button.callback(buttonText, button.callback_data)
      )
    })

    // Очистка от пустых строк
    const cleanedKeyboardRows = keyboardRows.filter(
      row => row && row.length > 0
    )

    if (cleanedKeyboardRows.length === 0) {
      logger.warn(
        `[${ModeEnum.SubscriptionScene}] No valid buttons generated.`,
        { telegram_id: ctx.from?.id }
      )
    } else {
      const inlineKeyboard = Markup.inlineKeyboard(cleanedKeyboardRows)
      await ctx.reply(translation, {
        reply_markup: inlineKeyboard.reply_markup,
        parse_mode: 'Markdown',
      })
    }

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
