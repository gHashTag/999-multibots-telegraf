import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { handleMenu } from '@/handlers'
import { getTranslation } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { ModeEnum } from '@/interfaces/modes'

import { isValidPaymentSubscription } from '@/interfaces/payments.interface'
import { LocalSubscription } from '@/scenes/getRuBillWizard'
import { TranslationButton } from '@/interfaces/supabase.interface'

interface KeyboardButton {
  text: string
  callback_data: string
  remove_keyboard: boolean
}

export const subscriptionScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.SubscriptionScene,
  async ctx => {
    console.log('CASE: subscriptionScene', ctx)
    const isRu = isRussian(ctx)
    const { translation, buttons } = await getTranslation(
      'subscriptionScene',
      ctx,
      undefined
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
    const buttonsWithAdmin: TranslationButton[] = [...(buttons || [])]
    if (adminIds.includes(parseInt(telegramId))) {
      buttonsWithAdmin.push({
        row: 4,
        text: '🧪 Тест',
        en_price: 1,
        ru_price: 1,
        description: 'Тестовый план для проверки функционала.',
        stars_price: 1,
        callback_data: 'neurotester',
      })
    }

    // Store buttons in session for later use
    ctx.session.buttons = buttonsWithAdmin

    // Формируем клавиатуру на основе кнопок
    const keyboardRows: KeyboardButton[][] = []
    buttonsWithAdmin.forEach(button => {
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
    //
    cleanedKeyboardRows.push([
      {
        text: isRu ? '🏠 Главное меню' : '🏠 Main menu',
        callback_data: 'mainmenu',
        remove_keyboard: true,
      },
    ])

    // Отправляем сообщение с клавиатурой
    await ctx.reply(translation, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(cleanedKeyboardRows),
    })

    return ctx.wizard.next()
  },
  async (ctx: MyContext) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      await ctx.reply('❌ Invalid callback query')
      return ctx.scene.leave()
    }

    const data = ctx.callbackQuery.data
    if (data === 'mainmenu') {
      await handleMenu(ctx)
      return ctx.scene.leave()
    }

    const selectedButton = ctx.session.buttons?.find(
      (button: TranslationButton) => button.callback_data === data
    )

    if (!selectedButton) {
      await ctx.reply('❌ Invalid subscription option')
      return ctx.scene.leave()
    }

    const isRu = isRussian(ctx)
    const price = isRu ? selectedButton.ru_price : selectedButton.en_price

    // Store the full subscription details in the session
    ctx.session.selectedPayment = {
      amount: price,
      stars: selectedButton.stars_price,
      subscription: data as LocalSubscription,
    }

    if (!isValidPaymentSubscription(data as LocalSubscription)) {
      await ctx.reply('❌ Invalid subscription data')
      return ctx.scene.leave()
    }

    await ctx.scene.enter('getRuBillWizard')
  }
)
