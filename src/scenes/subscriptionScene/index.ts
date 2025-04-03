import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { handleMenu } from '@/handlers'
import { getTranslation } from '@/core'
import { isRussian } from '@/helpers'

export const subscriptionScene = new Scenes.WizardScene<MyContext>(
  'subscriptionScene',
  async ctx => {
    console.log('CASE: subscriptionScene', ctx)
    const isRu = isRussian(ctx)
    const { translation, buttons } = await getTranslation({
      key: 'subscriptionScene',
      ctx,
    })
    console.log('buttons!!!', buttons)

    // Проверяем, является ли пользователь администратором
    const adminIds = process.env.ADMIN_IDS
      ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10))
      : []

    // Добавляем тестовый план для администраторов
    if (adminIds.includes(ctx.from.id)) {
      buttons.push({
        row: 4, // Укажите номер строки, где хотите разместить тестовый план
        text: '🧪 Тест', // Название тестового плана
        en_price: 1, // Тестовая цена в долларах
        ru_price: 1, // Тестовая цена в рублях
        description: 'Тестовый план для проверки функционала.',
        stars_price: 1, // Количество звезд для тестового плана
        callback_data: 'neurotester', // Уникальный идентификатор для тестового плана
      })
    }

    ctx.session.buttons = buttons

    // Формируем клавиатуру на основе кнопок
    const keyboardRows = []
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
      if (text === 'neurobase') {
        console.log('CASE: 📚 НейроБаза')
        ctx.session.subscription = 'neurobase'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neuromeeting') {
        console.log('CASE: 🧠 НейроВстреча')
        ctx.session.subscription = 'neuromeeting'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neuroblogger') {
        console.log('CASE: 🤖 НейроБлогер')
        ctx.session.subscription = 'neuroblogger'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neurophoto') {
        console.log('CASE: 🎨 НейроФото')
        ctx.session.subscription = 'neurophoto'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neuromentor') {
        console.log('CASE: 🧠 НейроМентор')
        ctx.session.subscription = 'neuromentor'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neurotester') {
        console.log('CASE: 🧪 Тестовый план')
        ctx.session.subscription = 'neurotester'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'mainmenu') {
        console.log('CASE: 🏠 Главное меню')
        return ctx.scene.enter('menuScene')
      } else {
        console.warn('Unknown subscription type:', text)
        await ctx.reply(
          'Неизвестный тип подписки. Пожалуйста, выберите другой вариант.'
        )
      }
    } else {
      handleMenu(ctx)
      return ctx.scene.leave()
    }
  }
)
